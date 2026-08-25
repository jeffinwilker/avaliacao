"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type {
  AbandonedCartMessageStep,
  AutomationMediaAsset,
} from "@avaliacoes/shared";
import { AutomationAttachmentPicker } from "./AutomationAttachmentPicker";
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
  attachmentUrl: string | null;
  couponCode: string | null;
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
  waiting: "Aguardando",
  paused: "Pausada",
  no_phone: "Sem WhatsApp",
};

const followUpTemplate = `Oi {{nome}}! 😊

Passando para lembrar que seu carrinho com *{{produtos}}* continua disponível na {{loja}}.

Você pode finalizar por aqui:
{{link}}

Se ficou alguma dúvida, pode responder esta mensagem.`;

export function AbandonedCartDashboard({
  storeId,
  storeName,
  initialEnabled,
  initialSteps,
  initialMediaAssets,
  carts,
  mode = "all",
}: {
  storeId: string;
  storeName: string;
  initialEnabled: boolean;
  initialSteps: AbandonedCartMessageStep[];
  initialMediaAssets: AutomationMediaAsset[];
  carts: AbandonedCartView[];
  mode?: "all" | "routine" | "messages" | "orders";
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [steps, setSteps] = useState(initialSteps);
  const [mediaAssets, setMediaAssets] = useState(initialMediaAssets);
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
        attachmentType: "none",
        attachmentUrl: null,
        couponEnabled: false,
        couponType: "percentage",
        couponValue: 10,
        couponValidHours: 48,
        couponMinPrice: null,
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
        attachmentType:
          step.attachment_type === "product_image" ||
          step.attachment_type === "library"
            ? step.attachment_type
            : "none",
        attachmentUrl:
          typeof step.attachment_url === "string" ? step.attachment_url : null,
        couponEnabled: step.coupon_enabled === true,
        couponType:
          step.coupon_type === "absolute" || step.coupon_type === "shipping"
            ? step.coupon_type
            : "percentage",
        couponValue: Number(step.coupon_value ?? 10),
        couponValidHours: Number(step.coupon_valid_hours ?? 48),
        couponMinPrice:
          step.coupon_min_price == null ? null : Number(step.coupon_min_price),
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

        {showRoutine ? (
          <AbandonedFlowBuilder
            steps={steps}
            saving={saving}
            feedback={feedback}
            onUpdateStep={updateStep}
            onAddStep={addStep}
            onRemoveStep={removeStep}
            onSave={saveRoutine}
          />
        ) : (
          <div className="space-y-4 p-5">
            {steps.map((step, index) => (
              <div key={step.id} className="rounded-xl border border-gray-200 bg-gray-50/60 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-900 text-sm font-bold text-white">
                      {index + 1}
                    </span>
                    <div>
                      <div className="font-semibold">Mensagem {index + 1}</div>
                      <div className="text-xs text-gray-500">Horário configurado em Rotinas</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeStep(step.id)}
                    disabled={steps.length === 1}
                    className="text-sm text-red-700 disabled:text-gray-300"
                  >
                    Excluir
                  </button>
                </div>

                <textarea
                  value={step.messageTemplate}
                  onChange={(event) => updateStep(step.id, { messageTemplate: event.target.value })}
                  maxLength={4000}
                  className="min-h-[150px] w-full resize-y rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm leading-6"
                  aria-label={`Texto da mensagem ${index + 1}`}
                />
                <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-2">
                    {["{{nome}}", "{{produtos}}", "{{link}}", "{{loja}}", "{{cupom}}", "{{desconto}}"].map((variable) => (
                      <button
                        type="button"
                        key={variable}
                        onClick={() => updateStep(step.id, { messageTemplate: `${step.messageTemplate}${step.messageTemplate.endsWith(" ") ? "" : " "}${variable}` })}
                        className="rounded-md border border-gray-300 bg-white px-2 py-1 font-mono text-xs hover:bg-gray-100"
                      >
                        {variable}
                      </button>
                    ))}
                  </div>
                  <span className="text-xs text-gray-400">{step.messageTemplate.length}/4000</span>
                </div>
                <CouponSettings
                  step={step}
                  onChange={(patch) => {
                    const nextPatch = { ...patch };
                    if (
                      patch.couponEnabled === true &&
                      !step.couponEnabled &&
                      !step.messageTemplate.includes("{{cupom}}")
                    ) {
                      nextPatch.messageTemplate = `${step.messageTemplate}\n\nUse o cupom *{{cupom}}* e aproveite {{desconto}}. O desconto já estará aplicado ao seu carrinho.`;
                    }
                    updateStep(step.id, nextPatch);
                  }}
                />
                <AutomationAttachmentPicker
                  storeId={storeId}
                  attachmentType={step.attachmentType}
                  attachmentUrl={step.attachmentUrl}
                  assets={mediaAssets}
                  onChange={(attachmentType, attachmentUrl) =>
                    updateStep(step.id, { attachmentType, attachmentUrl })
                  }
                  onAssetUploaded={(asset) =>
                    setMediaAssets((current) => [
                      asset,
                      ...current.filter((item) => item.path !== asset.path),
                    ])
                  }
                />
              </div>
            ))}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={addStep}
                disabled={steps.length >= 5}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium disabled:opacity-40"
              >
                + Adicionar mensagem
              </button>
              <SaveFlowActions feedback={feedback} saving={saving} onSave={saveRoutine} label="Salvar mensagens" />
            </div>
          </div>
        )}
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
                      steps={steps}
                      storeName={storeName}
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

function AbandonedFlowBuilder({
  steps,
  saving,
  feedback,
  onUpdateStep,
  onAddStep,
  onRemoveStep,
  onSave,
}: {
  steps: AbandonedCartMessageStep[];
  saving: boolean;
  feedback: { type: "ok" | "error"; text: string } | null;
  onUpdateStep: (id: string, patch: Partial<AbandonedCartMessageStep>) => void;
  onAddStep: () => void;
  onRemoveStep: (id: string) => void;
  onSave: () => void;
}) {
  return (
    <div className="bg-zinc-50">
      <div className="min-h-[620px] overflow-x-auto bg-[radial-gradient(#d4d4d8_1px,transparent_1px)] bg-[size:20px_20px] px-5 py-8">
        <div className="mx-auto flex w-full max-w-2xl flex-col items-center">
          <div className="w-full max-w-md rounded-2xl border-2 border-emerald-400 bg-white shadow-sm">
            <div className="flex items-center gap-3 p-4">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-100 text-emerald-700">
                <FlowCartIcon />
              </span>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Gatilho</div>
                <div className="font-semibold text-zinc-950">Carrinho abandonado identificado</div>
                <div className="mt-0.5 text-xs text-zinc-500">Inicia quando o checkout fica sem finalizar.</div>
              </div>
            </div>
          </div>

          {steps.map((step, index) => (
            <div key={step.id} className="flex w-full flex-col items-center">
              <FlowConnector />
              <div className="w-full max-w-xl rounded-2xl border border-violet-200 bg-violet-50 p-4 shadow-sm">
                <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-violet-700">
                  <FlowClockIcon /> Tempo desde o carrinho
                </div>
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
                    onUpdateStep(step.id, { delayMinutes })
                  }
                />
              </div>

              <FlowConnector />
              <div className="w-full max-w-xl rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-800">
                    <FlowConditionIcon />
                  </span>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-amber-800">
                      Condição
                    </div>
                    <div className="mt-0.5 font-semibold text-zinc-950">
                      Pedido ainda não foi fechado
                    </div>
                    <p className="mt-1 text-xs leading-5 text-zinc-600">
                      Se o checkout já virou pedido, esta e as próximas mensagens são canceladas.
                    </p>
                  </div>
                </div>
              </div>

              <FlowConnector />
              <div className={`w-full max-w-xl rounded-2xl border-2 bg-white shadow-sm ${step.enabled ? "border-blue-400" : "border-zinc-300 opacity-70"}`}>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-100 p-4">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-100 font-bold text-blue-700">
                      {index + 1}
                    </span>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-blue-700">Ação</div>
                      <div className="font-semibold text-zinc-950">Enviar mensagem {index + 1}</div>
                    </div>
                  </div>
                  <Toggle
                    value={step.enabled}
                    onChange={(enabled) => onUpdateStep(step.id, { enabled })}
                    label={step.enabled ? "Ligada" : "Pausada"}
                    compact
                  />
                </div>
                <div className="p-4">
                  <p className="line-clamp-3 whitespace-pre-line text-sm leading-5 text-zinc-600">
                    {step.messageTemplate}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-600">
                        WhatsApp
                      </span>
                      <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-600">
                        {attachmentLabel(step.attachmentType)}
                      </span>
                      {step.couponEnabled && (
                        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs text-amber-800">
                          {couponStepLabel(step)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <Link
                        href="/automations/abandoned-carts?section=messages"
                        className="text-xs font-semibold text-brand-900 underline"
                      >
                        Editar mensagem
                      </Link>
                      <button
                        type="button"
                        onClick={() => onRemoveStep(step.id)}
                        disabled={steps.length === 1}
                        className="text-xs font-medium text-red-700 disabled:text-zinc-300"
                      >
                        Excluir bloco
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}

          <FlowConnector />
          <button
            type="button"
            onClick={onAddStep}
            disabled={steps.length >= 5}
            className="rounded-xl border-2 border-dashed border-zinc-300 bg-white px-5 py-3 text-sm font-semibold text-zinc-700 shadow-sm hover:border-zinc-500 disabled:opacity-40"
          >
            + Adicionar mensagem ao fluxo
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 bg-white px-5 py-4">
        <span className="text-xs text-zinc-500">
          O fluxo é executado de cima para baixo conforme os tempos configurados.
        </span>
        <SaveFlowActions feedback={feedback} saving={saving} onSave={onSave} label="Salvar fluxo" />
      </div>
    </div>
  );
}

function SaveFlowActions({
  feedback,
  saving,
  onSave,
  label,
}: {
  feedback: { type: "ok" | "error"; text: string } | null;
  saving: boolean;
  onSave: () => void;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3">
      {feedback && (
        <span className={`text-sm ${feedback.type === "ok" ? "text-green-700" : "text-red-700"}`}>
          {feedback.text}
        </span>
      )}
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="rounded-lg bg-brand-900 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {saving ? "Salvando..." : label}
      </button>
    </div>
  );
}

function FlowConnector() {
  return (
    <div className="flex h-10 flex-col items-center">
      <span className="h-7 w-px bg-zinc-300" />
      <span className="h-0 w-0 border-x-[5px] border-t-[6px] border-x-transparent border-t-zinc-400" />
    </div>
  );
}

function FlowCartIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 4h2l2.4 10.2a2 2 0 0 0 2 1.5h7.7a2 2 0 0 0 1.9-1.4L21 8H7" />
      <circle cx="10" cy="20" r="1" />
      <circle cx="18" cy="20" r="1" />
    </svg>
  );
}

function FlowClockIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function FlowConditionIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <circle cx="12" cy="4.5" r="1.75" />
      <circle cx="6.5" cy="19.5" r="1.75" />
      <circle cx="17.5" cy="19.5" r="1.75" />
      <path d="M12 6.25V9c0 2-1.25 3-3 4-1.5.85-2.5 2-2.5 4.75" />
      <path d="M12 9c0 2 1.25 3 3 4 1.5.85 2.5 2 2.5 4.75" />
    </svg>
  );
}

function attachmentLabel(type: AbandonedCartMessageStep["attachmentType"]): string {
  if (type === "product_image") return "Imagem do produto";
  if (type === "library") return "Imagem da biblioteca";
  return "Sem anexo";
}

function CouponSettings({
  step,
  onChange,
}: {
  step: AbandonedCartMessageStep;
  onChange: (patch: Partial<AbandonedCartMessageStep>) => void;
}) {
  return (
    <div className="mt-4 border-t border-gray-200 pt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-gray-800">Cupom automático</div>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-gray-500">
            Cria um código exclusivo de uso único e aplica ao checkout antes de enviar a mensagem.
          </p>
        </div>
        <Toggle
          value={step.couponEnabled}
          onChange={(couponEnabled) => onChange({ couponEnabled })}
          label={step.couponEnabled ? "Ativado" : "Desativado"}
          compact
        />
      </div>

      {step.couponEnabled && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/70 p-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs font-medium text-gray-700">
              Tipo de desconto
              <select
                value={step.couponType}
                onChange={(event) =>
                  onChange({
                    couponType: event.target.value as AbandonedCartMessageStep["couponType"],
                  })
                }
                className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
              >
                <option value="percentage">Porcentagem</option>
                <option value="absolute">Valor fixo</option>
                <option value="shipping">Frete grátis</option>
              </select>
            </label>

            {step.couponType !== "shipping" && (
              <label className="text-xs font-medium text-gray-700">
                {step.couponType === "percentage" ? "Desconto (%)" : "Desconto (R$)"}
                <input
                  type="number"
                  min="0.01"
                  max={step.couponType === "percentage" ? 100 : undefined}
                  step={step.couponType === "percentage" ? 1 : 0.01}
                  value={step.couponValue}
                  onChange={(event) =>
                    onChange({ couponValue: Number(event.target.value) })
                  }
                  className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                />
              </label>
            )}

            <label className="text-xs font-medium text-gray-700">
              Validade depois do envio
              <div className="mt-1.5 flex items-center rounded-lg border border-gray-300 bg-white">
                <input
                  type="number"
                  min="1"
                  max="720"
                  step="1"
                  value={step.couponValidHours}
                  onChange={(event) =>
                    onChange({ couponValidHours: Number(event.target.value) })
                  }
                  className="min-w-0 flex-1 rounded-lg px-3 py-2 text-sm outline-none"
                />
                <span className="pr-3 text-xs text-gray-500">horas</span>
              </div>
            </label>

            <label className="text-xs font-medium text-gray-700">
              Compra mínima (opcional)
              <div className="mt-1.5 flex items-center rounded-lg border border-gray-300 bg-white">
                <span className="pl-3 text-xs text-gray-500">R$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={step.couponMinPrice ?? ""}
                  placeholder="Sem mínimo"
                  onChange={(event) =>
                    onChange({
                      couponMinPrice:
                        event.target.value === "" ? null : Number(event.target.value),
                    })
                  }
                  className="min-w-0 flex-1 rounded-lg px-2 py-2 text-sm outline-none"
                />
              </div>
            </label>
          </div>
          <div className="mt-3 text-xs leading-5 text-amber-900">
            Use <strong>{"{{cupom}}"}</strong> para mostrar o código na mensagem. Se o checkout já tiver um cupom, o sistema preserva o código existente.
          </div>
        </div>
      )}
    </div>
  );
}

function couponStepLabel(step: AbandonedCartMessageStep): string {
  if (step.couponType === "shipping") return "Cupom: frete grátis";
  if (step.couponType === "percentage") {
    return `Cupom: ${formatCompactNumber(step.couponValue)}%`;
  }
  return `Cupom: ${formatMoney(step.couponValue, "BRL")}`;
}

function CartRows({
  cart,
  steps,
  storeName,
  displayStatus,
  expanded,
  onToggle,
}: {
  cart: AbandonedCartView;
  steps: AbandonedCartMessageStep[];
  storeName: string;
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
        <td className="px-5 py-4 min-w-[300px]">
          <MessageSequenceStatus cart={cart} steps={steps} storeName={storeName} />
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
                        {message.couponCode && (
                          <div className="mt-0.5 text-xs font-medium text-amber-700">
                            Cupom {message.couponCode} aplicado
                          </div>
                        )}
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

interface MessagePreviewState {
  step: AbandonedCartMessageStep;
  stepNumber: number;
  delivery: CartMessageView | null;
  status: string;
  content: string;
  attachmentUrl: string | null;
  top: number;
  left: number;
}

function MessageSequenceStatus({
  cart,
  steps,
  storeName,
}: {
  cart: AbandonedCartView;
  steps: AbandonedCartMessageStep[];
  storeName: string;
}) {
  const [preview, setPreview] = useState<MessagePreviewState | null>(null);
  const messagesByStep = new Map(
    cart.messages.map((message) => [message.routineStepKey, message])
  );

  function openPreview(
    target: HTMLButtonElement,
    step: AbandonedCartMessageStep,
    stepNumber: number,
    delivery: CartMessageView | null,
    status: string
  ) {
    const rect = target.getBoundingClientRect();
    const panelWidth = 360;
    const panelHeight = 430;
    const fitsOnRight = rect.right + panelWidth + 20 <= window.innerWidth;
    const left = fitsOnRight
      ? rect.right + 10
      : Math.max(12, rect.left - panelWidth - 10);
    const top = Math.max(
      12,
      Math.min(rect.top - 72, window.innerHeight - panelHeight - 12)
    );

    setPreview({
      step,
      stepNumber,
      delivery,
      status,
      content: renderCartMessage(step, cart, storeName, delivery?.couponCode),
      attachmentUrl:
        delivery?.attachmentUrl ||
        (step.attachmentType === "library"
          ? step.attachmentUrl
          : step.attachmentType === "product_image"
            ? cart.products.find((product) => product.imageUrl)?.imageUrl || null
            : null),
      top,
      left,
    });
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-start gap-2">
        {steps.map((step, index) => {
          const delivery = messagesByStep.get(step.id) ?? null;
          const status = stepDeliveryStatus(step, delivery, cart);
          const visual = sequenceStatusVisual(status);
          return (
            <div key={step.id} className="flex w-14 flex-col items-center gap-1">
              <button
                type="button"
                onMouseEnter={(event) =>
                  openPreview(event.currentTarget, step, index + 1, delivery, status)
                }
                onMouseLeave={() => setPreview(null)}
                onFocus={(event) =>
                  openPreview(event.currentTarget, step, index + 1, delivery, status)
                }
                onBlur={() => setPreview(null)}
                className={`relative grid h-10 w-10 place-items-center rounded-full border-2 bg-white transition hover:-translate-y-0.5 hover:shadow-md ${visual.iconClass}`}
                aria-label={`${index + 1}ª mensagem: ${visual.label}. Passe o mouse para visualizar.`}
              >
                <MessageCircleIcon />
                <span className={`absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[9px] font-bold ${visual.badgeClass}`}>
                  {index + 1}
                </span>
              </button>
              <span className={`max-w-14 truncate text-center text-[10px] font-medium ${visual.textClass}`}>
                {visual.label}
              </span>
            </div>
          );
        })}
      </div>

      {preview && (
        <div
          className="pointer-events-none fixed z-[90] w-[360px] max-w-[calc(100vw-24px)] overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl"
          style={{ top: preview.top, left: preview.left }}
          role="tooltip"
        >
          <div className="flex items-center justify-between gap-3 bg-zinc-900 px-4 py-3 text-white">
            <div>
              <div className="text-sm font-semibold">
                [{preview.stepNumber}] Carrinho abandonado
              </div>
              <div className="mt-0.5 text-[11px] text-zinc-300">
                {formatDelay(preview.step.delayMinutes)} após o carrinho
              </div>
            </div>
            <span className="rounded-full bg-white/15 px-2 py-1 text-[11px] font-medium">
              {messageStatusLabels[preview.status] || preview.status}
            </span>
          </div>

          <div className="max-h-[350px] overflow-hidden bg-[#efeae2] p-4">
            <div className="max-h-[270px] overflow-y-auto rounded-xl rounded-tr-sm bg-[#d9fdd3] p-1.5 text-sm leading-6 text-zinc-800 shadow-sm">
              {preview.attachmentUrl && (
                <img
                  src={preview.attachmentUrl}
                  alt="Anexo da mensagem"
                  className="mb-1 max-h-40 w-full rounded-lg object-cover"
                />
              )}
              <div className="whitespace-pre-wrap break-words px-2.5 py-2">
                {preview.content}
              </div>
            </div>
            <div className="mt-3 text-xs text-zinc-600">
              {preview.delivery ? (
                <>
                  {preview.delivery.sentAt ? "Enviada em " : "Programada para "}
                  <strong>
                    {formatDateTime(
                      preview.delivery.sentAt || preview.delivery.scheduledFor
                    )}
                  </strong>
                </>
              ) : (
                "Esta etapa ainda não gerou um envio para este carrinho."
              )}
            </div>
            {preview.delivery?.errorMessage && (
              <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                {preview.delivery.errorMessage}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function MessageCircleIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="21"
      height="21"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.2 9.2 0 0 1-3.8-.9L3 20.5l1.5-4.8A8.4 8.4 0 1 1 21 11.5Z" />
      <path d="M8.2 11.7h.01M12 11.7h.01M15.8 11.7h.01" />
    </svg>
  );
}

function stepDeliveryStatus(
  step: AbandonedCartMessageStep,
  delivery: CartMessageView | null,
  cart: AbandonedCartView
): string {
  if (delivery) return delivery.status;
  if (!step.enabled) return "paused";
  if (!cart.customerPhone) return "no_phone";
  return "waiting";
}

function sequenceStatusVisual(status: string): {
  label: string;
  iconClass: string;
  badgeClass: string;
  textClass: string;
} {
  if (status === "sent") {
    return {
      label: "Enviada",
      iconClass: "border-emerald-500 text-emerald-600",
      badgeClass: "bg-emerald-600 text-white",
      textClass: "text-emerald-700",
    };
  }
  if (status === "failed") {
    return {
      label: "Falhou",
      iconClass: "border-red-400 text-red-600",
      badgeClass: "bg-red-600 text-white",
      textClass: "text-red-700",
    };
  }
  if (status === "scheduled" || status === "processing") {
    return {
      label: status === "processing" ? "Enviando" : "Agendada",
      iconClass: "border-blue-400 text-blue-600",
      badgeClass: "bg-blue-600 text-white",
      textClass: "text-blue-700",
    };
  }
  if (status === "cancelled") {
    return {
      label: "Cancelada",
      iconClass: "border-zinc-300 text-zinc-400",
      badgeClass: "bg-zinc-500 text-white",
      textClass: "text-zinc-500",
    };
  }
  if (status === "paused") {
    return {
      label: "Pausada",
      iconClass: "border-zinc-200 text-zinc-400",
      badgeClass: "bg-zinc-400 text-white",
      textClass: "text-zinc-500",
    };
  }
  if (status === "no_phone") {
    return {
      label: "Sem número",
      iconClass: "border-amber-300 text-amber-600",
      badgeClass: "bg-amber-500 text-white",
      textClass: "text-amber-700",
    };
  }
  return {
    label: "Aguardando",
    iconClass: "border-zinc-300 text-zinc-600",
    badgeClass: "bg-zinc-700 text-white",
    textClass: "text-zinc-600",
  };
}

function renderCartMessage(
  step: AbandonedCartMessageStep,
  cart: AbandonedCartView,
  storeName: string,
  deliveredCouponCode?: string | null
): string {
  const firstName = cart.customerName.trim().split(/\s+/)[0] || "cliente";
  const couponCode = deliveredCouponCode || (step.couponEnabled ? "GERADO NO ENVIO" : "");
  const template =
    couponCode && !step.messageTemplate.includes("{{cupom}}")
      ? `${step.messageTemplate}\n\nUse o cupom *{{cupom}}* no seu carrinho.`
      : step.messageTemplate;
  const variables: Record<string, string> = {
    "{{nome}}": firstName,
    "{{produtos}}": cart.productsSummary || "seus produtos",
    "{{link}}": cart.checkoutUrl || "Link indisponível",
    "{{loja}}": storeName,
    "{{cupom}}": couponCode,
    "{{desconto}}": couponDiscountPreview(step),
  };
  return Object.entries(variables).reduce(
    (message, [variable, value]) => message.replaceAll(variable, value),
    template
  );
}

function couponDiscountPreview(step: AbandonedCartMessageStep): string {
  if (!step.couponEnabled) return "";
  if (step.couponType === "shipping") return "frete grátis";
  if (step.couponType === "percentage") {
    return `${formatCompactNumber(step.couponValue)}% de desconto`;
  }
  return `${formatMoney(step.couponValue, "BRL")} de desconto`;
}

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value);
}

function formatDelay(delayMinutes: number): string {
  if (delayMinutes >= 1_440 && delayMinutes % 1_440 === 0) {
    const days = delayMinutes / 1_440;
    return `${days} dia${days === 1 ? "" : "s"}`;
  }
  if (delayMinutes >= 60 && delayMinutes % 60 === 0) {
    const hours = delayMinutes / 60;
    return `${hours} hora${hours === 1 ? "" : "s"}`;
  }
  return `${delayMinutes} minuto${delayMinutes === 1 ? "" : "s"}`;
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
