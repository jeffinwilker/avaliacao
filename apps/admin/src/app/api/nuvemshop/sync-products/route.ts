import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  fetchAllProducts,
  mainVariant,
  productName,
  productDescription,
} from "@/lib/nuvemshop";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: store } = await admin
    .from("stores")
    .select("id, external_store_id, access_token")
    .eq("platform", "nuvemshop")
    .not("access_token", "is", null)
    .maybeSingle();

  if (!store?.access_token) {
    return NextResponse.json({ error: "Loja não conectada" }, { status: 400 });
  }

  try {
    const products = await fetchAllProducts(store.external_store_id, store.access_token);

    const rows = products.map((p) => {
      const variant = mainVariant(p);
      const images = (p.images ?? []).map((img) => img.src).filter(Boolean);
      return {
        store_id: store.id,
        external_product_id: String(p.id),
        name: productName(p),
        description: productDescription(p),
        image_url: images[0] ?? null,
        images,
        url: p.canonical_url ?? null,
        price: variant?.price ? Number(variant.price) : null,
        promotional_price: variant?.promotional_price
          ? Number(variant.promotional_price)
          : null,
        stock:
          variant?.stock !== undefined && variant?.stock !== null
            ? Number(variant.stock)
            : null,
        variant_id: variant?.id ? String(variant.id) : null,
      };
    });

    if (rows.length > 0) {
      // Insere em batches pra evitar timeout
      const batchSize = 500;
      for (let i = 0; i < rows.length; i += batchSize) {
        const slice = rows.slice(i, i + batchSize);
        const { error } = await admin
          .from("products")
          .upsert(slice, { onConflict: "store_id,external_product_id" });
        if (error) {
          return NextResponse.json(
            { error: error.message, synced: i },
            { status: 500 }
          );
        }
      }
    }

    return NextResponse.json({ ok: true, count: rows.length });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
