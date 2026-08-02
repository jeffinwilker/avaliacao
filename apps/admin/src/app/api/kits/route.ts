import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeKitPrices, type CreateKitPayload } from "@avaliacoes/shared";
import { syncKitToNuvemshop } from "@/lib/kit-sync";

// GET /api/kits — lista todos os kits da loja
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("kits_with_items")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ kits: data ?? [] });
}

// POST /api/kits — cria um novo kit
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as CreateKitPayload;
  const err = validate(body);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  const admin = createAdminClient();

  const { data: store } = await admin
    .from("stores")
    .select("id")
    .limit(1)
    .maybeSingle();
  if (!store) {
    return NextResponse.json({ error: "Loja não conectada" }, { status: 400 });
  }

  // busca preços dos produtos escolhidos
  const productIds = body.items.map((i) => i.productId);
  const { data: products } = await admin
    .from("products")
    .select("id, price")
    .in("id", productIds);
  const priceMap = new Map(products?.map((p) => [p.id, p.price]) ?? []);

  const priced = body.items.map((i) => ({
    price: priceMap.get(i.productId) ?? 0,
    quantity: i.quantity,
  }));
  const { original, final } = computeKitPrices(
    priced,
    body.discountType,
    body.discountValue
  );

  const images = Array.isArray(body.images) ? body.images.filter(Boolean) : [];

  const { data: kit, error: kitErr } = await admin
    .from("kits")
    .insert({
      store_id: store.id,
      name: body.name,
      description: body.description ?? null,
      image_url: images[0] ?? null,
      images,
      dimension_rule: body.dimensionRule ?? "auto",
      weight: body.weight ?? null,
      depth: body.depth ?? null,
      width: body.width ?? null,
      height: body.height ?? null,
      discount_type: body.discountType,
      discount_value: body.discountValue,
      original_price: original,
      final_price: final,
      active: body.active ?? true,
    })
    .select("id")
    .single();

  if (kitErr) return NextResponse.json({ error: kitErr.message }, { status: 500 });

  if (body.items.length > 0) {
    const itemsToInsert = body.items.map((i, idx) => ({
      kit_id: kit.id,
      product_id: i.productId,
      quantity: i.quantity,
      ordering: i.ordering ?? idx,
    }));
    const { error: itemsErr } = await admin
      .from("kit_items")
      .insert(itemsToInsert);
    if (itemsErr) {
      // rollback
      await admin.from("kits").delete().eq("id", kit.id);
      return NextResponse.json({ error: itemsErr.message }, { status: 500 });
    }
  }

  // Cria o produto-kit na Nuvemshop (não bloqueia o save se falhar)
  const sync = await syncKitToNuvemshop(admin, kit.id);

  return NextResponse.json({
    ok: true,
    id: kit.id,
    syncError: sync.ok ? null : sync.error,
  });
}

function validate(body: CreateKitPayload): string | null {
  if (!body.name?.trim()) return "Nome é obrigatório";
  if (!["percent", "fixed", "total"].includes(body.discountType))
    return "Tipo de desconto inválido";
  if (!Number.isFinite(body.discountValue) || body.discountValue < 0)
    return "Valor de desconto inválido";
  if (!Array.isArray(body.items) || body.items.length === 0)
    return "Adicione pelo menos 1 produto ao kit";
  for (const i of body.items) {
    if (!i.productId) return "Produto inválido";
    if (!Number.isFinite(i.quantity) || i.quantity < 1)
      return "Quantidade inválida em algum item";
  }
  return null;
}
