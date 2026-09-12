import {
  DEFAULT_PENDING_PAYMENT_SEQUENCE,
  type AbandonedCartMessageStep,
} from "@avaliacoes/shared";
import { parsePendingPaymentSequence } from "@/lib/automations";
import { listAutomationMedia } from "@/lib/automation-media";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  AbandonedCartDashboard,
  type AbandonedCartView,
  type CartMessageView,
} from "../AbandonedCartDashboard";
import { AutomationNav } from "../AutomationNav";
import { SyncDeliveredOrdersButton } from "../orders/SyncDeliveredOrdersButton";

type AutomationSection = "orders" | "messages" | "routines";
type EditorMode = "edit" | "blank" | "preset";

export default async function PendingPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string; editor?: string }>;
}) {
  const params = await searchParams;
  const section = normalizeSection(params.section);
  const editorMode = normalizeEditorMode(params.editor);
  const admin = createAdminClient();
  const { data: store } = await admin
    .from("stores")
    .select("id, name")
    .limit(1)
    .maybeSingle();
  if (!store) {
    return <div className="p-8 text-gray-600">Conecte uma loja primeiro.</div>;
  }

  const [settingsResult, ordersResult, messagesResult, mediaAssets] =
    await Promise.all([
      admin
        .from("store_settings")
        .select("pending_payment_enabled, pending_payment_sequence")
        .eq("store_id", store.id)
        .maybeSingle(),
      admin
        .from("orders")
        .select(
          `id, external_order_id, order_number, customer_name, customer_email,
           customer_phone, status, payment_status, payment_method, ordered_at,
           paid_at, order_status_url, products_summary, product_image_url,
           total, currency`
        )
        .eq("store_id", store.id)
        .eq("payment_method", "pix")
        .order("ordered_at", { ascending: false })
        .limit(300),
      admin
        .from("automation_messages")
        .select(
          `id, external_reference, routine_step_key, sequence_step, status,
           scheduled_for, sent_at, error_message, attachment_url, coupon_code`
        )
        .eq("store_id", store.id)
        .eq("automation_type", "pending_payment")
        .order("sequence_step", { ascending: true }),
      listAutomationMedia(admin, store.id),
    ]);

  if (settingsResult.error || ordersResult.error || messagesResult.error) {
    return <MigrationNotice />;
  }

  const storedSteps: AbandonedCartMessageStep[] = parsePendingPaymentSequence(
    settingsResult.data?.pending_payment_sequence
  ).map((step) => ({
    id: step.id,
    delayMinutes: step.delay_minutes,
    messageTemplate: step.message_template.replaceAll("{{link}}", "{{link_pagamento}}"),
    enabled: step.enabled,
    attachmentType: step.attachment_type,
    attachmentUrl: step.attachment_url,
    couponEnabled: step.coupon_enabled,
    couponType: step.coupon_type,
    couponValue: step.coupon_value,
    couponValidHours: step.coupon_valid_hours,
    couponMinPrice: step.coupon_min_price,
  }));
  const initialSteps =
    editorMode === "blank"
      ? [blankStep()]
      : editorMode === "preset"
        ? DEFAULT_PENDING_PAYMENT_SEQUENCE.map((step) => ({ ...step }))
        : storedSteps;

  const messagesByOrder = new Map<string, CartMessageView[]>();
  for (const message of messagesResult.data ?? []) {
    const list = messagesByOrder.get(message.external_reference) ?? [];
    list.push({
      id: message.id,
      routineStepKey: message.routine_step_key,
      sequenceStep: message.sequence_step,
      status: message.status,
      scheduledFor: message.scheduled_for,
      sentAt: message.sent_at,
      errorMessage: message.error_message,
      attachmentUrl: message.attachment_url,
      couponCode: message.coupon_code,
    });
    messagesByOrder.set(message.external_reference, list);
  }

  const orders: AbandonedCartView[] = (ordersResult.data ?? []).map((order) => {
    const pending =
      order.payment_status?.toLowerCase() === "pending" &&
      !order.paid_at &&
      !["cancelled", "closed", "delivered"].includes(order.status?.toLowerCase());
    return {
      id: order.id,
      externalCheckoutId: order.external_order_id,
      referenceLabel: order.order_number || order.external_order_id,
      customerName: order.customer_name || "Cliente",
      customerEmail: order.customer_email,
      customerPhone: order.customer_phone,
      checkoutUrl: order.order_status_url,
      products: [{
        name: order.products_summary || "Produtos do pedido",
        quantity: 1,
        price: null,
        imageUrl: order.product_image_url,
      }],
      productsSummary: order.products_summary || "Produtos do pedido",
      total: toNumber(order.total),
      currency: order.currency || "BRL",
      status: pending ? "abandoned" : "recovered",
      createdAt: order.ordered_at,
      completedAt: order.paid_at,
      messages: messagesByOrder.get(order.external_order_id) ?? [],
    };
  });

  return (
    <div className="space-y-6 p-5 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{sectionTitle(section)}</h1>
          <p className="mt-1 text-sm text-gray-600">{sectionDescription(section)}</p>
        </div>
        {section === "orders" && <SyncDeliveredOrdersButton mode="pending_payment" />}
      </div>

      {!params.editor && <AutomationNav />}

      <AbandonedCartDashboard
        storeId={store.id}
        storeName={store.name}
        initialEnabled={
          editorMode === "edit"
            ? settingsResult.data?.pending_payment_enabled ?? false
            : true
        }
        initialSteps={initialSteps}
        initialMediaAssets={mediaAssets}
        carts={orders}
        mode={section === "routines" ? "routine" : section}
        editorMode={params.editor ? editorMode : null}
        recoveryKind="pending_payment"
      />
    </div>
  );
}

function blankStep(): AbandonedCartMessageStep {
  return {
    ...DEFAULT_PENDING_PAYMENT_SEQUENCE[0],
    id: "step-1",
    messageTemplate: "Oi {{nome}}!\n\n",
  };
}

function normalizeEditorMode(value: string | undefined): EditorMode {
  return value === "blank" || value === "preset" ? value : "edit";
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
    return "Crie as mensagens para lembrar clientes com Pix pendente.";
  }
  if (section === "routines") {
    return "Defina os intervalos e cancele automaticamente quando o Pix for pago.";
  }
  return "Veja os pedidos com Pix pendente e envie lembretes automáticos ou manuais.";
}

function toNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function MigrationNotice() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">Pedidos aguardando pagamento</h1>
      <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-900">
        Execute a migration <code className="font-mono">0020_pending_payment_automations.sql</code> no Supabase e atualize esta página.
      </div>
    </div>
  );
}
