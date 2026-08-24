import {
  DEFAULT_POST_PURCHASE_WHATSAPP_TEMPLATE,
  DEFAULT_WHATSAPP_TEMPLATE,
} from "@avaliacoes/shared";
import { createAdminClient } from "@/lib/supabase/admin";
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

  const [settingsResult, ordersResult, postPurchaseResult, reviewsResult] =
    await Promise.all([
      admin
        .from("store_settings")
        .select(
          `whatsapp_enabled, request_delay_days, review_request_delay_minutes,
           whatsapp_template, post_purchase_enabled, post_purchase_delay_hours,
           post_purchase_delay_minutes,
           post_purchase_whatsapp_template`
        )
        .eq("store_id", store.id)
        .maybeSingle(),
      admin
        .from("orders")
        .select(
          `id, external_order_id, customer_name, customer_email, customer_phone,
           status, ordered_at,
           order_items (quantity, product:products (id, name, image_url))`
        )
        .eq("store_id", store.id)
        .order("ordered_at", { ascending: false })
        .limit(200),
      admin
        .from("automation_messages")
        .select(
          `external_reference, status, scheduled_for, sent_at, error_message`
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
    ]);

  if (settingsResult.error || postPurchaseResult.error) {
    return <MigrationNotice />;
  }

  const settings = settingsResult.data;
  const orders = normalizeOrders(
    ordersResult.data ?? [],
    postPurchaseResult.data ?? [],
    reviewsResult.data ?? []
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
          (settings?.request_delay_days ?? 7) * 1_440
        }
        initialReviewTemplate={
          settings?.whatsapp_template ?? DEFAULT_WHATSAPP_TEMPLATE
        }
        initialPostPurchaseEnabled={settings?.post_purchase_enabled ?? false}
        initialPostPurchaseDelayMinutes={
          settings?.post_purchase_delay_minutes ??
          (settings?.post_purchase_delay_hours ?? 24) * 60
        }
        initialPostPurchaseTemplate={
          settings?.post_purchase_whatsapp_template ??
          DEFAULT_POST_PURCHASE_WHATSAPP_TEMPLATE
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
  reviewRows: unknown[]
): PostSaleOrderView[] {
  const postPurchaseByOrder = new Map<string, PostSaleMessageView>();
  for (const value of postPurchaseRows) {
    const row = asRecord(value);
    if (!row) continue;
    postPurchaseByOrder.set(String(row.external_reference || ""), {
      status: String(row.status || "scheduled"),
      scheduledFor: String(row.scheduled_for || ""),
      sentAt: typeof row.sent_at === "string" ? row.sent_at : null,
      errorMessage:
        typeof row.error_message === "string" ? row.error_message : null,
    });
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
        postPurchaseMessage:
          postPurchaseByOrder.get(externalOrderId) ?? null,
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
        A estrutura de pós-venda ainda não está disponível no banco. Execute a
        migrations <code className="font-mono">0006_whatsapp_automations.sql</code> e{" "}
        <code className="font-mono">0009_flexible_post_sale_delays.sql</code>{" "}
        no Supabase e atualize esta página.
      </div>
    </div>
  );
}
