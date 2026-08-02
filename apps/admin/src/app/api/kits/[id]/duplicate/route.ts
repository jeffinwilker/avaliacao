import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// POST /api/kits/[id]/duplicate — cria uma cópia do kit (itens incluídos).
// A cópia NÃO é sincronizada com a Nuvemshop automaticamente — vira um kit
// "não sincronizado" pra você revisar/ajustar antes de publicar.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const admin = createAdminClient();

  const { data: kit, error } = await admin
    .from("kits")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!kit) return NextResponse.json({ error: "Kit não encontrado" }, { status: 404 });

  const { data: items } = await admin
    .from("kit_items")
    .select("product_id, quantity, ordering")
    .eq("kit_id", id);

  // cria o novo kit (sem vínculo com produto na Nuvemshop)
  const { data: novo, error: insErr } = await admin
    .from("kits")
    .insert({
      store_id: kit.store_id,
      name: `${kit.name} (cópia)`,
      description: kit.description,
      image_url: kit.image_url,
      images: kit.images ?? [],
      discount_type: kit.discount_type,
      discount_value: kit.discount_value,
      original_price: kit.original_price,
      final_price: kit.final_price,
      active: kit.active,
      // zera vínculo com a Nuvemshop — será um produto novo ao sincronizar
      nuvemshop_product_id: null,
      nuvemshop_variant_id: null,
      nuvemshop_category_id: null,
      nuvemshop_url: null,
      last_synced_at: null,
      sync_error: null,
    })
    .select("id")
    .single();

  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  if (items && items.length > 0) {
    const rows = items.map((it) => ({
      kit_id: novo.id,
      product_id: it.product_id,
      quantity: it.quantity,
      ordering: it.ordering,
    }));
    await admin.from("kit_items").insert(rows);
  }

  return NextResponse.json({ ok: true, id: novo.id });
}
