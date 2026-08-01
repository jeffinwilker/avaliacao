import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeKitPrices, type UpdateKitPayload } from "@avaliacoes/shared";

// GET /api/kits/[id] — obtém um kit com seus itens
export async function GET(
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
    .select(
      `*,
       items:kit_items (
         id, kit_id, product_id, quantity, ordering,
         product:products (id, external_product_id, name, image_url, price, stock)
       )`
    )
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!kit) return NextResponse.json({ error: "Kit não encontrado" }, { status: 404 });

  return NextResponse.json({ kit });
}

// PUT /api/kits/[id] — atualiza kit + itens (substitui os itens)
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = (await req.json()) as UpdateKitPayload;
  const admin = createAdminClient();

  const update: Record<string, unknown> = {};
  if (body.name !== undefined) update.name = body.name;
  if (body.description !== undefined) update.description = body.description;
  if (body.imageUrl !== undefined) update.image_url = body.imageUrl;
  if (body.discountType !== undefined) update.discount_type = body.discountType;
  if (body.discountValue !== undefined) update.discount_value = body.discountValue;
  if (body.active !== undefined) update.active = body.active;

  // se items ou desconto foram alterados, recalcula preços
  if (body.items !== undefined || body.discountType !== undefined || body.discountValue !== undefined) {
    let items = body.items;
    if (items === undefined) {
      const { data: existing } = await admin
        .from("kit_items")
        .select("product_id, quantity")
        .eq("kit_id", id);
      items = (existing ?? []).map((i) => ({
        productId: i.product_id,
        quantity: i.quantity,
      }));
    }

    const productIds = items.map((i) => i.productId);
    const { data: products } = await admin
      .from("products")
      .select("id, price")
      .in("id", productIds);
    const priceMap = new Map(products?.map((p) => [p.id, p.price]) ?? []);
    const priced = items.map((i) => ({
      price: priceMap.get(i.productId) ?? 0,
      quantity: i.quantity,
    }));

    // busca kit atual pra pegar tipo/valor de desconto se não veio
    const { data: current } = await admin
      .from("kits")
      .select("discount_type, discount_value")
      .eq("id", id)
      .maybeSingle();

    const dtype = body.discountType ?? current?.discount_type ?? "percent";
    const dval = body.discountValue ?? current?.discount_value ?? 0;
    const { original, final } = computeKitPrices(priced, dtype, dval);
    update.original_price = original;
    update.final_price = final;
  }

  if (Object.keys(update).length > 0) {
    const { error } = await admin.from("kits").update(update).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (body.items !== undefined) {
    // substitui os itens
    await admin.from("kit_items").delete().eq("kit_id", id);
    if (body.items.length > 0) {
      const rows = body.items.map((i, idx) => ({
        kit_id: id,
        product_id: i.productId,
        quantity: i.quantity,
        ordering: i.ordering ?? idx,
      }));
      const { error } = await admin.from("kit_items").insert(rows);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}

// DELETE /api/kits/[id] — remove kit (e futuramente o produto-kit na Nuvemshop)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const admin = createAdminClient();

  const { error } = await admin.from("kits").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
