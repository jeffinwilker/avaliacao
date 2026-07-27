import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllProducts } from "@/lib/nuvemshop";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: store } = await admin
    .from("stores")
    .select("id, external_store_id, access_token")
    .eq("platform", "nuvemshop")
    .maybeSingle();

  if (!store?.access_token) {
    return NextResponse.json({ error: "Loja não conectada" }, { status: 400 });
  }

  try {
    const products = await fetchAllProducts(store.external_store_id, store.access_token);

    const rows = products.map((p) => ({
      store_id: store.id,
      external_product_id: String(p.id),
      name: p.name?.pt ?? p.name?.es ?? p.name?.en ?? "Produto",
      image_url: p.images?.[0]?.src ?? null,
      url: null,
    }));

    if (rows.length > 0) {
      await admin
        .from("products")
        .upsert(rows, { onConflict: "store_id,external_product_id" });
    }

    return NextResponse.json({ ok: true, count: rows.length });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
