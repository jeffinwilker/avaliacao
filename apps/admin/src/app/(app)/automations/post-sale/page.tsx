import {
  DEFAULT_BIRTHDAY_COLLECTION_WHATSAPP_TEMPLATE,
  DEFAULT_POST_PURCHASE_WHATSAPP_TEMPLATE,
  DEFAULT_WHATSAPP_TEMPLATE,
} from "@avaliacoes/shared";
import { createAdminClient } from "@/lib/supabase/admin";
import { listAutomationMedia } from "@/lib/automation-media";
import { parsePostSaleSequence } from "@/lib/automations";
import { AutomationNav } from "../AutomationNav";
import { RunAutomationsButton } from "../RunAutomationsButton";
import {
  PostSaleDashboard,
  type PostSaleMessageView,
  type PostSaleOrderView,
  type ReviewRequestView,
} from "./PostSaleDashboard";

type AutomationSection = "orders" | "messages" | "routines";

export default async function PostSalePage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const params = await searchParams;
  const section = normalizeSection(params.section);
  const admin = createAdminClient();
  const { data: store } = await admin
    .from("stores")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (!store) {
    return <div className="p-8 text-gray-600">Conecte uma loja primeiro.</div>;
  }

  const [settingsResult, ordersResult, postPurchaseResult, reviewsResult, deliveryEventsResult, mediaAssets] =
    await Promise.all([
      admin
        .from("store_settings")
        .select(
          `whatsapp_enabled, request_delay_days, review_request_delay_minutes,
           whatsapp_template, post_purchase_enabled, post_purchase_delay_hours,
           post_purchase_delay_minutes, whatsapp_attachment_type,
           whatsapp_attachment_url, post_purchase_whatsapp_template,
           post_purchase_attachment_type, post_purchase_attachment_url,
           post_sale_sequence, birthday_collection_enabled,
           birthday_collection_delay_minutes,
           birthday_collection_whatsapp_template`
        )
        .eq("store_id", store.id)
        .maybeSingle(),
      admin
        .from("orders")
        .select(
          `id, external_order_id, customer_name, customer_email, customer_phone,
           status, payment_status, shipping_status, fulfillment_status,
           tracking_status, shipping_tracking_number, shipping_tracking_url,
           tracking_updated_at, ordered_at,
           order_items (quantity, product:products (id, name, image_url))`
        )
        .eq("store_id", store.id)
        .order("ordered_at", { ascending: false })
        .limit(200),
      admin
        .from("automation_messages")
        .select(
          `external_reference, routine_step_key, tracking_code, tracking_status,
           status, scheduled_for, sent_at, error_message`
        )
        .eq("store_id", store.id)
        .eq("automation_type", "post_purchase")
        .order("created_at", { ascending: false })
        .limit(200),
      admin
        .from("review_requests")
        .select(
          `id, order_id, product_id, status, scheduled_for, sent_at, error_message`
        )
        .eq("store_id", store.id)
        .eq("channel", "whatsapp")
        .order("created_at", { ascending: false })
        .limit(500),
      admin
        .from("order_delivery_events")
        .select(
          `order_id, event_type, status, description, tracking_number,
           tracking_url, happened_at, created_at`
        )
        .eq("store_id", store.id)
        .order("created_at", { ascending: false })
        .limit(1000),
      listAutomationMedia(admin, store.id),
    ]);

  if (
    settingsResult.error ||
    ordersResult.error ||
    postPurchaseResult.error ||
    reviewsResult.error ||
    deliveryEventsResult.error
  ) {
    return <MigrationNotice />;
  }

  const settings = settingsResult.data;
  const orders = normalizeOrders(
    ordersResult.data ?? [],
    postPurchaseResult.data ?? [],
    reviewsResult.data ?? [],
    deliveryEventsResult.data ?? []
  );

  return (
    <div className="space-y-6 p-5 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{sectionTitle(section)}</h1>
          <p className="mt-1 text-sm text-gray-600">
            {sectionDescription(section)}
          </p>
        </div>
        {section === "orders" && <RunAutomationsButton />}
      </div>

      <AutomationNav />

      <PostSaleDashboard
        storeId={store.id}
        initialReviewEnabled={settings?.whatsapp_enabled ?? false}
        initialReviewDelayMinutes={
          settings?.review_request_delay_minutes ??
          (settings?.request_delay_days ?? 1) * 1_440
        }
        initialReviewTemplate={
          settings?.whatsapp_template ?? DEFAULT_WHATSAPP_TEMPLATE
        }
        initialReviewAttachmentType={settings?.whatsapp_attachment_type ?? "none"}
        initialReviewAttachmentUrl={settings?.whatsapp_attachment_url ?? null}
        initialPostSaleSequence={parsePostSaleSequence(
          settings?.post_sale_sequence,
          {
            enabled: settings?.post_purchase_enabled,
            delayMinutes:
              settings?.post_purchase_delay_minutes ??
              (settings?.post_purchase_delay_hours ?? 24) * 60,
            messageTemplate:
              settings?.post_purchase_whatsapp_template ??
              DEFAULT_POST_PURCHASE_WHATSAPP_TEMPLATE,
            attachmentType: settings?.post_purchase_attachment_type ?? "none",
            attachmentUrl: settings?.post_purchase_attachment_url ?? null,
          }
        )}
        initialMediaAssets={mediaAssets}
        initialBirthdayEnabled={settings?.birthday_collection_enabled === true}
        initialBirthdayDelayMinutes={
          settings?.birthday_collection_delay_minutes ?? 1_440
        }
        initialBirthdayTemplate={
          settings?.birthday_collection_whatsapp_template ??
          DEFAULT_BIRTHDAY_COLLECTION_WHATSAPP_TEMPLATE
        }
        orders={orders}
        mode={section === "routines" ? "routine" : section}
      />
    </div>
  );
}

function normalizeSection(value: string | undefined): AutomationSection {
  return value === "messages" || value === "routines" ? value : "orders";
}

function sectionTitle(section: AutomationSection): string {
  if (section === "messages") return "Mensagens";
  if (section === "routines") return "Rotinas";
  return "Pedidos e envios";
}

function sectionDescription(section: AutomationSection): string {
  if (section === "messages") {
    return "Personalize a confirmação do pedido e o convite de avaliação.";
  }
  if (section === "routines") {
    return "Ative os envios e escolha o tempo em minutos, horas ou dias.";
  }
  return "Veja os pedidos, produtos e o status de cada mensagem enviada.";
}

function normalizeOrders(
  rows: unknown[],
  postPurchaseRows: unknown[],
  reviewRows: unknown[],
  deliveryEventRows: unknown[]
): PostSaleOrderView[] {
  const postPurchaseByOrder = new Map<string, PostSaleMessageView[]>();
  for (const value of postPurchaseRows) {
    const row = asRecord(value);
    if (!row) continue;
    const reference = String(row.external_reference || "");
    const messages = postPurchaseByOrder.get(reference) ?? [];
    messages.push({
      stepId: String(row.routine_step_key || "order_created"),
      trackingCode:
        typeof row.tracking_code === "string" ? row.tracking_code : null,
      trackingStatus:
        typeof row.tracking_status === "string" ? row.tracking_status : null,
      status: String(row.status || "scheduled"),
      scheduledFor: String(row.scheduled_for || ""),
      sentAt: typeof row.sent_at === "string" ? row.sent_at : null,
      errorMessage:
        typeof row.error_message === "string" ? row.error_message : null,
    });
    postPurchaseByOrder.set(reference, messages);
  }

  const deliveryEventsByOrder = new Map<string, PostSaleOrderView["deliveryEvents"]>();
  for (const value of deliveryEventRows) {
    const row = asRecord(value);
    if (!row) continue;
    const orderId = String(row.order_id || "");
    const events = deliveryEventsByOrder.get(orderId) ?? [];
    events.push({
      eventType: String(row.event_type || ""),
      status: String(row.status || ""),
      description: typeof row.description === "string" ? row.description : null,
      happenedAt:
        typeof row.happened_at === "string"
          ? row.happened_at
          : String(row.created_at || ""),
    });
    deliveryEventsByOrder.set(orderId, events);
  }

  const reviewsByOrder = new Map<string, Array<Record<string, unknown>>>();
  for (const value of reviewRows) {
    const row = asRecord(value);
    if (!row) continue;
    const orderId = String(row.order_id || "");
    const list = reviewsByOrder.get(orderId) ?? [];
    list.push(row);
    reviewsByOrder.set(orderId, list);
  }

  return rows.flatMap((value) => {
    const row = asRecord(value);
    if (!row) return [];
    const orderId = String(row.id || "");
    const externalOrderId = String(row.external_order_id || "");
    const items = Array.isArray(row.order_items) ? row.order_items : [];
    const productsById = new Map<string, { name: string; imageUrl: string | null }>();
    const productLabels: string[] = [];
    const productImages: string[] = [];

    for (const itemValue of items) {
      const item = asRecord(itemValue);
      const product = pickRecord(item?.product);
      if (!item || !product) continue;
      const productId = String(product.id || "");
      const name = String(product.name || "Produto");
      const imageUrl =
        typeof product.image_url === "string" ? product.image_url : null;
      const quantity = Math.max(1, Number(item.quantity) || 1);
      productsById.set(productId, { name, imageUrl });
      productLabels.push(quantity > 1 ? `${quantity}× ${name}` : name);
      if (imageUrl) productImages.push(imageUrl);
    }

    const reviewRequests: ReviewRequestView[] = (
      reviewsByOrder.get(orderId) ?? []
    ).map((request) => {
      const product = productsById.get(String(request.product_id || ""));
      return {
        id: String(request.id),
        productName: product?.name ?? "Produto",
        stepId: "review_request",
        trackingCode: null,
        trackingStatus: null,
        status: String(request.status || "scheduled"),
        scheduledFor: String(request.scheduled_for || ""),
        sentAt:
          typeof request.sent_at === "string" ? request.sent_at : null,
        errorMessage:
          typeof request.error_message === "string"
            ? request.error_message
            : null,
      };
    });

    return [
      {
        id: orderId,
        externalOrderId,
        customerName: String(row.customer_name || "Cliente"),
        customerEmail:
          typeof row.customer_email === "string" ? row.customer_email : null,
        customerPhone:
          typeof row.customer_phone === "string" ? row.customer_phone : null,
        productsSummary: productLabels.join(", "),
        productImages,
        orderStatus: String(row.status || "unknown"),
        orderedAt: String(row.ordered_at || ""),
        paymentStatus:
          typeof row.payment_status === "string" ? row.payment_status : null,
        shippingStatus:
          typeof row.shipping_status === "string" ? row.shipping_status : null,
        fulfillmentStatus:
          typeof row.fulfillment_status === "string" ? row.fulfillment_status : null,
        trackingStatus:
          typeof row.tracking_status === "string" ? row.tracking_status : null,
        trackingNumber:
          typeof row.shipping_tracking_number === "string"
            ? row.shipping_tracking_number
            : null,
        trackingUrl:
          typeof row.shipping_tracking_url === "string"
            ? row.shipping_tracking_url
            : null,
        postSaleMessages: postPurchaseByOrder.get(externalOrderId) ?? [],
        deliveryEvents: deliveryEventsByOrder.get(orderId) ?? [],
        reviewRequests,
      },
    ];
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pickRecord(value: unknown): Record<string, unknown> | null {
  return Array.isArray(value) ? asRecord(value[0]) : asRecord(value);
}

function MigrationNotice() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">Pós-venda</h1>
      <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-900">
        A estrutura de pós-venda ainda não está disponível no banco. Execute as
        migrations <code className="font-mono">0006_whatsapp_automations.sql</code>,{" "}
        <code className="font-mono">0009_flexible_post_sale_delays.sql</code> e{" "}
        <code className="font-mono">0010_automation_attachments.sql</code> e{" "}
        <code className="font-mono">0012_post_sale_tracking.sql</code>{" "}
        no Supabase e atualize esta página.
      </div>
    </div>
  );
}
