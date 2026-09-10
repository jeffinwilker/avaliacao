import {
  buildCatalog,
  findMatchesFast,
  normalize,
} from "@/lib/match";
import type { NuvemshopProduct, NuvemshopVariant } from "@/lib/nuvemshop";

export const MAX_COLOR_IMPORT_ROWS = 5000;

export interface ColorImportInput {
  rowNumber: number;
  productName: string;
  externalProductId: string;
  sku: string;
  color: string;
  newSku?: string;
  variantId?: string;
  variation?: string;
  overrideExternalProductId?: string;
}

export type ColorPreviewStatus =
  | "ready"
  | "unchanged"
  | "review"
  | "blocked"
  | "duplicate";

export interface ColorPreviewCandidate {
  externalProductId: string;
  name: string;
  imageUrl: string | null;
  score: number;
}

export interface ColorPreviewRow extends ColorImportInput {
  productExternalId: string | null;
  matchedProductName: string | null;
  productImageUrl: string | null;
  matchMethod: "override" | "id" | "sku" | "name" | "similar" | null;
  matchScore: number;
  status: ColorPreviewStatus;
  message: string;
  currentColors: string[];
  colorAttributeIndex: number;
  candidates: ColorPreviewCandidate[];
  variantExternalId: string | null;
  variantLabel: string;
  currentSku: string;
  variantOptions: Array<{ id: string; label: string; sku: string }>;
  updateColor: boolean;
  updateSku: boolean;
}

interface ProductSafety {
  status: "ready" | "unchanged" | "blocked";
  message: string;
  currentColors: string[];
  colorAttributeIndex: number;
}

interface ProductMatch {
  product: NuvemshopProduct | null;
  method: ColorPreviewRow["matchMethod"];
  score: number;
  candidates: ColorPreviewCandidate[];
  ambiguousMessage?: string;
}

export function buildColorImportPreview(
  inputRows: ColorImportInput[],
  products: NuvemshopProduct[]
): ColorPreviewRow[] {
  const indexes = buildProductIndexes(products);

  const rows = inputRows.slice(0, MAX_COLOR_IMPORT_ROWS).map((input) => {
    const clean = sanitizeInput(input);
    if (!clean.color && !clean.newSku) {
      return previewWithoutProduct(clean, "unchanged", "Linha ignorada: Cor e Novo SKU estão vazios.");
    }
    if ((clean.newSku?.length ?? 0) > 160 || /[\u0000-\u001f\u007f]/.test(clean.newSku ?? "")) {
      return previewWithoutProduct(clean, "blocked", "Novo SKU inválido: use até 160 caracteres, sem quebras de linha.");
    }

    if (
      !clean.overrideExternalProductId &&
      !clean.externalProductId &&
      !clean.sku &&
      !clean.variantId &&
      !clean.productName
    ) {
      return previewWithoutProduct(
        clean,
        "blocked",
        "Informe o produto pelo nome, ID da Nuvemshop ou SKU."
      );
    }

    const match = matchProduct(clean, indexes);
    if (!match.product) {
      return {
        ...previewWithoutProduct(
          clean,
          "review",
          match.ambiguousMessage ?? "Produto não encontrado automaticamente."
        ),
        candidates: match.candidates,
      };
    }

    const safety = analyzeProductColor(match.product);
    const skuSafety = analyzeSku(clean, match.product, indexes);
    const updateColor = Boolean(clean.color) && safety.status === "ready";
    const updateSku = Boolean(clean.newSku) && skuSafety.status === "ready";
    const status: ColorPreviewStatus = clean.newSku && (skuSafety.status === "review" || skuSafety.status === "blocked")
      ? skuSafety.status
      : clean.color && safety.status === "blocked"
        ? "blocked"
        : updateColor || updateSku ? "ready" : "unchanged";
    const fuzzyPrefix =
      match.method === "similar"
        ? `Encontrado por nome semelhante (${Math.round(match.score * 100)}%). `
        : "";
    return {
      ...clean,
      productExternalId: String(match.product.id),
      matchedProductName: productName(match.product),
      productImageUrl: match.product.images?.[0]?.src ?? null,
      matchMethod: match.method,
      matchScore: match.score,
      status,
      message: `${fuzzyPrefix}${[clean.color && safety.message, clean.newSku && skuSafety.message].filter(Boolean).join(" ")}`,
      currentColors: safety.currentColors,
      colorAttributeIndex: safety.colorAttributeIndex,
      candidates: match.candidates,
      variantExternalId: skuSafety.variant ? String(skuSafety.variant.id) : null,
      variantLabel: skuSafety.variant ? variantName(match.product, skuSafety.variant) : "",
      currentSku: skuSafety.variant?.sku ?? "",
      variantOptions: (match.product.variants ?? []).map((variant) => ({
        id: String(variant.id), label: variantName(match.product!, variant), sku: variant.sku ?? "",
      })),
      updateColor,
      updateSku,
    };
  });

  markSpreadsheetConflicts(rows);
  return rows;
}

export function analyzeProductColor(
  product: NuvemshopProduct
): ProductSafety {
  const attributes = product.attributes ?? [];
  const variants = product.variants ?? [];
  const colorAttributeIndex = attributes.findIndex((attribute) =>
    isColorAttribute(translationText(attribute))
  );

  if (colorAttributeIndex >= 0) {
    const currentColors = uniqueDisplayValues(
      variants.map((variant) =>
        translationText((variant.values ?? [])[colorAttributeIndex])
      )
    );

    return {
      status: "unchanged",
      message: currentColors.length
        ? `Cor ignorada: o produto já possui essa variação (${currentColors.join(", ")}).`
        : "Cor ignorada: o produto já possui essa variação.",
      currentColors,
      colorAttributeIndex,
    };
  }

  if (variants.length === 0) {
    return {
      status: "blocked",
      message: "O produto não possui uma variante válida na Nuvemshop.",
      currentColors: [],
      colorAttributeIndex,
    };
  }

  const malformedVariant = variants.some(
    (variant) => (variant.values ?? []).length !== attributes.length
  );
  if (malformedVariant) {
    return {
      status: "blocked",
      message:
        "As variações atuais estão inconsistentes. Revise este produto diretamente na Nuvemshop.",
      currentColors: [],
      colorAttributeIndex,
    };
  }

  if (attributes.length >= 3) {
    return {
      status: "blocked",
      message:
        "O produto já usa o limite de três tipos de variação da Nuvemshop.",
      currentColors: [],
      colorAttributeIndex,
    };
  }

  return {
    status: "ready",
    message:
      variants.length > 1
        ? `A variação Cor será adicionada às ${variants.length} combinações existentes.`
        : "A variação Cor será criada.",
    currentColors: [],
    colorAttributeIndex,
  };
}

export function variantName(product: NuvemshopProduct, variant: NuvemshopVariant): string {
  return (variant.values ?? []).map((value, index) => {
    const attribute = translationText(product.attributes?.[index]);
    return [attribute, translationText(value)].filter(Boolean).join(": ");
  }).join(" / ") || "Variação única";
}

function analyzeSku(input: ColorImportInput, product: NuvemshopProduct, indexes: ReturnType<typeof buildProductIndexes>) {
  const variants = product.variants ?? [];
  let matches = variants;
  if (input.variantId) {
    matches = variants.filter((variant) => String(variant.id) === normalizeNumericId(input.variantId!));
  } else if (input.variation) {
    matches = variants.filter((variant) =>
      normalize(variantName(product, variant)) === normalize(input.variation!) ||
      normalize((variant.values ?? []).map(translationText).join(" / ")) === normalize(input.variation!)
    );
  } else if (input.sku) {
    matches = variants.filter((variant) => normalizeIdentifier(variant.sku ?? "") === normalizeIdentifier(input.sku));
  }
  const variant = matches.length === 1 ? matches[0] : null;
  if (!variant) {
    return { status: "review" as const, variant, message: "Escolha a variação pelo ID, pelas opções ou pelo SKU atual." };
  }
  const owners = indexes.skuOwners.get(normalizeIdentifier(input.newSku ?? "")) ?? [];
  if (owners.some((owner) => owner.productId !== product.id || owner.variantId !== variant.id)) {
    return { status: "blocked" as const, variant, message: "O novo SKU já pertence a outra variação na Nuvemshop." };
  }
  return (variant.sku ?? "") === input.newSku
    ? { status: "unchanged" as const, variant, message: "O SKU já está cadastrado nesta variação." }
    : { status: "ready" as const, variant, message: "SKU pronto para atualizar." };
}

export function productName(product: NuvemshopProduct): string {
  return translationText(product.name) || `Produto ${product.id}`;
}

export function translationText(
  value: Record<string, string> | null | undefined
): string {
  if (!value) return "";
  return value.pt ?? value.es ?? value.en ?? Object.values(value)[0] ?? "";
}

function buildProductIndexes(products: NuvemshopProduct[]) {
  const byId = new Map(products.map((product) => [String(product.id), product]));
  const byName = new Map<string, NuvemshopProduct[]>();
  const bySku = new Map<string, NuvemshopProduct[]>();
  const byVariantId = new Map<string, NuvemshopProduct>();
  const skuOwners = new Map<string, Array<{ productId: number; variantId: number }>>();

  for (const product of products) {
    const nameKey = normalize(productName(product));
    if (nameKey) byName.set(nameKey, [...(byName.get(nameKey) ?? []), product]);
    for (const variant of product.variants ?? []) {
      byVariantId.set(String(variant.id), product);
      const skuKey = normalizeIdentifier(variant.sku ?? "");
      if (skuKey) {
        bySku.set(skuKey, [...(bySku.get(skuKey) ?? []), product]);
        skuOwners.set(skuKey, [...(skuOwners.get(skuKey) ?? []), { productId: product.id, variantId: variant.id }]);
      }
    }
  }

  const catalog = buildCatalog(
    products.map((product) => ({ id: String(product.id), name: productName(product) }))
  );
  return { products, byId, byName, bySku, byVariantId, skuOwners, catalog };
}

function matchProduct(
  input: ColorImportInput,
  indexes: ReturnType<typeof buildProductIndexes>
): ProductMatch {
  // Explicit IDs must never fall back to a different product by name or SKU.
  const explicitId = input.overrideExternalProductId || input.externalProductId;
  if (explicitId) {
    const product = indexes.byId.get(normalizeNumericId(explicitId));
    return product
      ? matched(product, input.overrideExternalProductId ? "override" : "id", 1, indexes)
      : { product: null, method: null, score: 0, candidates: [], ambiguousMessage: "ID do produto não encontrado na Nuvemshop." };
  }
  if (input.variantId) {
    const product = indexes.byVariantId.get(normalizeNumericId(input.variantId));
    return product
      ? matched(product, "id", 1, indexes)
      : { product: null, method: null, score: 0, candidates: [], ambiguousMessage: "ID da variação não encontrado na Nuvemshop." };
  }
  if (input.sku) {
    const skuMatches = dedupeProducts(
      indexes.bySku.get(normalizeIdentifier(input.sku)) ?? []
    );
    if (skuMatches.length === 1) return matched(skuMatches[0], "sku", 1, indexes);
    if (skuMatches.length > 1) {
      return {
        product: null,
        method: null,
        score: 0,
        candidates: skuMatches.slice(0, 5).map((product) => candidate(product, 1)),
        ambiguousMessage: "O mesmo SKU aparece em mais de um produto. Escolha o correto.",
      };
    }
  }

  if (input.productName) {
    const exactMatches = indexes.byName.get(normalize(input.productName)) ?? [];
    if (exactMatches.length === 1) {
      return matched(exactMatches[0], "name", 1, indexes);
    }
    if (exactMatches.length > 1) {
      return {
        product: null,
        method: null,
        score: 0,
        candidates: exactMatches.slice(0, 5).map((product) => candidate(product, 1)),
        ambiguousMessage:
          "Há mais de um produto com esse nome. Escolha usando o ID da Nuvemshop.",
      };
    }

    const fuzzy = findMatchesFast(input.productName, indexes.catalog, {
      top: 5,
      cutoff: 0.35,
    });
    const candidates = fuzzy
      .map((item) => {
        const product = indexes.byId.get(item.id);
        return product ? candidate(product, item.score) : null;
      })
      .filter(Boolean) as ColorPreviewCandidate[];
    const first = fuzzy[0];
    const second = fuzzy[1];
    if (first && first.score >= 0.92 && (!second || first.score - second.score >= 0.08)) {
      const product = indexes.byId.get(first.id);
      if (product) {
        return {
          product,
          method: "similar",
          score: first.score,
          candidates,
        };
      }
    }
    return {
      product: null,
      method: null,
      score: first?.score ?? 0,
      candidates,
    };
  }

  return { product: null, method: null, score: 0, candidates: [] };
}

function matched(
  product: NuvemshopProduct,
  method: NonNullable<ColorPreviewRow["matchMethod"]>,
  score: number,
  indexes: ReturnType<typeof buildProductIndexes>
): ProductMatch {
  return {
    product,
    method,
    score,
    candidates: [candidate(product, score), ...similarCandidates(product, indexes)],
  };
}

function similarCandidates(
  product: NuvemshopProduct,
  indexes: ReturnType<typeof buildProductIndexes>
): ColorPreviewCandidate[] {
  return findMatchesFast(productName(product), indexes.catalog, { top: 5, cutoff: 0.35 })
    .filter((item) => item.id !== String(product.id))
    .slice(0, 4)
    .map((item) => {
      const candidateProduct = indexes.byId.get(item.id);
      return candidateProduct ? candidate(candidateProduct, item.score) : null;
    })
    .filter(Boolean) as ColorPreviewCandidate[];
}

function candidate(
  product: NuvemshopProduct,
  score: number
): ColorPreviewCandidate {
  return {
    externalProductId: String(product.id),
    name: productName(product),
    imageUrl: product.images?.[0]?.src ?? null,
    score,
  };
}

function markSpreadsheetConflicts(rows: ColorPreviewRow[]) {
  const byProduct = new Map<string, ColorPreviewRow[]>();
  for (const row of rows) {
    if (!row.productExternalId) continue;
    byProduct.set(row.productExternalId, [
      ...(byProduct.get(row.productExternalId) ?? []),
      row,
    ]);
  }

  for (const productRows of byProduct.values()) {
    const colorRows = productRows.filter((row) => row.updateColor);
    const distinctColors = new Set(colorRows.map((row) => normalize(row.color)));
    if (distinctColors.size > 1) {
      for (const row of productRows) {
        row.status = "blocked";
        row.message =
          "Este produto aparece com cores diferentes na planilha. Deixe apenas uma cor por produto.";
      }
      continue;
    }

    const actionable = productRows.filter((row) => row.status === "ready" && !row.newSku);
    for (const duplicate of actionable.slice(1)) {
      duplicate.status = "duplicate";
      duplicate.message = "Linha repetida; somente a primeira será sincronizada.";
    }
  }

  const byTarget = new Map<string, ColorPreviewRow[]>();
  const byNewSku = new Map<string, ColorPreviewRow[]>();
  for (const row of rows) {
    if (!row.newSku || !row.productExternalId || !row.variantExternalId) continue;
    const target = `${row.productExternalId}:${row.variantExternalId}`;
    byTarget.set(target, [...(byTarget.get(target) ?? []), row]);
    const skuKey = normalizeIdentifier(row.newSku);
    byNewSku.set(skuKey, [...(byNewSku.get(skuKey) ?? []), row]);
  }
  for (const targetRows of byTarget.values()) {
    if (new Set(targetRows.map((row) => row.newSku)).size > 1) {
      for (const row of targetRows) {
        row.status = "blocked";
        row.message = "A mesma variação recebeu SKUs diferentes na planilha.";
      }
    } else {
      // An identical SKU row can still carry a distinct, valid color operation.
      const seen = new Set<string>();
      for (const row of targetRows.filter((item) => item.status === "ready")) {
        const key = row.updateColor ? normalize(row.color) : "";
        if (seen.has(key)) {
          row.status = "duplicate";
          row.message = "Linha repetida; somente a primeira será sincronizada.";
        }
        seen.add(key);
      }
    }
  }
  for (const skuRows of byNewSku.values()) {
    if (new Set(skuRows.map((row) => `${row.productExternalId}:${row.variantExternalId}`)).size > 1) {
      for (const row of skuRows) {
        row.status = "blocked";
        row.message = "O mesmo novo SKU foi informado para variações diferentes na planilha.";
      }
    }
  }
}

function previewWithoutProduct(
  input: ColorImportInput,
  status: "review" | "blocked" | "unchanged",
  message: string
): ColorPreviewRow {
  return {
    ...input,
    productExternalId: null,
    matchedProductName: null,
    productImageUrl: null,
    matchMethod: null,
    matchScore: 0,
    status,
    message,
    currentColors: [],
    colorAttributeIndex: -1,
    candidates: [],
    variantExternalId: null,
    variantLabel: "",
    currentSku: "",
    variantOptions: [],
    updateColor: false,
    updateSku: false,
  };
}

function sanitizeInput(input: ColorImportInput): ColorImportInput {
  return {
    rowNumber: Math.max(2, Math.round(Number(input.rowNumber) || 2)),
    productName: cleanText(input.productName, 300),
    externalProductId: cleanText(input.externalProductId, 80),
    sku: cleanText(input.sku, 160),
    color: cleanText(input.color, 120),
    newSku: typeof input.newSku === "string" ? input.newSku.trim() : "",
    variantId: cleanText(input.variantId, 80),
    variation: cleanText(input.variation, 500),
    overrideExternalProductId: cleanText(input.overrideExternalProductId ?? "", 80),
  };
}

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizeIdentifier(value: string): string {
  return value.trim().toLocaleLowerCase("pt-BR");
}

function normalizeNumericId(value: string): string {
  return /^\d+$/.test(value.trim()) ? value.trim().replace(/^0+(?=\d)/, "") : "";
}

function isColorAttribute(value: string): boolean {
  const normalized = normalize(value);
  return normalized === "cor" || normalized === "color" || normalized === "colour";
}

function uniqueDisplayValues(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values.map((item) => item.trim()).filter(Boolean)) {
    const key = normalize(value);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(value);
    }
  }
  return result;
}

function dedupeProducts(products: NuvemshopProduct[]): NuvemshopProduct[] {
  return [...new Map(products.map((product) => [product.id, product])).values()];
}
