import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { STORAGE_BUCKET } from "@avaliacoes/shared";

// Endpoint público chamado pelo widget para enviar avaliações.
// Valida via api_key da loja. Suporta upload de mídia (multipart/form-data).
//
// CORS: permite qualquer origem (o widget roda no domínio do cliente).

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

const MAX_MEDIA_BYTES = 20 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/quicktime",
]);

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    const apiKey = String(form.get("apiKey") ?? "");
    const externalProductId = String(form.get("externalProductId") ?? "");
    const customerName = String(form.get("customerName") ?? "").trim();
    const customerEmail = (form.get("customerEmail") as string | null)?.trim() || null;
    const rating = Number(form.get("rating"));
    const title = (form.get("title") as string | null)?.trim() || null;
    const comment = (form.get("comment") as string | null)?.trim() || null;
    const token = (form.get("token") as string | null) || null;

    if (!apiKey || !externalProductId) {
      return json({ error: "apiKey e externalProductId obrigatórios" }, 400);
    }
    if (!customerName) return json({ error: "Informe seu nome" }, 400);
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return json({ error: "Nota inválida" }, 400);
    }

    const admin = createAdminClient();

    const { data: store } = await admin
      .from("stores")
      .select("id, name")
      .eq("api_key", apiKey)
      .maybeSingle();
    if (!store) return json({ error: "API key inválida" }, 401);

    const { data: settings } = await admin
      .from("store_settings")
      .select("auto_publish, allow_media, max_media_per_review")
      .eq("store_id", store.id)
      .maybeSingle();

    const { data: product } = await admin
      .from("products")
      .select("id")
      .eq("store_id", store.id)
      .eq("external_product_id", externalProductId)
      .maybeSingle();
    if (!product) return json({ error: "Produto não encontrado" }, 404);

    // Token de solicitação → pré-verifica compra
    let orderId: string | null = null;
    let reviewRequestId: string | null = null;
    let verified = false;
    if (token) {
      const { data: reqRow } = await admin
        .from("review_requests")
        .select("id, order_id, product_id, store_id, status")
        .eq("token", token)
        .maybeSingle();

      if (
        !reqRow ||
        reqRow.product_id !== product.id ||
        reqRow.store_id !== store.id
      ) {
        return json({ error: "Convite de avaliação inválido" }, 400);
      }

      if (reqRow.status === "completed") {
        return json({ error: "Esta avaliação já foi enviada" }, 409);
      }
      if (!["scheduled", "sent"].includes(reqRow.status)) {
        return json({ error: "Este convite não está mais disponível" }, 410);
      }

      reviewRequestId = reqRow.id;
      orderId = reqRow.order_id;
      verified = true;
    }

    const status = settings?.auto_publish ? "approved" : "pending";

    const { data: review, error: reviewErr } = await admin
      .from("reviews")
      .insert({
        store_id: store.id,
        product_id: product.id,
        order_id: orderId,
        customer_name: customerName,
        customer_email: customerEmail,
        rating,
        title,
        comment,
        status,
        verified_purchase: verified,
        moderated_at: settings?.auto_publish ? new Date().toISOString() : null,
      })
      .select("id")
      .single();

    if (reviewErr) return json({ error: reviewErr.message }, 500);

    // Upload de mídia
    if (settings?.allow_media !== false) {
      const files = form.getAll("media") as File[];
      const max = settings?.max_media_per_review ?? 5;
      const allowed = files.slice(0, max);
      let ordering = 0;
      for (const f of allowed) {
        if (!f || typeof f === "string") continue;
        if (f.size === 0 || f.size > MAX_MEDIA_BYTES) continue;
        if (!ALLOWED_MIME.has(f.type)) continue;

        const ext = f.name.split(".").pop()?.toLowerCase() ?? "bin";
        const path = `${review.id}/${crypto.randomUUID()}.${ext}`;
        const buf = Buffer.from(await f.arrayBuffer());

        const { error: upErr } = await admin.storage
          .from(STORAGE_BUCKET)
          .upload(path, buf, { contentType: f.type, upsert: false });
        if (upErr) continue;

        const { data: publicUrl } = admin.storage
          .from(STORAGE_BUCKET)
          .getPublicUrl(path);

        await admin.from("review_media").insert({
          review_id: review.id,
          type: f.type.startsWith("video") ? "video" : "image",
          storage_path: path,
          url: publicUrl.publicUrl,
          ordering: ordering++,
        });
      }
    }

    if (reviewRequestId) {
      await admin
        .from("review_requests")
        .update({ status: "completed", error_message: null })
        .eq("id", reviewRequestId);
    }

    return json({ ok: true, review_id: review.id }, 200);
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
}

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}
