import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import {
  cancelAbandonedCartForOrder,
  cancelMessagesForOrder,
  queuePostPurchaseMessage,
  summarizeProducts,
} from "@/lib/automations";
import { fetchOrder } from "@/lib/nuvemshop";
import { createAdminClient } from "@/lib/supabase/admin";

const HANDLED_EVENTS = [
  "order/created",
  "order/paid",
  "order/fulfilled",
  "order/cancelled",
] as const;

// A fila usa chaves únicas e consultas de existência porque a Nuvemshop
// pode reenviar eventos ou entregá-los fora de ordem.
export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("x-linkedstore-hmac-sha256");

  if (!isValidSignature(body, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: { store_id: number; event: string; id: number };
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!HANDLED_EVENTS.includes(payload.event as (typeof HANDLED_EVENTS)[number])) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const admin = createAdminClient();
  const externalStoreId = String(payload.store_id);
  const externalOrderId = String(payload.id);
  const { data: store } = await admin
    .from("stores")
    .select("id, name, domain, access_token")
    .eq("platform", "nuvemshop")
    .eq("external_store_id", externalStoreId)
    .maybeSingle();

  if (!store?.access_token) {
    return NextResponse.json({ error: "Store not connected" }, { status: 404 });
  }

  const order = await fetchOrder(externalStoreId, store.access_token, payload.id);
  const customerName = order.customer?.name || order.contact_name || "Cliente";
  const customerEmail = order.customer?.email || order.contact_email || null;
  const customerPhone = order.customer?.phone || order.contact_phone || null;

  const { data: orderRow, error: orderError } = await admin
    .from("orders")
    .upsert(
      {
        store_id: store.id,
        external_order_id: externalOrderId,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        status: order.payment_status || order.status,
        ordered_at: order.created_at,
        delivered_at: order.shipped_at || null,
      },
      { onConflict: "store_id,external_order_id" }
    )
    .select("id")
    .single();

  if (orderError || !orderRow) {
    return NextResponse.json(
      { error: orderError?.message || "Failed to upsert order" },
      { status: 500 }
    );
  }

  // Qualquer pedido originado do checkout invalida a recuperação de carrinho.
  await cancelAbandonedCartForOrder(admin, store.id, order.token);

  if (payload.event === "order/cancelled") {
    await Promise.all([
      cancelMessagesForOrder(admin, {
        storeId: store.id,
        externalOrderId,
        sourceToken: order.token,
      }),
      admin
        .from("review_requests")
        .update({ status: "cancelled", error_message: "Pedido cancelado" })
        .eq("order_id", orderRow.id)
        .eq("status", "scheduled"),
    ]);
    return NextResponse.json({ ok: true, cancelled: true });
  }

  const localProducts: Array<{
    id: string;
    name: string;
    imageUrl: string | null;
  }> = [];
  const localNamesByExternalId = new Map<string, string>();
  for (const item of order.products ?? []) {
    const { data: product } = await admin
      .from("products")
      .select("id, name, image_url")
      .eq("store_id", store.id)
      .eq("external_product_id", String(item.product_id))
      .maybeSingle();
    if (!product) continue;

    const productName = item.name || product.name;
    localProducts.push({
      id: product.id,
      name: productName,
      imageUrl: product.image_url,
    });
    localNamesByExternalId.set(String(item.product_id), productName);

    await admin.from("order_items").upsert(
      { order_id: orderRow.id, product_id: product.id, quantity: item.quantity },
      { onConflict: "order_id,product_id" }
    );
  }

  const { data: settings } = await admin
    .from("store_settings")
    .select(
      `request_delay_days, review_request_delay_minutes,
       email_enabled, whatsapp_enabled, post_purchase_enabled,
       post_purchase_delay_hours, post_purchase_delay_minutes,
       post_purchase_attachment_type, post_purchase_attachment_url`
    )
    .eq("store_id", store.id)
    .maybeSingle();

  if (payload.event === "order/created") {
    const productsSummary = summarizeProducts(
      (order.products ?? []).map((item) => ({
        name:
          item.name ||
          localNamesByExternalId.get(String(item.product_id)) ||
          "Produto",
        quantity: item.quantity,
      }))
    );

    if (settings?.post_purchase_enabled && customerPhone) {
      const createdAt = new Date(order.created_at).getTime();
      const baseTime = Number.isFinite(createdAt) ? createdAt : Date.now();
      const delayMinutes = Math.max(
        0,
        settings.post_purchase_delay_minutes ??
          (settings.post_purchase_delay_hours ?? 0) * 60
      );
      const attachmentUrl = resolveAttachmentUrl(
        settings.post_purchase_attachment_type,
        settings.post_purchase_attachment_url,
        localProducts.find((product) => product.imageUrl)?.imageUrl || null
      );
      await queuePostPurchaseMessage(admin, {
        storeId: store.id,
        externalReference: externalOrderId,
        referenceLabel: String(order.number || externalOrderId),
        sourceToken: order.token,
        customerName,
        customerPhone,
        productsSummary: productsSummary || "seus produtos",
        link: store.domain ? normalizeStoreUrl(store.domain) : null,
        scheduledFor: new Date(baseTime + delayMinutes * 60_000).toISOString(),
        attachmentUrl,
      });
    }

    return NextResponse.json({ ok: true, orderCreated: true });
  }

  // A solicitação de avaliação continua sendo uma automação de pós-venda
  // independente da confirmação enviada na criação do pedido.
  const reviewDelayMinutes = Math.max(
    10,
    settings?.review_request_delay_minutes ??
      (settings?.request_delay_days ?? 7) * 1_440
  );
  const reviewScheduledFor = new Date(
    Date.now() + reviewDelayMinutes * 60_000
  ).toISOString();

  for (const product of localProducts) {
    const channels: Array<"email" | "whatsapp"> = [];
    if (settings?.email_enabled && customerEmail) channels.push("email");
    if (settings?.whatsapp_enabled && customerPhone) channels.push("whatsapp");

    for (const channel of channels) {
      const { data: existing } = await admin
        .from("review_requests")
        .select("id")
        .eq("order_id", orderRow.id)
        .eq("product_id", product.id)
        .eq("channel", channel)
        .maybeSingle();
      if (existing) continue;

      await admin.from("review_requests").insert({
        store_id: store.id,
        order_id: orderRow.id,
        product_id: product.id,
        channel,
        scheduled_for: reviewScheduledFor,
      });
    }
  }

  return NextResponse.json({ ok: true });
}

function isValidSignature(body: string, signature: string | null): boolean {
  const secret = process.env.NUVEMSHOP_CLIENT_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  if (!signature) return false;

  const expected = createHmac("sha256", secret).update(body).digest("base64");
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  return (
    expectedBuffer.length === signatureBuffer.length &&
    timingSafeEqual(expectedBuffer, signatureBuffer)
  );
}

function normalizeStoreUrl(domain: string): string {
  return domain.startsWith("http://") || domain.startsWith("https://")
    ? domain
    : `https://${domain}`;
}

function resolveAttachmentUrl(
  type: string | null | undefined,
  libraryUrl: string | null | undefined,
  productImageUrl: string | null
): string | null {
  if (type === "library") return libraryUrl || null;
  if (type === "product_image") return productImageUrl;
  return null;
}
