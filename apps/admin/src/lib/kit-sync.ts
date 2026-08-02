import type { SupabaseClient } from "@supabase/supabase-js";
import { computeKitStock } from "@avaliacoes/shared";
import {
  createProduct,
  updateProduct,
  updateVariant,
  getProduct,
  deleteProduct,
  findOrCreateCategory,
  replaceProductImages,
} from "./nuvemshop";

// ----------------------------------------------------------------------------
// Sincroniza um kit (do nosso banco) como produto-kit na Nuvemshop.
// - cria o produto na primeira vez; atualiza nas seguintes
// - price = soma dos itens (preço "de"); promotional_price = preço final ("por")
// - descrição, galeria e categoria "Kits"
// - estoque = quantos kits dá pra montar com o estoque dos itens
// ----------------------------------------------------------------------------

interface SyncResult {
  ok: boolean;
  error?: string;
}

const KIT_CATEGORY_NAME = "Kits";

export async function syncKitToNuvemshop(
  admin: SupabaseClient,
  kitId: string,
  opts: { syncImages?: boolean } = {}
): Promise<SyncResult> {
  const { data: store } = await admin
    .from("stores")
    .select("id, external_store_id, access_token")
    .eq("platform", "nuvemshop")
    .not("access_token", "is", null)
    .maybeSingle();
  if (!store?.access_token) {
    await setError(admin, kitId, "Loja não conectada");
    return { ok: false, error: "Loja não conectada" };
  }

  const { data: kit } = await admin
    .from("kits")
    .select(
      `id, name, description, images, active, original_price, final_price,
       nuvemshop_product_id, nuvemshop_variant_id,
       items:kit_items (
         quantity,
         product:products (stock)
       )`
    )
    .eq("id", kitId)
    .maybeSingle();
  if (!kit) return { ok: false, error: "Kit não encontrado" };

  const storeId = store.external_store_id as string;
  const token = store.access_token as string;

  try {
    const original = Number(kit.original_price ?? 0);
    const final = Number(kit.final_price ?? 0);
    // preço "de" e "por"
    const price = original > 0 ? original : final;
    const promo = final > 0 && final < original ? final : null;

    // Supabase retorna a relação `product` como objeto ou array — normalizamos
    const items = (kit.items ?? []) as unknown as Array<{
      quantity: number;
      product?:
        | { stock: number | null }
        | { stock: number | null }[]
        | null;
    }>;
    const stock = computeKitStock(
      items.map((i) => {
        const prod = Array.isArray(i.product) ? i.product[0] : i.product;
        return { stock: prod?.stock ?? null, quantity: i.quantity };
      })
    );

    const images = (Array.isArray(kit.images) ? kit.images : []) as string[];
    const descriptionHtml = descriptionToHtml(kit.description ?? "");

    // categoria "Kits"
    const category = await findOrCreateCategory(storeId, token, KIT_CATEGORY_NAME);

    let productId = kit.nuvemshop_product_id as string | null;
    let variantId = kit.nuvemshop_variant_id as string | null;

    if (productId) {
      // atualiza produto existente (imagens NÃO vão no PUT — sub-recurso à parte)
      await updateProduct(storeId, token, productId, {
        name: kit.name,
        description: descriptionHtml,
        published: kit.active,
        categoryIds: [category.id],
      });
      // atualiza preço/estoque na variante
      if (variantId) {
        await updateVariant(storeId, token, productId, variantId, {
          price,
          promotional_price: promo,
          ...(stock != null ? { stock } : {}),
        });
      }
      // re-sincroniza galeria só quando pedido (imagens mudaram / re-sync manual)
      if (opts.syncImages) {
        try {
          await replaceProductImages(storeId, token, productId, images);
        } catch {
          // imagens são best-effort; não falha a sincronização de preço
        }
      }
    } else {
      // cria novo produto-kit
      const created = await createProduct(storeId, token, {
        name: kit.name,
        description: descriptionHtml,
        price,
        promotional_price: promo ?? undefined,
        stock: stock ?? undefined,
        images,
        categoryIds: [category.id],
        published: kit.active,
      });
      productId = String(created.id);
      variantId = created.variants?.[0]?.id ? String(created.variants[0].id) : null;
    }

    // pega canonical_url + variante (a resposta do create pode não trazer url)
    let url: string | null = null;
    try {
      const fresh = await getProduct(storeId, token, productId);
      url = fresh.canonical_url ?? null;
      if (!variantId && fresh.variants?.[0]?.id) {
        variantId = String(fresh.variants[0].id);
      }
    } catch {
      // url é opcional
    }

    await admin
      .from("kits")
      .update({
        nuvemshop_product_id: productId,
        nuvemshop_variant_id: variantId,
        nuvemshop_category_id: String(category.id),
        nuvemshop_url: url,
        last_synced_at: new Date().toISOString(),
        sync_error: null,
      })
      .eq("id", kitId);

    return { ok: true };
  } catch (err) {
    const msg = (err as Error).message;
    await setError(admin, kitId, msg);
    return { ok: false, error: msg };
  }
}

/** Remove o produto-kit da Nuvemshop (chamado ao deletar o kit). */
export async function deleteKitProduct(
  admin: SupabaseClient,
  kit: { nuvemshop_product_id: string | null }
): Promise<void> {
  if (!kit.nuvemshop_product_id) return;
  const { data: store } = await admin
    .from("stores")
    .select("external_store_id, access_token")
    .eq("platform", "nuvemshop")
    .not("access_token", "is", null)
    .maybeSingle();
  if (!store?.access_token) return;
  try {
    await deleteProduct(
      store.external_store_id,
      store.access_token,
      kit.nuvemshop_product_id
    );
  } catch {
    // não bloqueia a exclusão do kit no nosso banco
  }
}

async function setError(admin: SupabaseClient, kitId: string, error: string) {
  await admin
    .from("kits")
    .update({ sync_error: error, last_synced_at: new Date().toISOString() })
    .eq("id", kitId);
}

function descriptionToHtml(text: string): string {
  const t = text.trim();
  if (!t) return "";
  return t
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
}
