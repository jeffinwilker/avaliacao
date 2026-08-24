"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { AbandonedCartMessageStep } from "@avaliacoes/shared";
import { AutomationDelayField } from "./AutomationDelayField";

export interface CartProductView {
  name: string;
  quantity: number;
  price: number | null;
  imageUrl: string | null;
}

export interface CartMessageView {
  id: string;
  routineStepKey: string;
  sequenceStep: number;
  status: string;
  scheduledFor: string;
  sentAt: string | null;
  errorMessage: string | null;
}

export interface AbandonedCartView {
  id: string;
  externalCheckoutId: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  checkoutUrl: string | null;
  products: CartProductView[];
  productsSummary: string;
  total: number | null;
  currency: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
  messages: CartMessageView[];
}

const messageStatusLabels: Record<string, string> = {
  scheduled: "Agendada",
  processing: "Enviando",
  sent: "Enviada",
  failed: "Falhou",
  cancelled: "Cancelada",
};

const followUpTemplate = `Oi {{nome}}! 😊

Passando para lembrar que seu carrinho com *{{produtos}}* continua disponível na {{loja}}.

Você pode finalizar por aqui:
{{link}}

Se ficou alguma dúvida, pode responder esta mensagem.`;

export function AbandonedCartDashboard({
  storeId,
  initialEnabled,
  initialSteps,
  carts,
  mode = "all",
}: {
  storeId: string;
  initialEnabled: boolean;
  initialSteps: AbandonedCartMessageStep[];
  carts: AbandonedCartView[];
  mode?: "all" | "routine" | "messages" | "orders";
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [steps, setSteps] = useState(initialSteps);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [expandedCart, setExpandedCart] = useState<string | null>(null);
  const showRoutine = mode === "all" || mode === "routine";
  const showMessages = mode === "all" || mode === "messages";
  const showOrders = mode === "all" || mode === "orders";

  const filteredCarts = useMemo(() => {
    const search = query.trim().toLocaleLowerCase("pt-BR");
    return carts.filter((cart) => {
      const visibleStatus = cartDisplayStatus(cart).key;
      const matchesStatus = statusFilter === "all" || visibleStatus === statusFilter;
      const matchesSearch =
        !search ||
        cart.customerName.toLocaleLowerCase("pt-BR").includes(search) ||
        cart.customerEmail?.toLocaleLowerCase("pt-BR").includes(search) ||
        cart.customerPhone?.includes(search) ||
        cart.externalCheckoutId.includes(search) ||
        cart.productsSummary.toLocaleLowerCase("pt-BR").includes(search);
      return matchesStatus && Boolean(matchesSearch);
    });
  }, [carts, query, statusFilter]);

  const counts = useMemo(() => ({
    abandoned: carts.filter((cart) => cart.status === "abandoned").length,
    recovered: carts.filter((cart) => cart.status !== "abandoned").length,
    scheduled: carts.reduce(
      (total, cart) => total + cart.messages.filter((message) => message.status === "scheduled").length,
      0
    ),
    sent: carts.reduce(
      (total, cart) => total + cart.messages.filter((message) => message.status === "sent").length,
      0
    ),
  }), [carts]);

  function updateStep(id: string, patch: Partial<AbandonedCartMessageStep>) {
    setSteps((current) => current.map((step) => step.id === id ? { ...step, ...patch } : step));
    setFeedback(null);
  }

  function addStep() {
    if (steps.length >= 5) return;
    const lastDelay = Math.max(...steps.map((step) => step.delayMinutes), 10);
    setSteps((current) => [
      ...current,
      {
        id: `step-${Date.now().toString(36)}`,
        delayMinutes: Math.min(43_200, lastDelay + 1_440),
        messageTemplate: followUpTemplate,
        enabled: true,
      },
    ]);
    setFeedback(null);
  }

  function removeStep(id: string) {
    if (steps.length === 1) return;
    setSteps((current) => current.filter((step) => step.id !== id));
    setFeedback(null);
  }

  async function saveRoutine() {
    setSaving(true);
    setFeedback(null);
    const res = await fetch("/api/automations/abandoned-cart-routine", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ storeId, enabled, steps }),
    });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setFeedback({ type: "error", text: json.error || "Não foi possível salvar a rotina" });
      return;
    }
    setSteps(
      (json.steps ?? []).map((step: Record<string, unknown>) => ({
        id: String(step.id),
        delayMinutes: Number(step.delay_minutes),
        messageTemplate: String(step.message_template),
        enabled: step.enabled !== false,
      }))
    );
    setFeedback({
      type: "ok",
      text: showMessages
        ? "Mensagens salvas."
        : "Rotina salva e carrinhos atualizados.",
    });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {showOrders && <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <SummaryCard label="Carrinhos em aberto" value={counts.abandoned} tone="amber" />
        <SummaryCard label="Compras recuperadas" value={counts.recovered} tone="green" />
        <SummaryCard label="Mensagens agendadas" value={counts.scheduled} tone="blue" />
        <SummaryCard label="Mensagens enviadas" value={counts.sent} tone="neutral" />
      </div>}

      {(showRoutine || showMessages) && <section className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-lg">
                {showMessages ? "Mensagens de recuperação" : "Rotina de recuperação"}
              </h2>
              {showRoutine && (
                <span className={`text-xs font-medium rounded-full px-2 py-1 ${enabled ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}>
                  {enabled ? "Ativa" : "Pausada"}
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-1">
              {showMessages
                ? "Crie até 5 textos. Os horários são definidos separadamente em Rotinas."
                : "Escolha quando cada mensagem será enviada a partir da criação do checkout."}
            </p>
          </div>
          {showRoutine && (
            <Toggle value={enabled} onChange={setEnabled} label="Ativar rotina" />
          )}
        </div>

        <div className="p-5 space-y-4">
          {steps.map((step, index) => (
            <div key={step.id} className="rounded-xl border border-gray-200 p-4 bg-gray-50/60">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="h-8 w-8 rounded-full bg-brand-900 text-white flex items-center justify-center text-sm font-bold">
                    {index + 1}
                  </span>
                  {showRoutine ? (
                    <AutomationDelayField
                      delayMinutes={step.delayMinutes}
                      minMinutes={10}
                      maxMinutes={43_200}
                      presets={[
                        { label: "10 min", value: 10 },
                        { label: "30 min", value: 30 },
                        { label: "1 h", value: 60 },
                        { label: "4 h", value: 240 },
                        { label: "1 dia", value: 1_440 },
                      ]}
                      onChange={(delayMinutes) =>
                        updateStep(step.id, { delayMinutes })
                      }
                    />
                  ) : (
                    <div>
                      <div className="font-semibold">Mensagem {index + 1}</div>
                      <div className="text-xs text-gray-500">
                        Horário configurado em Rotinas
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {showRoutine && (
                    <Toggle
                      value={step.enabled}
                      onChange={(value) => updateStep(step.id, { enabled: value })}
                      label={step.enabled ? "Ligada" : "Pausada"}
                      compact
                    />
                  )}
                  {showMessages && (
                    <button
                      type="button"
                      onClick={() => removeStep(step.id)}
                      disabled={steps.length === 1}
                      className="text-sm text-red-700 disabled:text-gray-300"
                    >
                      Excluir
                    </button>
                  )}
                </div>
              </div>

              {showMessages && (
                <>
                  <textarea
                    value={step.messageTemplate}
                    onChange={(event) => updateStep(step.id, { messageTemplate: event.target.value })}
                    maxLength={4000}
                    className="w-full min-h-[150px] border border-gray-300 bg-white rounded-xl px-4 py-3 text-sm leading-6 resize-y"
                    aria-label={`Texto da mensagem ${index + 1}`}
                  />
                  <div className="flex items-center justify-between gap-3 mt-2 flex-wrap">
                    <div className="flex gap-2 flex-wrap">
                      {["{{nome}}", "{{produtos}}", "{{link}}", "{{loja}}"].map((variable) => (
                        <button
                          type="button"
                          key={variable}
                          onClick={() => updateStep(step.id, { messageTemplate: `${step.messageTemplate}${step.messageTemplate.endsWith(" ") ? "" : " "}${variable}` })}
                          className="text-xs font-mono rounded-md border border-gray-300 bg-white px-2 py-1 hover:bg-gray-100"
                        >
                          {variable}
                        </button>
                      ))}
                    </div>
                    <span className="text-xs text-gray-400">{step.messageTemplate.length}/4000</span>
                  </div>
                </>
              )}
            </div>
          ))}

          <div className="flex items-center justify-between gap-3 flex-wrap">
            {showMessages ? (
              <button
                type="button"
                onClick={addStep}
                disabled={steps.length >= 5}
                className="border border-gray-300 bg-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-40"
              >
                + Adicionar mensagem
              </button>
            ) : (
              <span className="text-xs text-gray-500">
                Os textos são editados na página Mensagens.
              </span>
            )}
            <div className="flex items-center gap-3">
              {feedback && (
                <span className={`text-sm ${feedback.type === "ok" ? "text-green-700" : "text-red-700"}`}>
                  {feedback.text}
                </span>
              )}
              <button
                type="button"
                onClick={saveRoutine}
                disabled={saving}
                className="bg-brand-900 text-white rounded-lg px-5 py-2.5 text-sm font-medium disabled:opacity-50"
              >
                {saving
                  ? "Salvando..."
                  : showMessages
                    ? "Salvar mensagens"
                    : "Salvar rotina"}
              </button>
            </div>
          </div>
        </div>
      </section>}

      {showOrders && <section className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="font-semibold text-lg">Carrinhos abandonados</h2>
              <p className="text-sm text-gray-500 mt-1">
                A Nuvemshop mantém disponíveis os carrinhos identificados dos últimos 30 dias.
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <input
                type="search"
                placeholder="Buscar cliente, produto ou carrinho"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="w-72 max-w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
              >
                <option value="all">Todos os status</option>
                <option value="recovering">Em recuperação</option>
                <option value="waiting">Aguardando</option>
                <option value="no_phone">Sem WhatsApp</option>
                <option value="recovered">Recuperados</option>
              </select>
            </div>
          </div>
        </div>

        {filteredCarts.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="text-left px-5 py-3">Status</th>
                  <th className="text-left px-5 py-3">Cliente</th>
                  <th className="text-left px-5 py-3">Data do carrinho</th>
                  <th className="text-left px-5 py-3">Produtos</th>
                  <th className="text-left px-5 py-3">Total</th>
                  <th className="text-left px-5 py-3">Atividades</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredCarts.map((cart) => {
                  const displayStatus = cartDisplayStatus(cart);
                  const expanded = expandedCart === cart.id;
                  return (
                    <CartRows
                      key={cart.id}
                      cart={cart}
                      displayStatus={displayStatus}
                      expanded={expanded}
                      onToggle={() => setExpandedCart(expanded ? null : cart.id)}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-5 py-16 text-center text-gray-500">
            {carts.length
              ? "Nenhum carrinho corresponde aos filtros."
              : "Nenhum carrinho abandonado sincronizado ainda."}
          </div>
        )}
      </section>}
    </div>
  );
}

function CartRows({
  cart,
  displayStatus,
  expanded,
  onToggle,
}: {
  cart: AbandonedCartView;
  displayStatus: ReturnType<typeof cartDisplayStatus>;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className="align-top hover:bg-gray-50/60">
        <td className="px-5 py-4">
          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${displayStatus.className}`}>
            {displayStatus.label}
          </span>
        </td>
        <td className="px-5 py-4 min-w-[240px]">
          <div className="font-medium text-gray-900">{cart.customerName}</div>
          {cart.customerEmail && <div className="text-xs text-gray-500 mt-1">✉ {cart.customerEmail}</div>}
          <div className={`text-xs mt-1 ${cart.customerPhone ? "text-gray-600" : "text-red-600"}`}>
            {cart.customerPhone ? `◉ ${formatPhone(cart.customerPhone)}` : "Sem telefone informado"}
          </div>
        </td>
        <td className="px-5 py-4 whitespace-nowrap">
          <div className="font-medium">#{cart.externalCheckoutId}</div>
          <div className="text-xs text-gray-500 mt-1">{formatDateTime(cart.createdAt)}</div>
          <div className="text-xs text-gray-400 mt-1">{relativeDate(cart.createdAt)}</div>
        </td>
        <td className="px-5 py-4 max-w-[330px]">
          <div className="flex items-center gap-2">
            <div className="flex -space-x-2 flex-shrink-0">
              {cart.products.slice(0, 3).map((product, index) => (
                product.imageUrl ? (
                  <img
                    key={`${product.name}-${index}`}
                    src={product.imageUrl}
                    alt=""
                    className="h-10 w-10 rounded-full object-cover border-2 border-white bg-gray-100"
                  />
                ) : (
                  <div key={`${product.name}-${index}`} className="h-10 w-10 rounded-full border-2 border-white bg-gray-100 flex items-center justify-center text-xs">
                    🛍️
                  </div>
                )
              ))}
            </div>
            <div className="min-w-0">
              <div className="line-clamp-2 text-gray-800">{cart.productsSummary || "Produtos não informados"}</div>
              {cart.products.length > 3 && <div className="text-xs text-gray-500">+{cart.products.length - 3} produto(s)</div>}
            </div>
          </div>
        </td>
        <td className="px-5 py-4 font-semibold whitespace-nowrap">
          {formatMoney(cart.total, cart.currency)}
        </td>
        <td className="px-5 py-4 min-w-[210px]">
          <div className="flex gap-1.5 flex-wrap mb-2">
            {cart.messages.length ? cart.messages.map((message) => (
              <span key={message.id} className={messageStatusClass(message.status)} title={message.errorMessage || undefined}>
                {message.sequenceStep}ª {messageStatusLabels[message.status] || message.status}
              </span>
            )) : <span className="text-xs text-gray-400">Sem mensagens</span>}
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={onToggle} className="text-xs font-medium text-brand-900 underline">
              {expanded ? "Ocultar detalhes" : "Ver detalhes"}
            </button>
            {cart.checkoutUrl && cart.status === "abandoned" && (
              <a href={cart.checkoutUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-brand-900 underline">
                Abrir carrinho ↗
              </a>
            )}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-gray-50/80">
          <td colSpan={6} className="px-5 py-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <h3 className="text-xs font-semibold uppercase text-gray-500 mb-2">Itens do carrinho</h3>
                <div className="space-y-2">
                  {cart.products.map((product, index) => (
                    <div key={`${product.name}-${index}`} className="flex items-center justify-between gap-4 text-sm">
                      <span>{product.quantity}× {product.name}</span>
                      <span className="text-gray-500">{formatMoney(product.price, cart.currency)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="text-xs font-semibold uppercase text-gray-500 mb-2">Linha do tempo</h3>
                <div className="space-y-2">
                  {cart.messages.length ? cart.messages.map((message) => (
                    <div key={message.id} className="flex items-start justify-between gap-4 text-sm">
                      <div>
                        <span className="font-medium">{message.sequenceStep}ª mensagem — {messageStatusLabels[message.status] || message.status}</span>
                        {message.errorMessage && <div className="text-xs text-red-600 mt-0.5">{message.errorMessage}</div>}
                      </div>
                      <span className="text-xs text-gray-500 whitespace-nowrap">
                        {message.sentAt ? formatDateTime(message.sentAt) : formatDateTime(message.scheduledFor)}
                      </span>
                    </div>
                  )) : <div className="text-sm text-gray-500">A rotina ainda não gerou mensagens para este carrinho.</div>}
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone: "amber" | "green" | "blue" | "neutral" }) {
  const classes = {
    amber: "border-amber-200 bg-amber-50",
    green: "border-green-200 bg-green-50",
    blue: "border-blue-200 bg-blue-50",
    neutral: "border-gray-200 bg-white",
  }[tone];
  return (
    <div className={`rounded-xl border p-4 ${classes}`}>
      <div className="text-sm text-gray-600">{label}</div>
      <div className="text-3xl font-bold mt-1">{value}</div>
    </div>
  );
}

function Toggle({ value, onChange, label, compact = false }: { value: boolean; onChange: (value: boolean) => void; label: string; compact?: boolean }) {
  return (
    <button type="button" onClick={() => onChange(!value)} className="inline-flex items-center gap-2 text-sm font-medium" role="switch" aria-checked={value}>
      <span className={`relative inline-flex ${compact ? "h-5 w-9" : "h-6 w-11"} items-center rounded-full transition ${value ? "bg-brand-900" : "bg-gray-300"}`}>
        <span className={`inline-block ${compact ? "h-3.5 w-3.5" : "h-4 w-4"} rounded-full bg-white transition-transform ${value ? (compact ? "translate-x-5" : "translate-x-6") : "translate-x-1"}`} />
      </span>
      {label}
    </button>
  );
}

function cartDisplayStatus(cart: AbandonedCartView) {
  if (cart.status !== "abandoned") {
    return { key: "recovered", label: "Compra recuperada", className: "bg-green-100 text-green-800" };
  }
  if (!cart.customerPhone) {
    return { key: "no_phone", label: "Sem WhatsApp", className: "bg-red-100 text-red-800" };
  }
  if (cart.messages.some((message) => ["scheduled", "processing", "sent"].includes(message.status))) {
    return { key: "recovering", label: "Em recuperação", className: "bg-amber-100 text-amber-800" };
  }
  return { key: "waiting", label: "Aguardando rotina", className: "bg-gray-100 text-gray-700" };
}

function messageStatusClass(status: string): string {
  const color =
    status === "sent"
      ? "bg-green-100 text-green-800"
      : status === "failed"
      ? "bg-red-100 text-red-800"
      : status === "cancelled"
      ? "bg-gray-100 text-gray-600"
      : "bg-blue-100 text-blue-800";
  return `inline-flex rounded-full px-2 py-1 text-[11px] font-medium ${color}`;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function relativeDate(value: string): string {
  const diffHours = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 3600_000));
  if (diffHours < 24) return `há ${diffHours || 1} hora(s)`;
  const days = Math.floor(diffHours / 24);
  return `há ${days} dia${days === 1 ? "" : "s"}`;
}

function formatMoney(value: number | null, currency: string): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: currency || "BRL" }).format(value);
}

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const local = digits.startsWith("55") ? digits.slice(2) : digits;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return phone;
}
