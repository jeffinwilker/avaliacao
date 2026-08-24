"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export interface PostSaleMessageView {
  status: string;
  scheduledFor: string;
  sentAt: string | null;
  errorMessage: string | null;
}

export interface ReviewRequestView extends PostSaleMessageView {
  id: string;
  productName: string;
}

export interface PostSaleOrderView {
  id: string;
  externalOrderId: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  productsSummary: string;
  productImages: string[];
  orderStatus: string;
  orderedAt: string;
  postPurchaseMessage: PostSaleMessageView | null;
  reviewRequests: ReviewRequestView[];
}

interface PostSaleDashboardProps {
  storeId: string;
  initialReviewEnabled: boolean;
  initialReviewDelayDays: number;
  initialReviewTemplate: string;
  initialPostPurchaseEnabled: boolean;
  initialPostPurchaseDelayHours: number;
  initialPostPurchaseTemplate: string;
  orders: PostSaleOrderView[];
}

const dateTime = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

export function PostSaleDashboard({
  storeId,
  initialReviewEnabled,
  initialReviewDelayDays,
  initialReviewTemplate,
  initialPostPurchaseEnabled,
  initialPostPurchaseDelayHours,
  initialPostPurchaseTemplate,
  orders,
}: PostSaleDashboardProps) {
  const router = useRouter();
  const [reviewEnabled, setReviewEnabled] = useState(initialReviewEnabled);
  const [reviewDelayDays, setReviewDelayDays] = useState(initialReviewDelayDays);
  const [reviewTemplate, setReviewTemplate] = useState(initialReviewTemplate);
  const [postPurchaseEnabled, setPostPurchaseEnabled] = useState(
    initialPostPurchaseEnabled
  );
  const [postPurchaseDelayHours, setPostPurchaseDelayHours] = useState(
    initialPostPurchaseDelayHours
  );
  const [postPurchaseTemplate, setPostPurchaseTemplate] = useState(
    initialPostPurchaseTemplate
  );
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "ok" | "error";
    text: string;
  } | null>(null);

  const filteredOrders = useMemo(() => {
    const search = query.trim().toLocaleLowerCase("pt-BR");
    if (!search) return orders;
    return orders.filter(
      (order) =>
        order.externalOrderId.includes(search) ||
        order.customerName.toLocaleLowerCase("pt-BR").includes(search) ||
        order.customerEmail?.toLocaleLowerCase("pt-BR").includes(search) ||
        order.customerPhone?.includes(search) ||
        order.productsSummary.toLocaleLowerCase("pt-BR").includes(search)
    );
  }, [orders, query]);

  const counts = useMemo(() => {
    const requests = orders.flatMap((order) => order.reviewRequests);
    return {
      orders: orders.length,
      scheduled: requests.filter((request) => request.status === "scheduled").length,
      sent: requests.filter((request) => request.status === "sent").length,
      completed: requests.filter((request) => request.status === "completed").length,
    };
  }, [orders]);

  async function saveRoutine() {
    setSaving(true);
    setFeedback(null);
    const response = await fetch("/api/automations/post-sale-routine", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        storeId,
        reviewEnabled,
        reviewDelayDays,
        reviewTemplate,
        postPurchaseEnabled,
        postPurchaseDelayHours,
        postPurchaseTemplate,
      }),
    });
    const result = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      setFeedback({
        type: "error",
        text: result.error || "Não foi possível salvar o pós-venda",
      });
      return;
    }
    setFeedback({ type: "ok", text: "Automações de pós-venda salvas." });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">Rotinas de pós-venda</h2>
            <p className="mt-1 text-sm text-gray-500">
              Configure a confirmação do pedido e o convite que leva ao formulário de avaliação.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {feedback && (
              <span
                className={`text-sm ${
                  feedback.type === "ok" ? "text-green-700" : "text-red-700"
                }`}
              >
                {feedback.text}
              </span>
            )}
            <button
              type="button"
              onClick={saveRoutine}
              disabled={saving}
              className="rounded-lg bg-brand-900 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? "Salvando..." : "Salvar pós-venda"}
            </button>
          </div>
        </div>

        <div className="grid gap-5 p-5 xl:grid-cols-2">
          <RoutineCard
            title="Pedido de avaliação"
            description="Envia um convite por produto com acesso direto ao formulário móvel, foto e dados do cliente."
            enabled={reviewEnabled}
            onEnabledChange={setReviewEnabled}
            timing={
              <TimingField
                label="Enviar após"
                value={reviewDelayDays}
                min={1}
                max={90}
                suffix="dias da compra"
                onChange={setReviewDelayDays}
              />
            }
          >
            <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-5 text-emerald-900">
              A variável <strong>{"{{link}}"}</strong> abre a nova página de avaliação
              com o produto correto e identifica a resposta como compra verificada.
            </div>
            <TemplateEditor
              value={reviewTemplate}
              onChange={setReviewTemplate}
              variables={["{{nome}}", "{{produto}}", "{{link}}", "{{loja}}"]}
              label="Mensagem do pedido de avaliação"
            />
          </RoutineCard>

          <RoutineCard
            title="Confirmação de pedido"
            description="Enviada quando um novo pedido é criado, antes mesmo da confirmação do pagamento."
            enabled={postPurchaseEnabled}
            onEnabledChange={setPostPurchaseEnabled}
            timing={
              <TimingField
                label="Enviar após"
                value={postPurchaseDelayHours}
                min={0}
                max={720}
                suffix="horas após o pedido"
                onChange={setPostPurchaseDelayHours}
              />
            }
          >
            <div className="mb-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-5 text-blue-900">
              Use <strong>0 horas</strong> para enviar no próximo processamento da fila.
              Com o agendamento a cada 5 minutos, a confirmação chega em até cerca de 5 minutos.
            </div>
            <TemplateEditor
              value={postPurchaseTemplate}
              onChange={setPostPurchaseTemplate}
              variables={[
                "{{nome}}",
                "{{pedido}}",
                "{{produtos}}",
                "{{loja}}",
                "{{link}}",
              ]}
              label="Mensagem de confirmação do pedido"
            />
          </RoutineCard>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <SummaryCard label="Pedidos acompanhados" value={counts.orders} />
        <SummaryCard label="Avaliações agendadas" value={counts.scheduled} tone="amber" />
        <SummaryCard label="Convites enviados" value={counts.sent} tone="blue" />
        <SummaryCard label="Avaliações recebidas" value={counts.completed} tone="green" />
      </div>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">Pedidos e envios</h2>
            <p className="mt-1 text-sm text-gray-500">
              Acompanhe a confirmação do pedido e o convite de avaliação de cada produto.
            </p>
          </div>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar pedido, cliente ou produto"
            className="w-80 max-w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        {filteredOrders.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-5 py-3 text-left">Pedido</th>
                  <th className="px-5 py-3 text-left">Cliente</th>
                  <th className="px-5 py-3 text-left">Produtos</th>
                  <th className="px-5 py-3 text-left">Confirmação do pedido</th>
                  <th className="px-5 py-3 text-left">Pedido de avaliação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredOrders.map((order) => (
                  <tr key={order.id} className="align-top hover:bg-gray-50/60">
                    <td className="whitespace-nowrap px-5 py-4">
                      <div className="font-semibold">#{order.externalOrderId}</div>
                      <div className="mt-1 text-xs text-gray-500">
                        {safeDateTime(order.orderedAt)}
                      </div>
                      <span className="mt-2 inline-flex rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-600">
                        {orderStatusLabel(order.orderStatus)}
                      </span>
                    </td>
                    <td className="min-w-[235px] px-5 py-4">
                      <div className="font-medium">{order.customerName}</div>
                      {order.customerEmail && (
                        <div className="mt-1 text-xs text-gray-500">{order.customerEmail}</div>
                      )}
                      <div className="mt-1 text-xs text-gray-500">
                        {order.customerPhone
                          ? formatPhone(order.customerPhone)
                          : "Sem telefone informado"}
                      </div>
                    </td>
                    <td className="max-w-sm px-5 py-4">
                      <div className="flex items-center gap-3">
                        {order.productImages.length > 0 && (
                          <div className="flex -space-x-2">
                            {order.productImages.slice(0, 3).map((image, index) => (
                              <img
                                key={`${image}-${index}`}
                                src={image}
                                alt=""
                                className="h-10 w-10 rounded-full border-2 border-white object-cover"
                              />
                            ))}
                          </div>
                        )}
                        <div className="line-clamp-2 text-gray-700">
                          {order.productsSummary || "Produtos não informados"}
                        </div>
                      </div>
                    </td>
                    <td className="min-w-[180px] px-5 py-4">
                      <MessageStatus message={order.postPurchaseMessage} empty="Sem envio" />
                    </td>
                    <td className="min-w-[260px] px-5 py-4">
                      {order.reviewRequests.length ? (
                        <div className="space-y-2">
                          {order.reviewRequests.map((request) => (
                            <div key={request.id}>
                              <div className="line-clamp-1 text-xs font-medium text-gray-700">
                                {request.productName}
                              </div>
                              <MessageStatus message={request} empty="Sem envio" compact />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">Nenhum convite agendado</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-5 py-14 text-center text-gray-500">
            {orders.length
              ? "Nenhum pedido corresponde à busca."
              : "Nenhum pedido entrou na rotina de pós-venda ainda."}
          </div>
        )}
      </section>
    </div>
  );
}

function RoutineCard({
  title,
  description,
  enabled,
  onEnabledChange,
  timing,
  children,
}: {
  title: string;
  description: string;
  enabled: boolean;
  onEnabledChange: (value: boolean) => void;
  timing: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50/60 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-gray-950">{title}</h3>
            <span
              className={`rounded-full px-2 py-1 text-xs font-medium ${
                enabled
                  ? "bg-green-100 text-green-800"
                  : "bg-gray-200 text-gray-600"
              }`}
            >
              {enabled ? "Ativa" : "Pausada"}
            </span>
          </div>
          <p className="mt-1 text-sm leading-5 text-gray-500">{description}</p>
        </div>
        <Toggle value={enabled} onChange={onEnabledChange} />
      </div>
      <div className="my-4">{timing}</div>
      {children}
    </div>
  );
}

function TimingField({
  label,
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex flex-wrap items-center gap-2 text-sm font-medium text-gray-700">
      {label}
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-24 rounded-lg border border-gray-300 bg-white px-3 py-2"
      />
      {suffix}
    </label>
  );
}

function TemplateEditor({
  value,
  onChange,
  variables,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  variables: string[];
  label: string;
}) {
  return (
    <div>
      <label className="text-sm font-semibold text-gray-800">{label}</label>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={4000}
        className="mt-2 min-h-[190px] w-full resize-y rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm leading-6"
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {variables.map((variable) => (
            <button
              type="button"
              key={variable}
              onClick={() =>
                onChange(`${value}${value.endsWith(" ") ? "" : " "}${variable}`)
              }
              className="rounded-md border border-gray-300 bg-white px-2 py-1 font-mono text-xs hover:bg-gray-100"
            >
              {variable}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-400">{value.length}/4000</span>
      </div>
    </div>
  );
}

function Toggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      aria-label={value ? "Desativar rotina" : "Ativar rotina"}
      onClick={() => onChange(!value)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition ${
        value ? "bg-brand-900" : "bg-gray-300"
      }`}
    >
      <span
        className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${
          value ? "left-6" : "left-1"
        }`}
      />
    </button>
  );
}

function SummaryCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "amber" | "blue" | "green";
}) {
  const colors = {
    neutral: "border-gray-200 bg-white",
    amber: "border-amber-200 bg-amber-50",
    blue: "border-blue-200 bg-blue-50",
    green: "border-green-200 bg-green-50",
  };
  return (
    <div className={`rounded-2xl border p-4 ${colors[tone]}`}>
      <div className="text-sm text-gray-600">{label}</div>
      <div className="mt-1 text-2xl font-bold text-gray-950">{value}</div>
    </div>
  );
}

function MessageStatus({
  message,
  empty,
  compact = false,
}: {
  message: PostSaleMessageView | null;
  empty: string;
  compact?: boolean;
}) {
  if (!message) return <span className="text-xs text-gray-400">{empty}</span>;
  const labels: Record<string, string> = {
    scheduled: "Agendada",
    processing: "Enviando",
    sent: "Enviada",
    completed: "Respondida",
    failed: "Falhou",
    cancelled: "Cancelada",
  };
  return (
    <div className={compact ? "mt-1" : ""}>
      <span className={statusClass(message.status)}>
        {labels[message.status] || message.status}
      </span>
      <div className="mt-1 text-xs text-gray-500">
        {safeDateTime(message.sentAt || message.scheduledFor)}
      </div>
      {message.errorMessage && (
        <div className="mt-1 max-w-xs text-xs text-red-600" title={message.errorMessage}>
          {message.errorMessage}
        </div>
      )}
    </div>
  );
}

function statusClass(status: string): string {
  const color =
    status === "sent" || status === "completed"
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

function safeDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : dateTime.format(date);
}

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const local = digits.startsWith("55") ? digits.slice(2) : digits;
  if (local.length === 11) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  }
  if (local.length === 10) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  }
  return phone;
}
