import { NextResponse, type NextRequest } from "next/server";
import { resolveReelVideoUrl } from "@/lib/reel-storage";
import { createAdminClient } from "@/lib/supabase/admin";

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
  const idsParam = searchParams.get("productIds") ?? searchParams.get("productId");
  if (!apiKey || !idsParam) {
    return json({ error: "apiKey e productIds obrigatórios" }, 400);
  }

  const externalIds = idsParam
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, MAX_IDS);
  if (externalIds.length === 0) return json({ reels: {} }, 200);

  const admin = createAdminClient();
  const { data: store } = await admin
    .from("stores")
    .select("id")
    .eq("api_key", apiKey)
    .maybeSingle();
  if (!store) return json({ error: "API key inválida" }, 401);

  const { data: products } = await admin
    .from("products")
    .select("id, external_product_id, name, url")
    .eq("store_id", store.id)
    .in("external_product_id", externalIds);
  if (!products || products.length === 0) return json({ reels: {} }, 200);

  const productMap = new Map(
    products.map((product) => [
      product.id as string,
      {
        externalId: product.external_product_id as string,
        name: product.name as string,
        url: product.url as string | null,
      },
    ])
  );

  const { data: reels, error } = await admin
    .from("product_reels")
    .select(
      "id, product_id, title, video_url, storage_provider, storage_path, thumbnail_url"
    )
    .eq("store_id", store.id)
    .in("product_id", Array.from(productMap.keys()))
    .eq("active", true)
    .order("ordering", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) {
    return migrationMissing(error.message)
      ? json({ reels: {} }, 200)
      : json({ error: error.message }, 500);
  }

  const result: Record<string, unknown[]> = {};
  for (const reel of reels ?? []) {
    const product = productMap.get(reel.product_id as string);
    if (!product) continue;
    if (!result[product.externalId]) result[product.externalId] = [];
    result[product.externalId].push({
      id: reel.id,
      title: reel.title,
      videoUrl: resolveReelVideoUrl({
        videoUrl: reel.video_url,
        storageProvider: reel.storage_provider,
        storagePath: reel.storage_path,
      }),
      thumbnailUrl: reel.thumbnail_url,
      productName: product.name,
      productUrl: product.url,
    });
  }

  return json({ reels: result }, 200);
}

function json(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { ...CORS_HEADERS, "cache-control": "public, max-age=60" },
  });
}

function migrationMissing(message: string): boolean {
  return (
    message.includes("product_reels") &&
    (message.includes("schema cache") || message.includes("does not exist"))
  );
}
