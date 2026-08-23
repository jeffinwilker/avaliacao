import {
  DEFAULT_ABANDONED_CART_WHATSAPP_TEMPLATE,
  type AbandonedCartMessageStep,
} from "@avaliacoes/shared";
import { parseAbandonedCartSequence } from "@/lib/automations";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  AbandonedCartDashboard,
  type AbandonedCartView,
  type CartMessageView,
  type CartProductView,
} from "./AbandonedCartDashboard";
import { RunAutomationsButton } from "./RunAutomationsButton";

const dateTime = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

const statusLabels: Record<string, string> = {
  scheduled: "Agendada",
  processing: "Processando",
  sent: "Enviada",
  failed: "Falhou",
  cancelled: "Cancelada",
};

export default async function AutomationsPage() {
  const admin = createAdminClient();
  const { data: store } = await admin
    .from("stores")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (!store) {
    return <div className="p-8 text-gray-600">Conecte uma loja primeiro.</div>;
  }

  const [settingsResult, cartsResult, abandonedMessagesResult, postPurchaseResult] =
    await Promise.all([
      admin
        .from("store_settings")
        .select(
          `abandoned_cart_enabled, abandoned_cart_delay_hours,
           abandoned_cart_whatsapp_template, abandoned_cart_sequence`
        )
        .eq("store_id", store.id)
        .maybeSingle(),
      admin
        .from("abandoned_carts")
        .select(
          `id, external_checkout_id, customer_name, customer_email,
           customer_phone, checkout_url, products, products_summary, total,
           currency, status, nuvemshop_created_at, completed_at`
        )
        .eq("store_id", store.id)
        .order("nuvemshop_created_at", { ascending: false })
        .limit(200),
      admin
        .from("automation_messages")
        .select(
          `id, external_reference, routine_step_key, sequence_step, status,
           scheduled_for, sent_at, error_message`
        )
        .eq("store_id", store.id)
        .eq("automation_type", "abandoned_cart")
        .order("sequence_step", { ascending: true }),
      admin
        .from("automation_messages")
        .select(
          `id, reference_label, customer_name, customer_phone, products_summary,
           status, scheduled_for, sent_at, error_message`
        )
        .eq("store_id", store.id)
        .eq("automation_type", "post_purchase")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

  if (cartsResult.error) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold">Automações de WhatsApp</h1>
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-900">
          A nova estrutura de carrinhos ainda não está disponível no banco. Execute a
          migration <code className="font-mono">0007_abandoned_cart_routines.sql</code>
          {" "}no Supabase e atualize esta página.
        </div>
      </div>
    );
  }

  const settings = settingsResult.data;
  const initialSteps: AbandonedCartMessageStep[] = parseAbandonedCartSequence(
    settings?.abandoned_cart_sequence,
    settings?.abandoned_cart_delay_hours ?? 8,
    settings?.abandoned_cart_whatsapp_template ??
      DEFAULT_ABANDONED_CART_WHATSAPP_TEMPLATE
  ).map((step) => ({
    id: step.id,
    delayHours: step.delay_hours,
    messageTemplate: step.message_template,
    enabled: step.enabled,
  }));

  const messagesByCheckout = new Map<string, CartMessageView[]>();
  for (const message of abandonedMessagesResult.data ?? []) {
    const list = messagesByCheckout.get(message.external_reference) ?? [];
    list.push({
      id: message.id,
      routineStepKey: message.routine_step_key,
      sequenceStep: message.sequence_step,
      status: message.status,
      scheduledFor: message.scheduled_for,
      sentAt: message.sent_at,
      errorMessage: message.error_message,
    });
    messagesByCheckout.set(message.external_reference, list);
  }

  const carts: AbandonedCartView[] = (cartsResult.data ?? []).map((cart) => ({
    id: cart.id,
    externalCheckoutId: cart.external_checkout_id,
    customerName: cart.customer_name,
    customerEmail: cart.customer_email,
    customerPhone: cart.customer_phone,
    checkoutUrl: cart.checkout_url,
    products: normalizeProducts(cart.products),
    productsSummary: cart.products_summary,
    total: toNumber(cart.total),
    currency: cart.currency || "BRL",
    status: cart.status,
    createdAt: cart.nuvemshop_created_at,
    completedAt: cart.completed_at,
    messages: messagesByCheckout.get(cart.external_checkout_id) ?? [],
  }));

  return (
    <div className="p-5 md:p-8 space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Automações de WhatsApp</h1>
          <p className="text-sm text-gray-600 mt-1">
            Acompanhe carrinhos e controle cada mensagem da recuperação.
          </p>
        </div>
        <RunAutomationsButton />
      </div>

      <AbandonedCartDashboard
        storeId={store.id}
        initialEnabled={settings?.abandoned_cart_enabled ?? false}
        initialSteps={initialSteps}
        carts={carts}
      />

      <PostPurchaseHistory messages={postPurchaseResult.data ?? []} />
    </div>
  );
}

function PostPurchaseHistory({
  messages,
}: {
  messages: Array<{
    id: string;
    reference_label: string | null;
    customer_name: string;
    customer_phone: string;
    products_summary: string;
    status: string;
    scheduled_for: string;
    sent_at: string | null;
    error_message: string | null;
  }>;
}) {
  return (
    <section className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-200">
        <h2 className="font-semibold text-lg">Mensagens de pós-venda</h2>
        <p className="text-sm text-gray-500 mt-1">Histórico das mensagens ligadas a pedidos pagos.</p>
      </div>
      {messages.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="text-left px-5 py-3">Pedido</th>
                <th className="text-left px-5 py-3">Cliente</th>
                <th className="text-left px-5 py-3">Produtos</th>
                <th className="text-left px-5 py-3">Status</th>
                <th className="text-left px-5 py-3">Data</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {messages.map((message) => (
                <tr key={message.id}>
                  <td className="px-5 py-4 font-medium">#{message.reference_label || "—"}</td>
                  <td className="px-5 py-4">
                    <div>{message.customer_name}</div>
                    <div className="text-xs text-gray-500">{message.customer_phone}</div>
                  </td>
                  <td className="px-5 py-4 max-w-xs truncate">{message.products_summary}</td>
                  <td className="px-5 py-4">
                    <span className={statusClass(message.status)}>
                      {statusLabels[message.status] || message.status}
                    </span>
                    {message.error_message && (
                      <div className="text-xs text-red-600 mt-1 max-w-xs truncate" title={message.error_message}>
                        {message.error_message}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-4 text-gray-600 whitespace-nowrap">
                    {dateTime.format(new Date(message.sent_at || message.scheduled_for))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="px-5 py-12 text-center text-gray-500">Nenhuma mensagem de pós-venda registrada.</div>
      )}
    </section>
  );
}

function normalizeProducts(value: unknown): CartProductView[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const product = item as Record<string, unknown>;
    const image = product.image && typeof product.image === "object"
      ? product.image as Record<string, unknown>
      : null;
    const name = typeof product.name === "string" ? product.name : "Produto";
    return [{
      name,
      quantity: Math.max(1, Number(product.quantity) || 1),
      price: toNumber(product.price),
      imageUrl: typeof image?.src === "string" ? image.src : null,
    }];
  });
}

function toNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function statusClass(status: string): string {
  const color =
    status === "sent"
      ? "bg-green-100 text-green-800"
      : status === "failed"
      ? "bg-red-100 text-red-800"
      : status === "cancelled"
      ? "bg-gray-100 text-gray-700"
      : "bg-amber-100 text-amber-800";
  return `inline-flex rounded-full px-2 py-1 text-xs font-medium ${color}`;
}
