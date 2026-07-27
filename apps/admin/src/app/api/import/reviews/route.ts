import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

interface IncomingReview {
  product_id: string;
  customer_name: string;
  customer_email?: string | null;
  rating: number;
  title?: string | null;
  comment?: string | null;
  created_at?: string | null; // ISO; opcional, default agora
  verified_purchase?: boolean;
}

interface Body {
  reviews: IncomingReview[];
  status: "approved" | "pending";
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (!Array.isArray(body.reviews) || body.reviews.length === 0) {
    return NextResponse.json({ error: "Nenhuma avaliação enviada" }, { status: 400 });
  }
  if (!["approved", "pending"].includes(body.status)) {
    return NextResponse.json({ error: "Status inválido" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: store } = await admin
    .from("stores")
    .select("id")
    .limit(1)
    .maybeSingle();
  if (!store) {
    return NextResponse.json({ error: "Conecte uma loja primeiro" }, { status: 400 });
  }

  const now = new Date().toISOString();

  const rows = body.reviews
    .filter(
      (r) =>
        r.product_id &&
        Number.isFinite(r.rating) &&
        r.rating >= 1 &&
        r.rating <= 5 &&
        r.customer_name?.trim()
    )
    .map((r) => ({
      store_id: store.id,
      product_id: r.product_id,
      customer_name: r.customer_name.trim().slice(0, 80),
      customer_email: r.customer_email?.trim() || null,
      rating: Math.round(r.rating),
      title: r.title?.trim()?.slice(0, 120) || null,
      comment: r.comment?.trim()?.slice(0, 1500) || null,
      status: body.status,
      verified_purchase: r.verified_purchase ?? false,
      created_at: r.created_at ?? now,
      moderated_at: body.status === "approved" ? now : null,
    }));

  if (rows.length === 0) {
    return NextResponse.json({ error: "Nenhuma linha válida" }, { status: 400 });
  }

  // Insere em lotes de 500 para não estourar limite
  const batchSize = 500;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const slice = rows.slice(i, i + batchSize);
    const { error, count } = await admin
      .from("reviews")
      .insert(slice, { count: "exact" });
    if (error) {
      return NextResponse.json(
        { error: error.message, inserted },
        { status: 500 }
      );
    }
    inserted += count ?? slice.length;
  }

  return NextResponse.json({ ok: true, inserted, skipped: body.reviews.length - rows.length });
}
