import {
  buildCatalog,
  findMatchesFast,
  normalize,
} from "@/lib/match";
import type { NuvemshopProduct } from "@/lib/nuvemshop";

export const MAX_COLOR_IMPORT_ROWS = 5000;

export interface ColorImportInput {
  rowNumber: number;
  productName: string;
  externalProductId: string;
  sku: string;
  color: string;
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
    if (!clean.color) {
      return previewWithoutProduct(clean, "blocked", "A cor está vazia.");
    }

    if (
      !clean.overrideExternalProductId &&
      !clean.externalProductId &&
      !clean.sku &&
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

    const safety = analyzeProductColor(match.product, clean.color);
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
      status: safety.status,
      message: `${fuzzyPrefix}${safety.message}`,
      currentColors: safety.currentColors,
      colorAttributeIndex: safety.colorAttributeIndex,
      candidates: match.candidates,
    };
  });

  markSpreadsheetConflicts(rows);
  return rows;
}

export function analyzeProductColor(
  product: NuvemshopProduct,
  color: string
): ProductSafety {
  const attributes = product.attributes ?? [];
  const variants = product.variants ?? [];
  const colorAttributeIndex = attributes.findIndex((attribute) =>
    isColorAttribute(translationText(attribute))
  );

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

  if (colorAttributeIndex < 0 && attributes.length >= 3) {
    return {
      status: "blocked",
      message:
        "O produto já usa o limite de três tipos de variação da Nuvemshop.",
      currentColors: [],
      colorAttributeIndex,
    };
  }

  if (colorAttributeIndex < 0) {
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

  const currentColors = uniqueDisplayValues(
    variants.map((variant) =>
      translationText((variant.values ?? [])[colorAttributeIndex])
    )
  );
  if (currentColors.length > 1) {
    return {
      status: "blocked",
      message:
        "O produto já possui várias cores diferentes. A planilha não vai sobrescrevê-las.",
      currentColors,
      colorAttributeIndex,
    };
  }

  if (currentColors.length === 1 && normalize(currentColors[0]) === normalize(color)) {
    return {
      status: "unchanged",
      message: "Essa cor já está cadastrada na Nuvemshop.",
      currentColors,
      colorAttributeIndex,
    };
  }

  return {
    status: "ready",
    message: currentColors.length
      ? `A cor atual (${currentColors[0]}) será trocada por ${color}.`
      : "A cor será preenchida nas variações existentes.",
    currentColors,
    colorAttributeIndex,
  };
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

  for (const product of products) {
    const nameKey = normalize(productName(product));
    if (nameKey) byName.set(nameKey, [...(byName.get(nameKey) ?? []), product]);
    for (const variant of product.variants ?? []) {
      const skuKey = normalizeIdentifier(variant.sku ?? "");
      if (skuKey) bySku.set(skuKey, [...(bySku.get(skuKey) ?? []), product]);
    }
  }

  const catalog = buildCatalog(
    products.map((product) => ({ id: String(product.id), name: productName(product) }))
  );
  return { products, byId, byName, bySku, catalog };
}

function matchProduct(
  input: ColorImportInput,
  indexes: ReturnType<typeof buildProductIndexes>
): ProductMatch {
  const override = input.overrideExternalProductId
    ? indexes.byId.get(input.overrideExternalProductId)
    : null;
  if (override) return matched(override, "override", 1, indexes);

  const byId = input.externalProductId
    ? indexes.byId.get(normalizeNumericId(input.externalProductId))
    : null;
  if (byId) return matched(byId, "id", 1, indexes);

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
    const distinctColors = new Set(productRows.map((row) => normalize(row.color)));
    if (distinctColors.size > 1) {
      for (const row of productRows) {
        row.status = "blocked";
        row.message =
          "Este produto aparece com cores diferentes na planilha. Deixe apenas uma cor por produto.";
      }
      continue;
    }

    const actionable = productRows.filter((row) => row.status === "ready");
    for (const duplicate of actionable.slice(1)) {
      duplicate.status = "duplicate";
      duplicate.message = "Linha repetida; somente a primeira será sincronizada.";
    }
  }
}

function previewWithoutProduct(
  input: ColorImportInput,
  status: "review" | "blocked",
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
  };
}

function sanitizeInput(input: ColorImportInput): ColorImportInput {
  return {
    rowNumber: Math.max(2, Math.round(Number(input.rowNumber) || 2)),
    productName: cleanText(input.productName, 300),
    externalProductId: cleanText(input.externalProductId, 80),
    sku: cleanText(input.sku, 160),
    color: cleanText(input.color, 120),
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
  const match = value.trim().match(/\d+/);
  return match?.[0] ?? value.trim();
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
