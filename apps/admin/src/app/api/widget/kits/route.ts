import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { discountPercent } from "@avaliacoes/shared";

// Endpoint público: para uma lista de produtos, retorna os kits que contêm
// cada um. Usado pelo widget nas páginas de produto. Batching pra evitar N calls.
//
// GET /api/widget/kits?apiKey=xxx&productIds=id1,id2

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

const MAX_IDS = 100;

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const apiKey = searchParams.get("apiKey");
  const idsParam = searchParams.get("productIds");
  if (!apiKey || !idsParam) {
    return json({ error: "apiKey e productIds obrigatórios" }, 400);
  }

  const externalIds = idsParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_IDS);
  if (externalIds.length === 0) return json({ kits: {} }, 200);

  const admin = createAdminClient();

  const { data: store } = await admin
    .from("stores")
    .select("id")
    .eq("api_key", apiKey)
    .maybeSingle();
  if (!store) return json({ error: "API key inválida" }, 401);

  // external → internal
  const { data: products } = await admin
    .from("products")
    .select("id, external_product_id")
    .eq("store_id", store.id)
    .in("external_product_id", externalIds);
  if (!products || products.length === 0) return json({ kits: {} }, 200);

  const internalToExternal = new Map(
    products.map((p) => [p.id as string, p.external_product_id as string])
  );

  // kits que contêm esses produtos
  const { data: kitItems } = await admin
    .from("kit_items")
    .select("kit_id, product_id")
    .in("product_id", Array.from(internalToExternal.keys()));
  if (!kitItems || kitItems.length === 0) return json({ kits: {} }, 200);

  const kitIds = Array.from(new Set(kitItems.map((ki) => ki.kit_id as string)));

  const { data: kits } = await admin
    .from("kits_with_items")
    .select(
      "id, name, image_url, original_price, final_price, nuvemshop_url, nuvemshop_product_id, active, items_count"
    )
    .in("id", kitIds)
    .eq("active", true);

  // só kits ativos e já sincronizados (têm produto na loja)
  const kitMap = new Map(
    (kits ?? [])
      .filter((k) => k.nuvemshop_product_id)
      .map((k) => [k.id as string, k])
  );

  const result: Record<string, unknown[]> = {};
  for (const ki of kitItems) {
    const kit = kitMap.get(ki.kit_id as string);
    if (!kit) continue;
    const ext = internalToExternal.get(ki.product_id as string);
    if (!ext) continue;
    if (!result[ext]) result[ext] = [];
    if ((result[ext] as { id: string }[]).some((c) => c.id === kit.id)) continue;

    const original = Number(kit.original_price ?? 0);
    const final = Number(kit.final_price ?? 0);
    result[ext].push({
      id: kit.id,
      name: kit.name,
      imageUrl: kit.image_url,
      originalPrice: original || null,
      finalPrice: final || null,
      discountPercent:
        original > 0 && final < original
          ? discountPercent(original, final)
          : null,
      url: kit.nuvemshop_url,
      itemsCount: kit.items_count,
    });
  }

  return json({ kits: result }, 200);
}

function json(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { ...CORS_HEADERS, "cache-control": "public, max-age=60" },
  });
}
