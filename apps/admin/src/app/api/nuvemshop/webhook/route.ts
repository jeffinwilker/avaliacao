import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchOrder } from "@/lib/nuvemshop";
import { createHmac } from "crypto";

// Webhook da Nuvemshop. Eventos relevantes:
//   - order/paid: cria solicitação de avaliação (com delay)
//   - order/fulfilled: idem (se já passou pelo paid, ignora dup)
//
// Doc: https://tiendanube.github.io/api-documentation/resources/webhook
// Assinatura: HMAC-SHA256 do body usando o client_secret, header x-linkedstore-hmac-sha256

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("x-linkedstore-hmac-sha256");

  const secret = process.env.NUVEMSHOP_CLIENT_SECRET;
  if (secret && signature) {
    const expected = createHmac("sha256", secret).update(body).digest("base64");
    if (expected !== signature) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  let payload: { store_id: number; event: string; id: number };
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { store_id: externalStoreId, event, id: orderId } = payload;

  if (!["order/paid", "order/fulfilled"].includes(event)) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const admin = createAdminClient();
  const { data: store } = await admin
    .from("stores")
    .select("id, access_token")
    .eq("platform", "nuvemshop")
    .eq("external_store_id", String(externalStoreId))
    .maybeSingle();

  if (!store?.access_token) {
    return NextResponse.json({ error: "Store not connected" }, { status: 404 });
  }

  // Busca o pedido completo na API
  const order = await fetchOrder(String(externalStoreId), store.access_token, orderId);

  // Upsert do pedido
  const { data: orderRow } = await admin
    .from("orders")
    .upsert(
      {
        store_id: store.id,
        external_order_id: String(order.id),
        customer_name: order.customer.name,
        customer_email: order.customer.email ?? null,
        customer_phone: order.customer.phone ?? null,
        status: order.status,
        ordered_at: order.created_at,
        delivered_at: order.shipped_at ?? null,
      },
      { onConflict: "store_id,external_order_id" }
    )
    .select("id")
    .single();

  if (!orderRow) {
    return NextResponse.json({ error: "Failed to upsert order" }, { status: 500 });
  }

  // Settings
  const { data: settings } = await admin
    .from("store_settings")
    .select("request_delay_days, email_enabled, whatsapp_enabled")
    .eq("store_id", store.id)
    .maybeSingle();

  const delay = settings?.request_delay_days ?? 7;
  const scheduledFor = new Date(Date.now() + delay * 86400_000).toISOString();

  // Para cada produto do pedido, cria solicitações (uma por canal)
  for (const item of order.products) {
    const { data: product } = await admin
      .from("products")
      .select("id")
      .eq("store_id", store.id)
      .eq("external_product_id", String(item.product_id))
      .maybeSingle();
    if (!product) continue;

    await admin.from("order_items").upsert(
      { order_id: orderRow.id, product_id: product.id, quantity: item.quantity },
      { onConflict: "order_id,product_id" } as never
    );

    const channels: ("email" | "whatsapp")[] = [];
    if (settings?.email_enabled && order.customer.email) channels.push("email");
    if (settings?.whatsapp_enabled && order.customer.phone) channels.push("whatsapp");

    for (const channel of channels) {
      // evita duplicados
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
        scheduled_for: scheduledFor,
      });
    }
  }

  return NextResponse.json({ ok: true });
}
