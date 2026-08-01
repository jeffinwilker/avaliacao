import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// POST /api/products/details — retorna descrição + galeria de imagens
// para uma lista de produtos (usado pelos botões "puxar imagens/descrições"
// do formulário de kit). Só os IDs selecionados, pra manter leve.

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body.ids) ? body.ids.slice(0, 50) : [];
  if (ids.length === 0) return NextResponse.json({ products: [] });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("products")
    .select("id, name, description, image_url, images")
    .in("id", ids);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Preserva a ordem dos IDs recebidos
  const byId = new Map((data ?? []).map((p) => [p.id, p]));
  const products = ids
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((p) => {
      const row = p as {
        id: string;
        name: string;
        description: string | null;
        image_url: string | null;
        images: string[] | null;
      };
      const imgs =
        Array.isArray(row.images) && row.images.length > 0
          ? row.images
          : row.image_url
          ? [row.image_url]
          : [];
      return {
        id: row.id,
        name: row.name,
        description: row.description ?? null,
        images: imgs,
      };
    });

  return NextResponse.json({ products });
}
