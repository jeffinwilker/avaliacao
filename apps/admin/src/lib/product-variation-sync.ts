import { setProductColorVariation, setVariantSku, type NuvemshopProduct } from "@/lib/nuvemshop";
import { analyzeProductColor, type ColorPreviewRow } from "@/lib/product-color-import";

export async function syncProductImportRow(
  storeId: string,
  token: string,
  product: NuvemshopProduct,
  row: ColorPreviewRow
): Promise<string> {
  if (row.status !== "ready") throw new Error("Esta linha não está pronta para sincronizar.");
  const variant = (product.variants ?? []).find((item) => String(item.id) === row.variantExternalId);
  if (row.updateSku && (!variant || !row.newSku)) throw new Error("Variação não encontrada para atualizar o SKU.");

  let colorSaved = false;
  if (row.updateColor && analyzeProductColor(product).status === "ready") {
    await setProductColorVariation(storeId, token, product, row.color, -1);
    // Other rows in the same batch may target another variant of this product.
    product.attributes = [...(product.attributes ?? []), { pt: "Cor" }];
    for (const item of product.variants ?? []) {
      item.values = [...(item.values ?? []), { pt: row.color }];
    }
    colorSaved = true;
  }
  if (row.updateSku && variant && row.newSku) {
    try {
      await setVariantSku(storeId, token, product.id, variant.id, row.newSku);
      variant.sku = row.newSku;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao salvar o SKU.";
      throw new Error(`${colorSaved ? "Cor salva. SKU pendente: " : ""}${message}`);
    }
  }
  return [colorSaved && "Cor salva.", row.updateSku && "SKU salvo."].filter(Boolean).join(" ") || "Dados já sincronizados.";
}
