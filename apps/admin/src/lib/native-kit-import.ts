import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchNativeKit,
  findProductByHandle,
  type NuvemshopNativeKit,
} from "./nuvemshop";

export interface NativeKitImportResult {
  id: string;
  name: string;
  created: boolean;
  itemsCount: number;
  totalUnits: number;
}

/**
 * Espelha um kit nativo no banco local para permitir a busca reversa usada no
 * widget "Compre no kit". A Nuvemshop continua sendo a fonte de verdade.
 */
export async function importNativeKit(
  admin: SupabaseClient,
  value: string
): Promise<NativeKitImportResult> {
  const { data: store } = await admin
    .from("stores")
    .select("id, external_store_id, access_token")
    .eq("platform", "nuvemshop")
    .not("access_token", "is", null)
    .maybeSingle();

  if (!store?.access_token) throw new Error("Loja Nuvemshop não conectada.");

  const externalProductId = await resolveProductId(
    store.external_store_id,
    store.access_token,
    value
  );

  let nativeKit: NuvemshopNativeKit;
  try {
    nativeKit = await fetchNativeKit(
      store.external_store_id,
      store.access_token,
      externalProductId
    );
  } catch (error) {
    if (/API 404/.test((error as Error).message)) {
      throw new Error(
        "Esse produto não é um kit nativo. Crie o kit na área de Kits da Nuvemshop e cole aqui o link dele."
      );
    }
    throw error;
  }

  const components = (nativeKit.components ?? [])
    .filter((component) => !component.is_deleted)
    .sort((a, b) => a.position - b.position);
  if (components.length === 0) {
    throw new Error("O kit nativo não possui produtos válidos.");
  }

  const componentRows = components.map((component) => ({
    store_id: store.id,
    external_product_id: String(component.product_id),
    name: localized(component.name, `Produto ${component.product_id}`),
    image_url: component.image_url ?? null,
    price: numberOrNull(component.price),
    promotional_price: numberOrNull(component.promotional_price),
    stock: component.stock ?? null,
  }));

  const { error: productError } = await admin
    .from("products")
    .upsert(componentRows, { onConflict: "store_id,external_product_id" });
  if (productError) throw new Error(productError.message);

  const componentIds = components.map((component) => String(component.product_id));
  const { data: localProducts, error: localProductError } = await admin
    .from("products")
    .select("id, external_product_id")
    .eq("store_id", store.id)
    .in("external_product_id", componentIds);
  if (localProductError) throw new Error(localProductError.message);

  const localIdByExternal = new Map(
    (localProducts ?? []).map((product) => [
      String(product.external_product_id),
      String(product.id),
    ])
  );
  if (localIdByExternal.size !== componentIds.length) {
    throw new Error("Não foi possível relacionar todos os produtos do kit.");
  }

  const originalPrice = round2(
    components.reduce(
      (total, component) =>
        total + Number(component.price || 0) * component.quantity,
      0
    )
  );
  const discountPercent = Math.max(
    0,
    Math.min(100, Number(nativeKit.discount_percent ?? 0))
  );
  const finalPrice = round2(originalPrice * (1 - discountPercent / 100));
  const images = (nativeKit.images ?? [])
    .slice()
    .sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0))
    .map((image) => image.src)
    .filter(Boolean);
  // Kits nativos usados como oferta costumam ser `unlisted`: não aparecem na
  // busca/categorias, mas continuam compráveis pelo link direto. Nesse estado a
  // Nuvemshop mantém `published=false`, portanto visibility é a fonte correta.
  const availableByVisibility = nativeKit.visibility
    ? nativeKit.visibility !== "hidden"
    : nativeKit.published === true;
  const active = availableByVisibility && !nativeKit.invalid_at;

  const row = {
    store_id: store.id,
    name: localized(nativeKit.name, `Kit ${nativeKit.id}`),
    description: localized(nativeKit.description, "") || null,
    image_url: images[0] ?? null,
    images,
    discount_type: "percent",
    discount_value: discountPercent,
    nuvemshop_product_id: String(nativeKit.id),
    nuvemshop_variant_id: null,
    nuvemshop_category_id: null,
    nuvemshop_url: nativeKit.canonical_url ?? null,
    original_price: originalPrice,
    final_price: finalPrice,
    active,
    source: "nuvemshop_native",
    last_synced_at: new Date().toISOString(),
    sync_error: null,
  };

  const { data: existing, error: existingError } = await admin
    .from("kits")
    .select("id")
    .eq("store_id", store.id)
    .eq("source", "nuvemshop_native")
    .eq("nuvemshop_product_id", String(nativeKit.id))
    .maybeSingle();
  if (existingError) throw new Error(schemaError(existingError.message));

  let kitId: string;
  if (existing) {
    const { error } = await admin.from("kits").update(row).eq("id", existing.id);
    if (error) throw new Error(schemaError(error.message));
    kitId = String(existing.id);
  } else {
    const { data: inserted, error } = await admin
      .from("kits")
      .insert(row)
      .select("id")
      .single();
    if (error) throw new Error(schemaError(error.message));
    kitId = String(inserted.id);
  }

  const { error: deleteError } = await admin
    .from("kit_items")
    .delete()
    .eq("kit_id", kitId);
  if (deleteError) throw new Error(deleteError.message);

  const itemRows = components.map((component) => ({
    kit_id: kitId,
    product_id: localIdByExternal.get(String(component.product_id))!,
    quantity: component.quantity,
    ordering: component.position,
  }));
  const { error: itemError } = await admin.from("kit_items").insert(itemRows);
  if (itemError) throw new Error(itemError.message);

  return {
    id: kitId,
    name: row.name,
    created: !existing,
    itemsCount: components.length,
    totalUnits: components.reduce((total, component) => total + component.quantity, 0),
  };
}

async function resolveProductId(
  storeId: string,
  token: string,
  value: string
): Promise<string> {
  const normalized = value.trim();
  if (!normalized) throw new Error("Cole o link ou o ID do kit nativo.");
  if (/^\d+$/.test(normalized)) return normalized;

  let handle = "";
  try {
    const url = new URL(normalized);
    const parts = url.pathname.split("/").filter(Boolean);
    const productIndex = parts.findIndex((part) =>
      ["produto", "produtos", "product", "products"].includes(part.toLowerCase())
    );
    handle = decodeURIComponent(
      productIndex >= 0 ? parts[productIndex + 1] ?? "" : parts.at(-1) ?? ""
    );
  } catch {
    handle = normalized.replace(/^\/+|\/+$/g, "");
  }

  if (!handle || handle.includes("/")) {
    throw new Error("Link do kit inválido.");
  }
  if (/^\d+$/.test(handle)) return handle;

  const product = await findProductByHandle(storeId, token, handle);
  if (!product) throw new Error("Não encontramos esse produto na Nuvemshop.");
  return String(product.id);
}

function localized(
  value: Record<string, string | undefined> | undefined,
  fallback: string
): string {
  if (!value) return fallback;
  return (
    value.pt ??
    value.default ??
    value.es ??
    value.en ??
    Object.values(value).find(Boolean) ??
    fallback
  );
}

function numberOrNull(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function schemaError(message: string): string {
  if (message.toLowerCase().includes("source")) {
    return "Execute a migration 0019 no Supabase antes de importar kits nativos.";
  }
  return message;
}
