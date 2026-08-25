"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type {
  AutomationAttachmentType,
  AutomationMediaAsset,
  PostSaleMessageStep,
  PostSaleTrigger,
} from "@avaliacoes/shared";
import { AutomationAttachmentPicker } from "../AutomationAttachmentPicker";
import { AutomationDelayField } from "../AutomationDelayField";

export interface PostSaleMessageView {
  stepId: string;
  trackingCode: string | null;
  trackingStatus: string | null;
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
  paymentStatus: string | null;
  shippingStatus: string | null;
  fulfillmentStatus: string | null;
  trackingStatus: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  orderedAt: string;
  postSaleMessages: PostSaleMessageView[];
  deliveryEvents: Array<{
    eventType: string;
    status: string;
    description: string | null;
    happenedAt: string;
  }>;
  reviewRequests: ReviewRequestView[];
}

interface PostSaleDashboardProps {
  storeId: string;
  initialReviewEnabled: boolean;
  initialReviewDelayMinutes: number;
  initialReviewTemplate: string;
  initialReviewAttachmentType: AutomationAttachmentType;
  initialReviewAttachmentUrl: string | null;
  initialPostSaleSequence: PostSaleMessageStep[];
  initialMediaAssets: AutomationMediaAsset[];
  initialBirthdayEnabled: boolean;
  initialBirthdayDelayMinutes: number;
  initialBirthdayTemplate: string;
  orders: PostSaleOrderView[];
  mode?: "all" | "routine" | "messages" | "orders";
}

const dateTime = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

const POST_SALE_STEP_META: Record<
  PostSaleTrigger,
  { trigger: string; title: string; description: string; tracking: boolean }
> = {
  order_created: {
    trigger: "Pedido criado",
    title: "Confirmação de pedido",
    description: "Avisa o cliente assim que o pedido é recebido.",
    tracking: false,
  },
  order_paid: {
    trigger: "Pagamento aprovado",
    title: "Pagamento confirmado",
    description: "Confirma que o pagamento foi aprovado.",
    tracking: false,
  },
  order_packed: {
    trigger: "Pedido preparado",
    title: "Pedido separado",
    description: "Avisa que os produtos já foram separados para envio.",
    tracking: false,
  },
  order_fulfilled: {
    trigger: "Pedido despachado",
    title: "Envio com rastreio",
    description: "Envia o código e o link de rastreamento.",
    tracking: true,
  },
  tracking_in_transit: {
    trigger: "Objeto em trânsito",
    title: "Atualização de transporte",
    description: "Informa que a encomenda está seguindo para o destino.",
    tracking: true,
  },
  tracking_out_for_delivery: {
    trigger: "Saiu para entrega",
    title: "Saiu para entrega",
    description: "Avisa que a entrega deve acontecer em breve.",
    tracking: true,
  },
  tracking_ready_for_pickup: {
    trigger: "Disponível para retirada",
    title: "Pedido disponível para retirada",
    description: "Avisa quando o pedido pode ser retirado pelo cliente.",
    tracking: true,
  },
  tracking_delivered: {
    trigger: "Pedido entregue",
    title: "Confirmação de entrega",
    description: "Confirma que a transportadora marcou o pedido como entregue.",
    tracking: true,
  },
  tracking_delayed: {
    trigger: "Entrega atrasada",
    title: "Aviso de atraso",
    description: "Avisa o cliente quando a transportadora informa atraso.",
    tracking: true,
  },
  tracking_delivery_attempt_failed: {
    trigger: "Tentativa sem sucesso",
    title: "Tentativa de entrega",
    description: "Informa que houve uma tentativa de entrega sem sucesso.",
    tracking: true,
  },
};

export function PostSaleDashboard({
  storeId,
  initialReviewEnabled,
  initialReviewDelayMinutes,
  initialReviewTemplate,
  initialReviewAttachmentType,
  initialReviewAttachmentUrl,
  initialPostSaleSequence,
  initialMediaAssets,
  initialBirthdayEnabled,
  initialBirthdayDelayMinutes,
  initialBirthdayTemplate,
  orders,
  mode = "orders",
}: PostSaleDashboardProps) {
  const router = useRouter();
  const [reviewEnabled, setReviewEnabled] = useState(initialReviewEnabled);
  const [reviewDelayMinutes, setReviewDelayMinutes] = useState(
    initialReviewDelayMinutes
  );
  const [reviewTemplate, setReviewTemplate] = useState(initialReviewTemplate);
  const [reviewAttachmentType, setReviewAttachmentType] = useState(
    initialReviewAttachmentType
  );
  const [reviewAttachmentUrl, setReviewAttachmentUrl] = useState(
    initialReviewAttachmentUrl
  );
  const [postSaleSteps, setPostSaleSteps] = useState(initialPostSaleSequence);
  const [mediaAssets, setMediaAssets] = useState(initialMediaAssets);
  const [birthdayEnabled, setBirthdayEnabled] = useState(initialBirthdayEnabled);
  const [birthdayDelayMinutes, setBirthdayDelayMinutes] = useState(
    initialBirthdayDelayMinutes
  );
  const [birthdayTemplate, setBirthdayTemplate] = useState(
    initialBirthdayTemplate
  );
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "ok" | "error";
    text: string;
  } | null>(null);
  const showRoutine = mode === "all" || mode === "routine";
  const showMessages = mode === "all" || mode === "messages";
  const showOrders = mode === "all" || mode === "orders";

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
    const messages = orders.flatMap((order) => order.postSaleMessages);
    return {
      orders: orders.length,
      scheduled:
        requests.filter((request) => request.status === "scheduled").length +
        messages.filter((message) => message.status === "scheduled").length,
      sent:
        requests.filter((request) => request.status === "sent").length +
        messages.filter((message) => message.status === "sent").length,
      completed: requests.filter((request) => request.status === "completed").length,
    };
  }, [orders]);

  function updatePostSaleStep(
    id: PostSaleTrigger,
    updates: Partial<PostSaleMessageStep>
  ) {
    setPostSaleSteps((current) =>
      current.map((step) => (step.id === id ? { ...step, ...updates } : step))
    );
  }

  async function saveRoutine() {
    setSaving(true);
    setFeedback(null);
    const response = await fetch("/api/automations/post-sale-routine", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        storeId,
        reviewEnabled,
        reviewDelayMinutes,
        reviewTemplate,
        reviewAttachmentType,
        reviewAttachmentUrl,
        postSaleSequence: postSaleSteps,
        birthdayEnabled,
        birthdayDelayMinutes,
        birthdayTemplate,
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
    setFeedback({
      type: "ok",
      text: showMessages ? "Mensagens salvas." : "Rotinas salvas.",
    });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {(showRoutine || showMessages) && <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">
              {showMessages ? "Mensagens de pós-venda" : "Rotinas de pós-venda"}
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              {showMessages
                ? "Edite os textos. A ativação e os horários ficam na página Rotinas."
                : "Ative os envios e escolha quando cada mensagem deve sair."}
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
              {saving
                ? "Salvando..."
                : showMessages
                  ? "Salvar mensagens"
                  : "Salvar rotinas"}
            </button>
          </div>
        </div>

        <div className="grid gap-5 p-5 xl:grid-cols-2">
          {showRoutine ? (
            <>
              <PostSaleFlowCard
                trigger="Pedido entregue"
                title="Pedido de avaliação"
                description="Envia um convite por produto depois que a entrega for confirmada."
                enabled={reviewEnabled}
                onEnabledChange={setReviewEnabled}
                timing={
                  <AutomationDelayField
                    delayMinutes={reviewDelayMinutes}
                    minMinutes={10}
                    maxMinutes={129_600}
                    presets={[
                      { label: "1 h", value: 60 },
                      { label: "1 dia", value: 1_440 },
                      { label: "3 dias", value: 4_320 },
                      { label: "7 dias", value: 10_080 },
                      { label: "14 dias", value: 20_160 },
                    ]}
                    onChange={setReviewDelayMinutes}
                  />
                }
                attachmentType={reviewAttachmentType}
              />

              <PostSaleFlowCard
                trigger="Pedido criado"
                title="Coleta de aniversário"
                description="Pede a data de nascimento depois da compra quando o cliente ainda não possui aniversário cadastrado."
                enabled={birthdayEnabled}
                onEnabledChange={setBirthdayEnabled}
                timing={
                  <AutomationDelayField
                    delayMinutes={birthdayDelayMinutes}
                    minMinutes={0}
                    maxMinutes={43_200}
                    presets={[
                      { label: "Imediato", value: 0 },
                      { label: "1 h", value: 60 },
                      { label: "1 dia", value: 1_440 },
                      { label: "3 dias", value: 4_320 },
                      { label: "7 dias", value: 10_080 },
                    ]}
                    onChange={setBirthdayDelayMinutes}
                  />
                }
                attachmentType="none"
                editMessageHref={null}
              >
                <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-900">
                  A variável <strong>{"{{link}}"}</strong> abre a página segura onde o cliente informa a data.
                </div>
                <TemplateEditor
                  value={birthdayTemplate}
                  onChange={setBirthdayTemplate}
                  variables={["{{nome}}", "{{loja}}", "{{link}}"]}
                  label="Mensagem para coletar o aniversário"
                />
              </PostSaleFlowCard>

              {postSaleSteps.map((step) => {
                const meta = POST_SALE_STEP_META[step.id];
                return (
                  <PostSaleFlowCard
                    key={step.id}
                    trigger={meta.trigger}
                    title={meta.title}
                    description={meta.description}
                    enabled={step.enabled}
                    onEnabledChange={(enabled) =>
                      updatePostSaleStep(step.id, { enabled })
                    }
                    timing={
                      <AutomationDelayField
                        delayMinutes={step.delayMinutes}
                        minMinutes={0}
                        maxMinutes={43_200}
                        presets={[
                          { label: "Imediato", value: 0 },
                          { label: "10 min", value: 10 },
                          { label: "30 min", value: 30 },
                          { label: "1 h", value: 60 },
                          { label: "1 dia", value: 1_440 },
                        ]}
                        onChange={(delayMinutes) =>
                          updatePostSaleStep(step.id, { delayMinutes })
                        }
                      />
                    }
                    attachmentType={step.attachmentType}
                  >
                    {step.delayMinutes === 0 && (
                      <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-5 text-blue-900">
                        A mensagem sai no próximo processamento da fila depois que o estado for recebido.
                      </div>
                    )}
                  </PostSaleFlowCard>
                );
              })}
            </>
          ) : (
            <>
              <MessageTemplateCard
                title="Pedido de avaliação"
                description="O link abre o formulário móvel com o produto correto e identifica a compra."
              >
                <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-5 text-emerald-900">
                  Mantenha a variável <strong>{"{{link}}"}</strong> para levar o cliente diretamente à avaliação.
                </div>
                <TemplateEditor
                  value={reviewTemplate}
                  onChange={setReviewTemplate}
                  variables={["{{nome}}", "{{produto}}", "{{link}}", "{{loja}}"]}
                  label="Mensagem do pedido de avaliação"
                />
                <AutomationAttachmentPicker
                  storeId={storeId}
                  attachmentType={reviewAttachmentType}
                  attachmentUrl={reviewAttachmentUrl}
                  assets={mediaAssets}
                  onChange={(attachmentType, attachmentUrl) => {
                    setReviewAttachmentType(attachmentType);
                    setReviewAttachmentUrl(attachmentUrl);
                  }}
                  onAssetUploaded={(asset) =>
                    setMediaAssets((current) => [
                      asset,
                      ...current.filter((item) => item.path !== asset.path),
                    ])
                  }
                />
              </MessageTemplateCard>

              <ReviewFormPreview />

              {postSaleSteps.map((step) => {
                const meta = POST_SALE_STEP_META[step.id];
                return (
                  <MessageTemplateCard
                    key={step.id}
                    title={meta.title}
                    description={meta.description}
                  >
                    {meta.tracking && (
                      <div className="mb-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-5 text-blue-900">
                        Use <strong>{"{{codigo_rastreio}}"}</strong>, <strong>{"{{link_rastreio}}"}</strong> e <strong>{"{{status_entrega}}"}</strong> para inserir os dados recebidos da transportadora.
                      </div>
                    )}
                    <TemplateEditor
                      value={step.messageTemplate}
                      onChange={(messageTemplate) =>
                        updatePostSaleStep(step.id, { messageTemplate })
                      }
                      variables={[
                        "{{nome}}",
                        "{{pedido}}",
                        "{{produtos}}",
                        "{{loja}}",
                        "{{link}}",
                        "{{codigo_rastreio}}",
                        "{{link_rastreio}}",
                        "{{status_entrega}}",
                      ]}
                      label={`Mensagem: ${meta.title}`}
                    />
                    <AutomationAttachmentPicker
                      storeId={storeId}
                      attachmentType={step.attachmentType}
                      attachmentUrl={step.attachmentUrl}
                      assets={mediaAssets}
                      onChange={(attachmentType, attachmentUrl) =>
                        updatePostSaleStep(step.id, {
                          attachmentType,
                          attachmentUrl,
                        })
                      }
                      onAssetUploaded={(asset) =>
                        setMediaAssets((current) => [
                          asset,
                          ...current.filter((item) => item.path !== asset.path),
                        ])
                      }
                    />
                  </MessageTemplateCard>
                );
              })}
            </>
          )}
        </div>
      </section>}

      {showOrders && <><div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
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
            <table className="w-full min-w-[1440px] text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-5 py-3 text-left">Pedido</th>
                  <th className="px-5 py-3 text-left">Cliente</th>
                  <th className="px-5 py-3 text-left">Produtos</th>
                  <th className="px-5 py-3 text-left">Entrega e rastreio</th>
                  <th className="px-5 py-3 text-left">Mensagens de pós-venda</th>
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
                    <td className="min-w-[235px] px-5 py-4">
                      <DeliveryStatus order={order} />
                    </td>
                    <td className="min-w-[230px] px-5 py-4">
                      {order.postSaleMessages.length ? (
                        <div className="space-y-2">
                          {order.postSaleMessages.map((message) => (
                            <div key={`${message.stepId}-${message.scheduledFor}`}>
                              <div className="text-xs font-medium text-gray-700">
                                {postSaleStepLabel(message.stepId)}
                              </div>
                              <MessageStatus message={message} empty="Sem envio" compact />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">Nenhuma mensagem</span>
                      )}
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
      </section></>}
    </div>
  );
}

function PostSaleFlowCard({
  trigger,
  title,
  description,
  enabled,
  onEnabledChange,
  timing,
  attachmentType,
  editMessageHref = "/automations/post-sale?section=messages",
  children,
}: {
  trigger: string;
  title: string;
  description: string;
  enabled: boolean;
  onEnabledChange: (value: boolean) => void;
  timing: React.ReactNode;
  attachmentType: AutomationAttachmentType;
  editMessageHref?: string | null;
  children?: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-[radial-gradient(#d4d4d8_1px,transparent_1px)] bg-[size:20px_20px] p-5">
      <div className="mx-auto flex max-w-lg flex-col items-center">
        <div className="w-full rounded-2xl border-2 border-emerald-400 bg-white p-4 shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Gatilho</div>
          <div className="mt-1 font-semibold text-zinc-950">{trigger}</div>
        </div>
        <FlowArrow />
        <div className="w-full rounded-2xl border border-violet-200 bg-violet-50 p-4 shadow-sm">
          <div className="mb-3 text-[10px] font-bold uppercase tracking-wider text-violet-700">Espera</div>
          {timing}
        </div>
        <FlowArrow />
        <div className={`w-full rounded-2xl border-2 bg-white shadow-sm ${enabled ? "border-blue-400" : "border-zinc-300 opacity-70"}`}>
          <div className="flex items-start justify-between gap-4 border-b border-zinc-100 p-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold text-gray-950">{title}</h3>
                <span className={`rounded-full px-2 py-1 text-xs font-medium ${enabled ? "bg-green-100 text-green-800" : "bg-gray-200 text-gray-600"}`}>
                  {enabled ? "Ativa" : "Pausada"}
                </span>
              </div>
              <p className="mt-1 text-sm leading-5 text-gray-500">{description}</p>
            </div>
            <Toggle value={enabled} onChange={onEnabledChange} />
          </div>
          <div className="p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-600">
                {postSaleAttachmentLabel(attachmentType)}
              </span>
              {editMessageHref && (
                <Link
                  href={editMessageHref}
                  className="text-xs font-semibold text-brand-900 underline"
                >
                  Editar mensagem
                </Link>
              )}
            </div>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

function FlowArrow() {
  return (
    <div className="flex h-9 flex-col items-center">
      <span className="h-6 w-px bg-zinc-300" />
      <span className="h-0 w-0 border-x-[5px] border-t-[6px] border-x-transparent border-t-zinc-400" />
    </div>
  );
}

function postSaleAttachmentLabel(type: AutomationAttachmentType): string {
  if (type === "product_image") return "Imagem do produto";
  if (type === "library") return "Imagem da biblioteca";
  return "Sem anexo";
}

function MessageTemplateCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50/60 p-5">
      <h3 className="font-semibold text-gray-950">{title}</h3>
      <p className="mb-4 mt-1 text-sm leading-5 text-gray-500">{description}</p>
      {children}
    </div>
  );
}

function ReviewFormPreview() {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-gray-50/60 p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-gray-950">Prévia da página de avaliação</h3>
          <p className="mt-1 text-sm leading-5 text-gray-500">
            Esta é a tela que o cliente abre pelo link da mensagem.
          </p>
        </div>
        <a
          href="/avaliar/preview"
          target="_blank"
          rel="noreferrer"
          className="text-xs font-semibold text-brand-900 underline"
        >
          Abrir em tela cheia ↗
        </a>
      </div>

      <div className="mx-auto w-full max-w-[410px] overflow-hidden rounded-[32px] border-[7px] border-zinc-900 bg-zinc-900 shadow-xl">
        <div className="flex h-7 items-center justify-center bg-zinc-900">
          <span className="h-1.5 w-20 rounded-full bg-zinc-700" />
        </div>
        <iframe
          src="/avaliar/preview"
          title="Prévia do formulário de avaliação"
          className="h-[660px] w-full bg-[#f3f2ef]"
        />
      </div>
      <p className="mt-4 text-center text-xs leading-5 text-gray-500">
        A prévia usa um produto real do catálogo e a cor configurada da loja. O envio fica desativado neste modo.
      </p>
    </div>
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

function DeliveryStatus({ order }: { order: PostSaleOrderView }) {
  const current =
    order.trackingStatus || order.fulfillmentStatus || order.shippingStatus;
  return (
    <div>
      <span className={deliveryStatusClass(current)}>
        {deliveryStatusLabel(current)}
      </span>
      {order.trackingNumber && (
        <div className="mt-2 text-xs text-gray-600">
          Código: <strong className="font-mono text-gray-900">{order.trackingNumber}</strong>
        </div>
      )}
      {order.trackingUrl && (
        <a
          href={order.trackingUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-block text-xs font-semibold text-brand-900 underline"
        >
          Acompanhar entrega ↗
        </a>
      )}
      {order.deliveryEvents.length > 0 && (
        <div className="mt-3 space-y-1.5 border-l border-gray-200 pl-3">
          {order.deliveryEvents.slice(0, 3).map((event, index) => (
            <div
              key={`${event.eventType}-${event.status}-${index}`}
              className="text-xs text-gray-500"
              title={event.description || deliveryStatusLabel(event.status)}
            >
              <span className="font-medium text-gray-700">
                {deliveryStatusLabel(event.status)}
              </span>{" "}
              · {safeDateTime(event.happenedAt)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function deliveryStatusLabel(status: string | null): string {
  if (!status) return "Aguardando envio";
  const labels: Record<string, string> = {
    unpacked: "Aguardando preparo",
    unfulfilled: "Aguardando envio",
    packed: "Pedido preparado",
    PACKED: "Pedido preparado",
    fulfilled: "Enviado",
    dispatched: "Postado",
    DISPATCHED: "Enviado",
    received_by_post_office: "Recebido pela transportadora",
    in_transit: "Em trânsito",
    out_for_delivery: "Saiu para entrega",
    ready_for_pickup: "Disponível para retirada",
    READY_FOR_PICKUP: "Disponível para retirada",
    delivered: "Entregue",
    DELIVERED: "Entregue",
    delayed: "Entrega atrasada",
    delivery_attempt_failed: "Tentativa de entrega",
    returned_to_sender: "Devolvido ao remetente",
    lost: "Objeto extraviado",
  };
  return labels[status] || status;
}

function deliveryStatusClass(status: string | null): string {
  const normalized = status?.toLowerCase();
  const color =
    normalized === "delivered"
      ? "bg-green-100 text-green-800"
      : normalized === "delayed" ||
          normalized === "delivery_attempt_failed" ||
          normalized === "lost"
        ? "bg-red-100 text-red-800"
        : normalized === "in_transit" ||
            normalized === "out_for_delivery" ||
            normalized === "dispatched" ||
            normalized === "fulfilled"
          ? "bg-blue-100 text-blue-800"
          : "bg-gray-100 text-gray-700";
  return `inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${color}`;
}

function postSaleStepLabel(stepId: string): string {
  return POST_SALE_STEP_META[stepId as PostSaleTrigger]?.title || stepId;
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
    packed: "Preparado",
    in_transit: "Em trânsito",
    out_for_delivery: "Saiu para entrega",
    delivered: "Entregue",
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
