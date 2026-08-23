import { createAdminClient } from "@/lib/supabase/admin";
import {
  AbandonedCartDashboard,
  type AbandonedCartView,
  type CartMessageView,
  type CartProductView,
} from "../AbandonedCartDashboard";
import { AutomationNav } from "../AutomationNav";
import { SyncOrdersButton } from "./SyncOrdersButton";

const dateTime = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

const statusLabels: Record<string, string> = {
  scheduled: "Ainda não enviada",
  processing: "Enviando",
  sent: "Enviada",
  failed: "Falhou",
  cancelled: "Cancelada",
};

export default async function AutomationOrdersPage() {
  const admin = createAdminClient();
  const { data: store } = await admin
    .from("stores")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (!store) {
    return <div className="p-8 text-gray-600">Conecte uma loja primeiro.</div>;
  }

  const [cartsResult, ordersResult, abandonedMessagesResult, postPurchaseResult] =
    await Promise.all([
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
        .from("orders")
        .select(
          `id, external_order_id, customer_name, customer_email, customer_phone,
           status, ordered_at, delivered_at,
           order_items (quantity, product:products (name))`
        )
        .eq("store_id", store.id)
        .order("ordered_at", { ascending: false })
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
          `id, external_reference, reference_label, customer_name,
           customer_phone, products_summary, status, scheduled_for, sent_at,
           error_message`
        )
        .eq("store_id", store.id)
        .eq("automation_type", "post_purchase")
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

  if (cartsResult.error) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold">Pedidos e envios</h1>
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-900">
          A estrutura de carrinhos ainda não está disponível no banco. Execute a
          migration <code className="font-mono">0007_abandoned_cart_routines.sql</code>
          {" "}no Supabase e atualize esta página.
        </div>
      </div>
    );
  }

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
    <div className="p-5 md:p-8 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Pedidos e envios</h1>
          <p className="text-sm text-gray-600 mt-1">
            Veja quem entrou nas rotinas e acompanhe se cada mensagem foi enviada.
          </p>
        </div>
        <SyncOrdersButton />
      </div>

      <AutomationNav />

      <PostPurchaseOrders
        orders={normalizeOrders(ordersResult.data ?? [], postPurchaseResult.data ?? [])}
      />

      <AbandonedCartDashboard
        storeId={store.id}
        initialEnabled={false}
        initialSteps={[]}
        carts={carts}
        mode="orders"
      />
    </div>
  );
}

interface OrderView {
  id: string;
  externalOrderId: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  productsSummary: string;
  orderStatus: string;
  orderedAt: string;
  message: {
    status: string;
    scheduledFor: string;
    sentAt: string | null;
    errorMessage: string | null;
  } | null;
}

function PostPurchaseOrders({ orders }: { orders: OrderView[] }) {
  return (
    <section className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-200 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-semibold text-lg">Pedidos de pós-venda</h2>
          <p className="text-sm text-gray-500 mt-1">
            Dados do pedido e situação da mensagem automática de pós-venda.
          </p>
        </div>
        <span className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-600">
          {orders.length} pedido(s)
        </span>
      </div>
      {orders.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="text-left px-5 py-3">Pedido</th>
                <th className="text-left px-5 py-3">Cliente</th>
                <th className="text-left px-5 py-3">Produtos</th>
                <th className="text-left px-5 py-3">Status do pedido</th>
                <th className="text-left px-5 py-3">Status do envio</th>
                <th className="text-left px-5 py-3">Agendado/enviado em</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orders.map((order) => (
                <tr key={order.id} className="hover:bg-gray-50/60">
                  <td className="px-5 py-4">
                    <div className="font-medium">#{order.externalOrderId}</div>
                    <div className="text-xs text-gray-400 mt-1">{dateTime.format(new Date(order.orderedAt))}</div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="font-medium">{order.customerName}</div>
                    {order.customerEmail && <div className="text-xs text-gray-500 mt-1">{order.customerEmail}</div>}
                    <div className="text-xs text-gray-500 mt-1">{order.customerPhone ? formatPhone(order.customerPhone) : "Sem telefone"}</div>
                  </td>
                  <td className="px-5 py-4 max-w-sm">
                    <div className="line-clamp-2">{order.productsSummary || "Produtos não informados"}</div>
                  </td>
                  <td className="px-5 py-4">
                    <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                      {orderStatusLabel(order.orderStatus)}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    {order.message ? (
                      <>
                        <span className={statusClass(order.message.status)}>
                          {statusLabels[order.message.status] || order.message.status}
                        </span>
                        {order.message.errorMessage && (
                          <div className="text-xs text-red-600 mt-1 max-w-xs" title={order.message.errorMessage}>
                            {order.message.errorMessage}
                          </div>
                        )}
                      </>
                    ) : (
                      <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
                        Sem envio agendado
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-gray-600 whitespace-nowrap">
                    {order.message
                      ? dateTime.format(new Date(order.message.sentAt || order.message.scheduledFor))
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="px-5 py-12 text-center text-gray-500">
          Nenhum pedido entrou na rotina de pós-venda ainda.
        </div>
      )}
    </section>
  );
}

interface PostPurchaseMessageRow {
  external_reference: string;
  products_summary: string;
  status: string;
  scheduled_for: string;
  sent_at: string | null;
  error_message: string | null;
}

function normalizeOrders(
  rows: unknown[],
  messages: PostPurchaseMessageRow[]
): OrderView[] {
  const messagesByOrder = new Map(
    messages.map((message) => [message.external_reference, message])
  );

  return rows.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const row = value as Record<string, unknown>;
    const externalOrderId = String(row.external_order_id || "");
    const message = messagesByOrder.get(externalOrderId);
    const items = Array.isArray(row.order_items) ? row.order_items : [];
    const productsSummary = items.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const orderItem = item as Record<string, unknown>;
      const rawProduct = orderItem.product;
      const product = Array.isArray(rawProduct)
        ? rawProduct[0] as Record<string, unknown> | undefined
        : rawProduct as Record<string, unknown> | null;
      if (!product?.name) return [];
      const quantity = Math.max(1, Number(orderItem.quantity) || 1);
      return [quantity > 1 ? `${quantity}× ${String(product.name)}` : String(product.name)];
    }).join(", ");

    return [{
      id: String(row.id),
      externalOrderId,
      customerName: String(row.customer_name || "Cliente"),
      customerEmail: typeof row.customer_email === "string" ? row.customer_email : null,
      customerPhone: typeof row.customer_phone === "string" ? row.customer_phone : null,
      productsSummary: productsSummary || message?.products_summary || "",
      orderStatus: String(row.status || "unknown"),
      orderedAt: String(row.ordered_at),
      message: message
        ? {
            status: message.status,
            scheduledFor: message.scheduled_for,
            sentAt: message.sent_at,
            errorMessage: message.error_message,
          }
        : null,
    }];
  });
}

function normalizeProducts(value: unknown): CartProductView[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const product = item as Record<string, unknown>;
    const image = product.image && typeof product.image === "object"
      ? product.image as Record<string, unknown>
      : null;
    return [{
      name: typeof product.name === "string" ? product.name : "Produto",
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
  return `inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${color}`;
}

function orderStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: "Pendente",
    paid: "Pago",
    authorized: "Autorizado",
    voided: "Cancelado",
    cancelled: "Cancelado",
    refunded: "Reembolsado",
    fulfilled: "Enviado",
  };
  return labels[status] || status;
}

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const local = digits.startsWith("55") ? digits.slice(2) : digits;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return phone;
}
