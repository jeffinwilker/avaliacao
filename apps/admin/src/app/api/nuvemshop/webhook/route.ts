import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import {
  cancelAbandonedCartForOrder,
  cancelMessagesForOrder,
  parsePostSaleSequence,
  queueBirthdayCollectionMessage,
  queuePostPurchaseMessage,
  summarizeProducts,
} from "@/lib/automations";
import {
  fetchCustomer,
  fetchFulfillmentOrder,
  fetchOrder,
  type NuvemshopFulfillmentOrder,
} from "@/lib/nuvemshop";
import {
  customerMigrationError,
  markNuvemshopCustomerInactive,
  upsertNuvemshopCustomer,
  upsertOrderCustomer,
} from "@/lib/customers";
import { createAdminClient } from "@/lib/supabase/admin";

const HANDLED_EVENTS = [
  "order/created",
  "order/paid",
  "order/packed",
  "order/fulfilled",
  "order/cancelled",
  "customer/created",
  "customer/updated",
  "customer/deleted",
  "fulfillment_order/status_updated",
  "fulfillment_order/label_status_updated",
  "fulfillment_order/tracking_event_created",
  "fulfillment_order/tracking_event_updated",
] as const;

interface WebhookPayload {
  store_id: number | string;
  event: string;
  id?: number | string;
  order_id?: number | string;
  fulfillment_id?: string;
  tracking_event_id?: string;
  status?: string;
  tracking_info?: { code?: string | null; url?: string | null } | null;
}

// A fila usa chaves únicas e consultas de existência porque a Nuvemshop
// pode reenviar eventos ou entregá-los fora de ordem.
export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("x-linkedstore-hmac-sha256");

  if (!isValidSignature(body, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: WebhookPayload;
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
  const { data: store } = await admin
    .from("stores")
    .select("id, name, domain, access_token")
    .eq("platform", "nuvemshop")
    .eq("external_store_id", externalStoreId)
    .maybeSingle();

  if (!store?.access_token) {
    return NextResponse.json({ error: "Store not connected" }, { status: 404 });
  }

  if (payload.event.startsWith("customer/")) {
    return handleCustomerWebhook({
      admin,
      storeId: store.id,
      externalStoreId,
      token: store.access_token,
      payload,
    });
  }

  const externalOrderId = String(payload.order_id ?? payload.id ?? "");
  if (!externalOrderId) {
    return NextResponse.json({ error: "Order not informed" }, { status: 400 });
  }

  const order = await fetchOrder(
    externalStoreId,
    store.access_token,
    externalOrderId
  );
  const fulfillment = await resolveFulfillment(
    externalStoreId,
    store.access_token,
    payload.fulfillment_id,
    order.fulfillments
  );
  const trackingEvent = resolveTrackingEvent(fulfillment, payload.tracking_event_id);
  const trackingNumber =
    payload.tracking_info?.code ||
    fulfillment?.tracking_info?.code ||
    fulfillment?.tracking_info?.number ||
    order.shipping_tracking_number ||
    null;
  const trackingUrl =
    payload.tracking_info?.url ||
    fulfillment?.tracking_info?.url ||
    order.shipping_tracking_url ||
    null;
  const fulfillmentStatus = resolveFulfillmentStatus(payload, fulfillment);
  const trackingStatus = resolveTrackingStatus(payload, trackingEvent);
  const trigger = resolvePostSaleTrigger(
    payload.event,
    fulfillmentStatus,
    trackingStatus
  );
  const customerName = order.customer?.name || order.contact_name || "Cliente";
  const customerEmail = order.customer?.email || order.contact_email || null;
  const customerPhone = order.customer?.phone || order.contact_phone || null;
  const customerId = await upsertOrderCustomer(admin, {
    storeId: store.id,
    externalCustomerId: order.customer?.id ?? null,
    name: customerName,
    email: customerEmail,
    phone: customerPhone,
  }).catch(() => null);

  const { data: orderRow, error: orderError } = await admin
    .from("orders")
    .upsert(
      {
        store_id: store.id,
        external_order_id: externalOrderId,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        status: resolveOrderStatus(payload.event, order, fulfillmentStatus, trackingStatus),
        payment_status: order.payment_status || null,
        shipping_status: order.shipping_status || null,
        fulfillment_status: fulfillmentStatus,
        tracking_status: trackingStatus,
        shipping_tracking_number: trackingNumber,
        shipping_tracking_url: trackingUrl,
        tracking_updated_at:
          fulfillmentStatus || trackingStatus || trackingNumber
            ? new Date().toISOString()
            : null,
        ordered_at: order.created_at,
        ...(trackingStatus === "delivered" || fulfillmentStatus === "DELIVERED"
          ? {
              delivered_at:
                trackingEvent?.happened_at || new Date().toISOString(),
            }
          : {}),
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

  if (isDeliveryEvent(payload.event)) {
    await storeDeliveryEvent(admin, {
      storeId: store.id,
      orderId: orderRow.id,
      externalOrderId,
      payload,
      trigger: trigger || payload.event,
      status:
        trackingStatus ||
        fulfillmentStatus ||
        order.shipping_status ||
        trigger ||
        payload.event,
      description: trackingEvent?.description || null,
      trackingNumber,
      trackingUrl,
      happenedAt: trackingEvent?.happened_at || null,
    });
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
       post_purchase_whatsapp_template, post_purchase_attachment_type,
       post_purchase_attachment_url, post_sale_sequence`
    )
    .eq("store_id", store.id)
    .maybeSingle();
  const { data: birthdaySettings } = await admin
    .from("store_settings")
    .select("birthday_collection_enabled, birthday_collection_delay_minutes")
    .eq("store_id", store.id)
    .maybeSingle();

  const productsSummary = summarizeProducts(
    (order.products ?? []).map((item) => ({
      name:
        item.name ||
        localNamesByExternalId.get(String(item.product_id)) ||
        "Produto",
      quantity: item.quantity,
    }))
  );

  if (trigger && customerPhone) {
    const steps = parsePostSaleSequence(settings?.post_sale_sequence, {
      enabled: settings?.post_purchase_enabled,
      delayMinutes:
        settings?.post_purchase_delay_minutes ??
        (settings?.post_purchase_delay_hours ?? 0) * 60,
      messageTemplate: settings?.post_purchase_whatsapp_template,
      attachmentType: settings?.post_purchase_attachment_type,
      attachmentUrl: settings?.post_purchase_attachment_url,
    });
    const stepIndex = steps.findIndex((item) => item.id === trigger);
    const step = steps[stepIndex];
    if (step?.enabled && hasRequiredTracking(step.messageTemplate, trackingNumber, trackingUrl)) {
      const baseTime =
        trigger === "order_created"
          ? new Date(order.created_at).getTime()
          : Date.now();
      const attachmentUrl = resolveAttachmentUrl(
        step.attachmentType,
        step.attachmentUrl,
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
        link:
          trackingUrl ||
          (store.domain ? normalizeStoreUrl(store.domain) : null),
        scheduledFor: new Date(
          (Number.isFinite(baseTime) ? baseTime : Date.now()) +
            step.delayMinutes * 60_000
        ).toISOString(),
        attachmentUrl,
        routineStepKey: step.id,
        sequenceStep: stepIndex + 1,
        trackingCode: trackingNumber,
        trackingStatus: trackingStatus || fulfillmentStatus,
      });
    }
  }

  if (
    payload.event === "order/created" &&
    birthdaySettings?.birthday_collection_enabled &&
    customerId &&
    customerPhone
  ) {
    const delayMinutes = Math.max(
      0,
      Math.min(
        43_200,
        birthdaySettings.birthday_collection_delay_minutes ?? 1_440
      )
    );
    const orderCreatedAt = new Date(order.created_at).getTime();
    const baseTime = Number.isFinite(orderCreatedAt) ? orderCreatedAt : Date.now();
    await queueBirthdayCollectionMessage(admin, {
      storeId: store.id,
      customerId,
      orderId: orderRow.id,
      externalOrderId,
      referenceLabel: String(order.number || externalOrderId),
      customerName,
      customerPhone,
      productsSummary: productsSummary || "sua compra",
      scheduledFor: new Date(baseTime + delayMinutes * 60_000).toISOString(),
    }).catch(() => {});
  }

  if (payload.event === "order/created") {
    return NextResponse.json({ ok: true, orderCreated: true });
  }

  // O convite só nasce depois que a transportadora confirma a entrega.
  if (trigger !== "tracking_delivered") {
    return NextResponse.json({ ok: true, trigger });
  }

  const reviewDelayMinutes = Math.max(
    10,
    settings?.review_request_delay_minutes ??
      (settings?.request_delay_days ?? 1) * 1_440
  );
  const deliveredAt = trackingEvent?.happened_at
    ? new Date(trackingEvent.happened_at).getTime()
    : Date.now();
  const reviewScheduledFor = new Date(
    (Number.isFinite(deliveredAt) ? deliveredAt : Date.now()) +
      reviewDelayMinutes * 60_000
  ).toISOString();

  for (const product of localProducts) {
    const channels: Array<"email" | "whatsapp"> = [];
    if (settings?.email_enabled && customerEmail) channels.push("email");
    if (settings?.whatsapp_enabled && customerPhone) channels.push("whatsapp");

    for (const channel of channels) {
      const { data: existing } = await admin
        .from("review_requests")
        .select("id, status")
        .eq("order_id", orderRow.id)
        .eq("product_id", product.id)
        .eq("channel", channel)
        .maybeSingle();
      if (existing?.status === "cancelled") {
        await admin
          .from("review_requests")
          .update({
            status: "scheduled",
            scheduled_for: reviewScheduledFor,
            sent_at: null,
            error_message: null,
          })
          .eq("id", existing.id);
        continue;
      }
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

async function handleCustomerWebhook(input: {
  admin: ReturnType<typeof createAdminClient>;
  storeId: string;
  externalStoreId: string;
  token: string;
  payload: WebhookPayload;
}) {
  const externalCustomerId = String(input.payload.id ?? "");
  if (!externalCustomerId) {
    return NextResponse.json({ error: "Customer not informed" }, { status: 400 });
  }

  try {
    if (input.payload.event === "customer/deleted") {
      await markNuvemshopCustomerInactive(
        input.admin,
        input.storeId,
        externalCustomerId
      );
      return NextResponse.json({ ok: true, customerDeleted: true });
    }

    const customer = await fetchCustomer(
      input.externalStoreId,
      input.token,
      externalCustomerId
    );
    const action = await upsertNuvemshopCustomer(
      input.admin,
      input.storeId,
      customer
    );
    return NextResponse.json({ ok: true, customer: action });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to sync customer";
    const friendlyMessage = customerMigrationError(message);
    if (friendlyMessage !== message) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: friendlyMessage,
      });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function resolveFulfillment(
  storeId: string,
  token: string,
  fulfillmentId: string | undefined,
  fulfillments: NuvemshopFulfillmentOrder[] | undefined
): Promise<NuvemshopFulfillmentOrder | null> {
  if (fulfillmentId) {
    try {
      return await fetchFulfillmentOrder(storeId, token, fulfillmentId);
    } catch {
      // O webhook ainda pode ser processado com o status que veio no payload.
    }
  }
  return (
    fulfillments?.find((item) => item.id === fulfillmentId) ||
    fulfillments?.[0] ||
    null
  );
}

function resolveTrackingEvent(
  fulfillment: NuvemshopFulfillmentOrder | null,
  eventId: string | undefined
) {
  if (!fulfillment?.tracking_events?.length) return null;
  return (
    fulfillment.tracking_events.find((item) => item.id === eventId) ||
    fulfillment.tracking_events.at(-1) ||
    null
  );
}

function resolveFulfillmentStatus(
  payload: WebhookPayload,
  fulfillment: NuvemshopFulfillmentOrder | null
): string | null {
  if (payload.event === "fulfillment_order/status_updated" && payload.status) {
    return payload.status.toUpperCase();
  }
  return fulfillment?.status?.toUpperCase() || null;
}

function resolveTrackingStatus(
  payload: WebhookPayload,
  trackingEvent: { status: string } | null
): string | null {
  if (payload.event.includes("tracking_event") && payload.status) {
    return payload.status.toLowerCase();
  }
  return trackingEvent?.status?.toLowerCase() || null;
}

function resolvePostSaleTrigger(
  event: string,
  fulfillmentStatus: string | null,
  trackingStatus: string | null
) {
  if (event === "order/created") return "order_created" as const;
  if (event === "order/paid") return "order_paid" as const;
  if (event === "order/packed") return "order_packed" as const;
  if (event === "order/fulfilled") return "order_fulfilled" as const;

  const macroTriggers: Record<string, "order_packed" | "order_fulfilled" | "tracking_ready_for_pickup" | "tracking_delivered"> = {
    PACKED: "order_packed",
    DISPATCHED: "order_fulfilled",
    READY_FOR_PICKUP: "tracking_ready_for_pickup",
    DELIVERED: "tracking_delivered",
  };
  const trackingTriggers: Record<string, "order_fulfilled" | "tracking_in_transit" | "tracking_out_for_delivery" | "tracking_ready_for_pickup" | "tracking_delivered" | "tracking_delayed" | "tracking_delivery_attempt_failed"> = {
    dispatched: "order_fulfilled",
    received_by_post_office: "tracking_in_transit",
    in_transit: "tracking_in_transit",
    out_for_delivery: "tracking_out_for_delivery",
    ready_for_pickup: "tracking_ready_for_pickup",
    delivered: "tracking_delivered",
    delayed: "tracking_delayed",
    delivery_attempt_failed: "tracking_delivery_attempt_failed",
  };
  return (
    (trackingStatus ? trackingTriggers[trackingStatus] : null) ||
    (fulfillmentStatus ? macroTriggers[fulfillmentStatus] : null) ||
    null
  );
}

function resolveOrderStatus(
  event: string,
  order: { status: string; payment_status?: string; shipping_status?: string },
  fulfillmentStatus: string | null,
  trackingStatus: string | null
): string {
  if (event === "order/cancelled") return "cancelled";
  if (trackingStatus === "delivered" || fulfillmentStatus === "DELIVERED") {
    return "delivered";
  }
  if (trackingStatus === "out_for_delivery") return "out_for_delivery";
  if (trackingStatus === "in_transit") return "in_transit";
  if (fulfillmentStatus === "DISPATCHED" || order.shipping_status === "fulfilled") {
    return "fulfilled";
  }
  if (fulfillmentStatus === "PACKED" || event === "order/packed") return "packed";
  return order.payment_status || order.status;
}

function hasRequiredTracking(
  template: string,
  trackingNumber: string | null,
  trackingUrl: string | null
): boolean {
  const usesTracking =
    template.includes("{{codigo_rastreio}}") ||
    template.includes("{{link_rastreio}}");
  if (usesTracking && !trackingNumber && !trackingUrl) return false;
  return true;
}

function isDeliveryEvent(event: string): boolean {
  return (
    event === "order/packed" ||
    event === "order/fulfilled" ||
    event.startsWith("fulfillment_order/")
  );
}

async function storeDeliveryEvent(
  admin: ReturnType<typeof createAdminClient>,
  input: {
    storeId: string;
    orderId: string;
    externalOrderId: string;
    payload: WebhookPayload;
    trigger: string;
    status: string;
    description: string | null;
    trackingNumber: string | null;
    trackingUrl: string | null;
    happenedAt: string | null;
  }
) {
  const eventIdentity =
    input.payload.tracking_event_id || input.payload.fulfillment_id || input.externalOrderId;
  await admin.from("order_delivery_events").upsert(
    {
      store_id: input.storeId,
      order_id: input.orderId,
      external_event_key: `${input.payload.event}:${eventIdentity}:${input.status}`,
      event_type: input.payload.event,
      status: input.status,
      description: input.description,
      tracking_number: input.trackingNumber,
      tracking_url: input.trackingUrl,
      happened_at: input.happenedAt,
    },
    { onConflict: "store_id,external_event_key", ignoreDuplicates: true }
  );
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
