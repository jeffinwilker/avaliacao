import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Endpoint público: dado o produto-kit (nuvemshop_product_id), retorna os
// produtos individuais que compõem o kit. Usado na PÁGINA DO KIT pra mostrar
// "Produtos do kit". Se o produto não for um kit, retorna vazio.
//
// GET /api/widget/kit-contents?apiKey=xxx&productId=<id do produto-kit>

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const apiKey = searchParams.get("apiKey");
  const productId = searchParams.get("productId");
  if (!apiKey || !productId) {
    return json({ error: "apiKey e productId obrigatórios" }, 400);
  }

  const admin = createAdminClient();

  const { data: store } = await admin
    .from("stores")
    .select("id")
    .eq("api_key", apiKey)
    .maybeSingle();
  if (!store) return json({ error: "API key inválida" }, 401);

  // Encontra o kit cujo produto-kit é este productId
  const { data: kit } = await admin
    .from("kits")
    .select("id, name")
    .eq("store_id", store.id)
    .eq("nuvemshop_product_id", String(productId))
    .eq("active", true)
    .maybeSingle();

  if (!kit) return json({ items: [] }, 200);

  const { data: items } = await admin
    .from("kit_items")
    .select(
      `quantity, ordering,
       product:products (external_product_id, name, image_url, url)`
    )
    .eq("kit_id", kit.id)
    .order("ordering");

  const list = (items ?? [])
    .map((it) => {
      const p = (Array.isArray(it.product) ? it.product[0] : it.product) as
        | {
            external_product_id: string;
            name: string;
            image_url: string | null;
            url: string | null;
          }
        | null
        | undefined;
      if (!p) return null;
      return {
        id: p.external_product_id,
        name: p.name,
        imageUrl: p.image_url,
        url: p.url,
        quantity: it.quantity,
      };
    })
    .filter(Boolean);

  return json({ kitName: kit.name, items: list }, 200);
}

function json(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { ...CORS_HEADERS, "cache-control": "public, max-age=60" },
  });
}
