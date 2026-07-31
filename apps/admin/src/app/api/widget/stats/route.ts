import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Endpoint público: batch stats de vários produtos numa única chamada.
// Usado pelo widget em páginas de vitrine/categoria pra evitar N requests.
//
// GET /api/widget/stats?apiKey=xxx&productIds=id1,id2,id3

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

const MAX_IDS_PER_REQUEST = 100;

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const apiKey = searchParams.get("apiKey");
  const idsParam = searchParams.get("productIds");

  if (!apiKey || !idsParam) {
    return json({ error: "apiKey e productIds são obrigatórios" }, 400);
  }

  const externalIds = idsParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_IDS_PER_REQUEST);

  if (externalIds.length === 0) {
    return json({ stats: {} }, 200);
  }

  const admin = createAdminClient();

  const { data: store } = await admin
    .from("stores")
    .select("id")
    .eq("api_key", apiKey)
    .maybeSingle();
  if (!store) return json({ error: "API key inválida" }, 401);

  const { data: products } = await admin
    .from("products")
    .select("id, external_product_id")
    .eq("store_id", store.id)
    .in("external_product_id", externalIds);

  if (!products || products.length === 0) {
    return json({ stats: {} }, 200);
  }

  const idToExternal = new Map(
    products.map((p) => [p.id as string, p.external_product_id as string])
  );

  const { data: statsRows } = await admin
    .from("product_review_stats")
    .select(
      "product_id, total_reviews, average_rating, rating_5, rating_4, rating_3, rating_2, rating_1"
    )
    .in("product_id", Array.from(idToExternal.keys()));

  const stats: Record<string, unknown> = {};
  for (const s of statsRows ?? []) {
    const externalId = idToExternal.get(s.product_id as string);
    if (!externalId) continue;
    stats[externalId] = {
      productId: externalId,
      totalReviews: s.total_reviews,
      averageRating: Number(s.average_rating ?? 0),
      rating5: s.rating_5,
      rating4: s.rating_4,
      rating3: s.rating_3,
      rating2: s.rating_2,
      rating1: s.rating_1,
    };
  }

  return json({ stats }, 200);
}

function json(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: {
      ...CORS_HEADERS,
      "cache-control": "public, max-age=60",
    },
  });
}
