"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export interface ActiveAutomationView {
  id: string;
  title: string;
  category: string;
  trigger: string;
  description: string;
  href: string;
  messageCount: number;
}

interface PresetAutomation {
  id: string;
  title: string;
  category: string;
  trigger: string;
  description: string;
  href: string;
  messages: string;
  tone: "amber" | "blue" | "emerald" | "violet";
}

const PRESETS: PresetAutomation[] = [
  {
    id: "cart-recovery",
    title: "Recuperação de carrinho",
    category: "Carrinho abandonado",
    trigger: "Carrinho abandonado identificado",
    description: "Lembre o cliente da compra e acrescente novas mensagens, anexos ou cupom automático.",
    href: "/automations/abandoned-carts?section=routines&editor=preset",
    messages: "1 mensagem inicial · até 5 mensagens",
    tone: "amber",
  },
  {
    id: "order-confirmation",
    title: "Confirmação de pedido",
    category: "Pós-venda",
    trigger: "Pedido criado",
    description: "Confirme que o pedido foi recebido e informe ao cliente que a preparação começou.",
    href: "/automations/post-sale?section=routines&focus=order_created&editor=preset",
    messages: "1 mensagem pronta",
    tone: "blue",
  },
  {
    id: "shipping-tracking",
    title: "Pedido enviado com rastreio",
    category: "Pós-venda",
    trigger: "Pedido despachado",
    description: "Envie automaticamente o código e o link de rastreamento recebidos da transportadora.",
    href: "/automations/post-sale?section=routines&focus=order_fulfilled&editor=preset",
    messages: "1 mensagem pronta",
    tone: "blue",
  },
  {
    id: "out-for-delivery",
    title: "Saiu para entrega",
    category: "Pós-venda",
    trigger: "Saiu para entrega",
    description: "Avise que o pedido está a caminho do endereço do cliente.",
    href: "/automations/post-sale?section=routines&focus=tracking_out_for_delivery&editor=preset",
    messages: "1 mensagem pronta",
    tone: "blue",
  },
  {
    id: "review-request",
    title: "Pedido de avaliação",
    category: "Avaliações",
    trigger: "Pedido entregue",
    description: "Leve o cliente direto ao formulário móvel do produto comprado.",
    href: "/automations/post-sale?section=routines&focus=review_request&editor=preset",
    messages: "1 mensagem pronta",
    tone: "emerald",
  },
  {
    id: "birthday-collection",
    title: "Coleta de aniversário",
    category: "Relacionamento",
    trigger: "Pedido criado",
    description: "Peça a data de nascimento somente para clientes que ainda não a informaram.",
    href: "/automations/post-sale?section=routines&focus=birthday_collection&editor=preset",
    messages: "1 mensagem pronta",
    tone: "violet",
  },
];

const POST_SALE_TRIGGERS = [
  ["order_created", "Pedido criado"],
  ["order_paid", "Pagamento aprovado"],
  ["order_packed", "Pedido preparado"],
  ["order_fulfilled", "Pedido despachado"],
  ["tracking_in_transit", "Objeto em trânsito"],
  ["tracking_out_for_delivery", "Saiu para entrega"],
  ["tracking_ready_for_pickup", "Disponível para retirada"],
  ["tracking_delivered", "Pedido entregue"],
  ["tracking_delayed", "Entrega atrasada"],
  ["tracking_delivery_attempt_failed", "Tentativa sem sucesso"],
] as const;

export function AutomationLibrary({
  activeAutomations,
}: {
  activeAutomations: ActiveAutomationView[];
}) {
  const [tab, setTab] = useState<"active" | "presets">("active");
  const [search, setSearch] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
  const visiblePresets = useMemo(
    () =>
      PRESETS.filter((preset) =>
        [preset.title, preset.category, preset.trigger, preset.description]
          .join(" ")
          .toLocaleLowerCase("pt-BR")
          .includes(normalizedSearch)
      ),
    [normalizedSearch]
  );

  return (
    <div className="space-y-6 p-5 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-950">Automações</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600">
            Use uma automação pronta ou comece em branco escolhendo o gatilho e as mensagens.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setNewOpen(true)}
          className="rounded-xl bg-zinc-950 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800"
        >
          + Nova automação em branco
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-zinc-200 bg-white p-2 shadow-sm">
        <div className="inline-flex rounded-xl bg-zinc-100 p-1">
          <TabButton active={tab === "active"} onClick={() => setTab("active")}>
            Ativas <span className="ml-1 rounded-full bg-white/80 px-1.5 py-0.5 text-[10px]">{activeAutomations.length}</span>
          </TabButton>
          <TabButton active={tab === "presets"} onClick={() => setTab("presets")}>
            Pré-definidas <span className="ml-1 rounded-full bg-white/80 px-1.5 py-0.5 text-[10px]">{PRESETS.length}</span>
          </TabButton>
        </div>
        {tab === "presets" && (
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar automação pronta"
            className="min-w-[230px] rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
          />
        )}
      </div>

      {tab === "active" ? (
        activeAutomations.length ? (
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {activeAutomations.map((automation) => (
              <ActiveCard key={automation.id} automation={automation} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="Nenhuma automação ativa"
            description="Escolha um modelo pronto ou crie a primeira automação em branco."
            onPresets={() => setTab("presets")}
            onBlank={() => setNewOpen(true)}
          />
        )
      ) : visiblePresets.length ? (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {visiblePresets.map((preset) => (
            <PresetCard key={preset.id} preset={preset} />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-12 text-center text-sm text-zinc-500">
          Nenhuma automação pronta encontrada nessa busca.
        </div>
      )}

      {newOpen && <NewAutomationDialog onClose={() => setNewOpen(false)} />}
    </div>
  );
}

function ActiveCard({ automation }: { automation: ActiveAutomationView }) {
  return (
    <article className="flex min-h-[230px] flex-col rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">Ativa</span>
        <span className="text-xs font-medium text-zinc-400">{automation.category}</span>
      </div>
      <h2 className="mt-4 text-lg font-semibold text-zinc-950">{automation.title}</h2>
      <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50/70 px-3 py-2.5">
        <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Gatilho</div>
        <div className="mt-0.5 text-sm font-medium text-zinc-800">{automation.trigger}</div>
      </div>
      <p className="mt-3 flex-1 text-sm leading-6 text-zinc-600">{automation.description}</p>
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-zinc-100 pt-4">
        <span className="text-xs text-zinc-500">{automation.messageCount} {automation.messageCount === 1 ? "mensagem" : "mensagens"}</span>
        <Link href={automation.href} className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50">Editar automação</Link>
      </div>
    </article>
  );
}

function PresetCard({ preset }: { preset: PresetAutomation }) {
  const tones = {
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    blue: "border-blue-200 bg-blue-50 text-blue-800",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
    violet: "border-violet-200 bg-violet-50 text-violet-800",
  };
  return (
    <article className="flex min-h-[270px] flex-col rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${tones[preset.tone]}`}>Pré-definida</span>
        <span className="text-xs font-medium text-zinc-400">{preset.category}</span>
      </div>
      <h2 className="mt-4 text-lg font-semibold text-zinc-950">{preset.title}</h2>
      <div className="mt-3 text-[10px] font-bold uppercase tracking-wider text-zinc-400">Começa quando</div>
      <div className="mt-1 text-sm font-medium text-zinc-800">{preset.trigger}</div>
      <p className="mt-3 flex-1 text-sm leading-6 text-zinc-600">{preset.description}</p>
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-zinc-100 pt-4">
        <span className="text-xs text-zinc-500">{preset.messages}</span>
        <Link href={preset.href} className="rounded-lg bg-zinc-950 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-800">Usar este modelo</Link>
      </div>
    </article>
  );
}

function NewAutomationDialog({ onClose }: { onClose: () => void }) {
  const [type, setType] = useState("abandoned_cart");
  const [trigger, setTrigger] = useState<(typeof POST_SALE_TRIGGERS)[number][0]>("order_created");
  const href =
    type === "abandoned_cart"
      ? "/automations/abandoned-carts?section=routines&editor=blank"
      : type === "review_request"
        ? "/automations/post-sale?section=routines&focus=review_request&editor=blank"
        : type === "birthday_collection"
          ? "/automations/post-sale?section=routines&focus=birthday_collection&editor=blank"
          : `/automations/post-sale?section=routines&focus=${trigger}&editor=blank`;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/50 p-4" role="dialog" aria-modal="true" aria-label="Nova automação" onMouseDown={(event) => event.currentTarget === event.target && onClose()}>
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-zinc-200 px-6 py-5">
          <div><h2 className="text-lg font-semibold text-zinc-950">Nova automação em branco</h2><p className="mt-1 text-sm text-zinc-500">Escolha o evento que iniciará o fluxo.</p></div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg text-xl text-zinc-500 hover:bg-zinc-100" aria-label="Fechar">×</button>
        </div>
        <div className="space-y-5 p-6">
          <label className="block text-sm font-semibold text-zinc-800">
            Tipo de automação
            <select value={type} onChange={(event) => setType(event.target.value)} className="mt-2 w-full rounded-xl border border-zinc-300 bg-white px-3 py-3 text-sm font-normal">
              <option value="abandoned_cart">Carrinho abandonado</option>
              <option value="post_sale">Evento de pedido ou entrega</option>
              <option value="review_request">Pedido de avaliação</option>
              <option value="birthday_collection">Coleta de aniversário</option>
            </select>
          </label>
          {type === "post_sale" && (
            <label className="block text-sm font-semibold text-zinc-800">
              Gatilho
              <select value={trigger} onChange={(event) => setTrigger(event.target.value as typeof trigger)} className="mt-2 w-full rounded-xl border border-zinc-300 bg-white px-3 py-3 text-sm font-normal">
                {POST_SALE_TRIGGERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
          )}
          {type === "abandoned_cart" && <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-900">No editor você poderá adicionar até cinco mensagens, cada uma com seu próprio tempo, anexo e cupom.</div>}
        </div>
        <div className="flex justify-end gap-3 border-t border-zinc-200 px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-700">Cancelar</button>
          <Link href={href} className="rounded-lg bg-zinc-950 px-5 py-2.5 text-sm font-semibold text-white">Criar automação</Link>
        </div>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${active ? "bg-zinc-950 text-white shadow-sm" : "text-zinc-600 hover:text-zinc-950"}`}>{children}</button>;
}

function EmptyState({ title, description, onPresets, onBlank }: { title: string; description: string; onPresets: () => void; onBlank: () => void }) {
  return <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-12 text-center"><h2 className="text-lg font-semibold text-zinc-900">{title}</h2><p className="mt-2 text-sm text-zinc-500">{description}</p><div className="mt-5 flex flex-wrap justify-center gap-3"><button type="button" onClick={onPresets} className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700">Ver pré-definidas</button><button type="button" onClick={onBlank} className="rounded-lg bg-zinc-950 px-4 py-2 text-sm font-semibold text-white">Criar em branco</button></div></div>;
}
