"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppIcon } from "@/components/AppIcon";

interface CommissionOrder {
  id: string;
  number: string;
  customerName: string;
  createdAt: string;
  paidAt: string | null;
  totalPaid: number;
  shippingCost: number;
  revenueAfterShipping: number;
  currency: string;
}

interface CommissionSummary {
  period: { start: string; end: string };
  ordersCount: number;
  grossRevenue: number;
  shippingCost: number;
  revenueAfterShipping: number;
  currency: string;
  truncated: boolean;
  orders: CommissionOrder[];
}

type PeriodPreset = "current-month" | "last-month" | "last-30-days";

const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const DATE = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export function CommissionCalculator() {
  const initialPeriod = useMemo(() => periodFor("current-month"), []);
  const [start, setStart] = useState(initialPeriod.start);
  const [end, setEnd] = useState(initialPeriod.end);
  const [summary, setSummary] = useState<CommissionSummary | null>(null);
  const [otherCosts, setOtherCosts] = useState("0");
  const [commissionRate, setCommissionRate] = useState("0");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSummary = useCallback(async (periodStart: string, periodEnd: string) => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ start: periodStart, end: periodEnd });
    const response = await fetch(`/api/commissions/summary?${params.toString()}`, {
      cache: "no-store",
    });
    const json = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) {
      setSummary(null);
      setError(json.error || "Não foi possível calcular a comissão.");
      return;
    }
    setSummary(json as CommissionSummary);
  }, []);

  useEffect(() => {
    void loadSummary(initialPeriod.start, initialPeriod.end);
  }, [initialPeriod.end, initialPeriod.start, loadSummary]);

  const calculation = useMemo(() => {
    const manualCosts = positiveNumber(otherCosts);
    const rate = Math.min(100, positiveNumber(commissionRate));
    const afterShipping = summary?.revenueAfterShipping ?? 0;
    const commissionBase = Math.max(0, afterShipping - manualCosts);
    const commission = commissionBase * (rate / 100);
    return {
      manualCosts,
      rate,
      commissionBase,
      commission,
      remaining: Math.max(0, commissionBase - commission),
    };
  }, [commissionRate, otherCosts, summary]);

  function applyPreset(preset: PeriodPreset) {
    const period = periodFor(preset);
    setStart(period.start);
    setEnd(period.end);
    void loadSummary(period.start, period.end);
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-[1480px]">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">
              Cálculo de comissão
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-zinc-500">
              Calcule a comissão somente sobre os pedidos pagos, descontando o custo
              real do frete da loja e outros custos informados por você.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <PresetButton onClick={() => applyPreset("current-month")}>Este mês</PresetButton>
            <PresetButton onClick={() => applyPreset("last-month")}>Mês passado</PresetButton>
            <PresetButton onClick={() => applyPreset("last-30-days")}>Últimos 30 dias</PresetButton>
          </div>
        </div>

        <section className="mb-5 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
            <DateField label="Data inicial" value={start} onChange={setStart} />
            <DateField label="Data final" value={end} onChange={setEnd} />
            <button
              type="button"
              onClick={() => void loadSummary(start, end)}
              disabled={loading}
              className="h-[42px] rounded-lg bg-zinc-950 px-5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-wait disabled:opacity-60"
            >
              {loading ? "Buscando pedidos..." : "Atualizar valores"}
            </button>
          </div>
          <p className="mt-3 text-xs text-zinc-500">
            Entram no cálculo apenas pedidos criados no período, com pagamento confirmado e não cancelados.
          </p>
        </section>

        {error && (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            label="Receita recebida"
            value={summary ? BRL.format(summary.grossRevenue) : "—"}
            detail={`${summary?.ordersCount ?? 0} pedido(s) pago(s)`}
          />
          <SummaryCard
            label="Custo do frete"
            value={summary ? BRL.format(summary.shippingCost) : "—"}
            detail="Valor suportado pela loja"
            tone="amber"
          />
          <SummaryCard
            label="Após retirar o frete"
            value={summary ? BRL.format(summary.revenueAfterShipping) : "—"}
            detail="Antes dos outros custos"
            tone="blue"
          />
          <SummaryCard
            label="Comissão a pagar"
            value={summary ? BRL.format(calculation.commission) : "—"}
            detail={`${formatPercent(calculation.rate)} da base final`}
            tone="green"
          />
        </div>

        <div className="mb-5 grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-zinc-950 text-white">
                <AppIcon name="calculator" size={19} />
              </span>
              <div>
                <h2 className="text-base font-semibold text-zinc-950">Ajustes do cálculo</h2>
                <p className="text-xs text-zinc-500">Informe os custos extras e a porcentagem.</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <MoneyInput
                label="Outros custos"
                value={otherCosts}
                onChange={setOtherCosts}
                help="Embalagem, anúncios ou qualquer outro custo do período."
              />
              <PercentInput
                label="Percentual da comissão"
                value={commissionRate}
                onChange={setCommissionRate}
                help="Percentual aplicado depois de todos os descontos."
              />
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <div className="border-b border-zinc-100 px-5 py-4">
              <h2 className="text-base font-semibold text-zinc-950">Resumo do cálculo</h2>
              <p className="mt-0.5 text-xs text-zinc-500">Veja exatamente como chegamos ao valor.</p>
            </div>
            <div className="space-y-3 p-5 text-sm">
              <CalculationRow label="Receita recebida" value={summary?.grossRevenue ?? 0} />
              <CalculationRow label="(−) Custo do frete" value={-(summary?.shippingCost ?? 0)} muted />
              <CalculationRow label="(−) Outros custos" value={-calculation.manualCosts} muted />
              <div className="border-t border-dashed border-zinc-200 pt-3">
                <CalculationRow label="Base da comissão" value={calculation.commissionBase} strong />
              </div>
              <CalculationRow
                label={`(×) Comissão de ${formatPercent(calculation.rate)}`}
                value={calculation.commission}
                accent
              />
              <div className="border-t border-zinc-200 pt-3">
                <CalculationRow label="Saldo após a comissão" value={calculation.remaining} strong />
              </div>
            </div>
          </section>
        </div>

        <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="flex flex-col gap-1 border-b border-zinc-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-zinc-950">Pedidos considerados</h2>
              <p className="mt-0.5 text-xs text-zinc-500">Conferência dos valores usados no cálculo.</p>
            </div>
            <span className="text-xs font-medium text-zinc-500">
              {summary?.ordersCount ?? 0} pedido(s)
            </span>
          </div>

          {summary?.truncated && (
            <div className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-xs text-amber-800">
              O período ultrapassou 5.000 pedidos. Reduza as datas para garantir o cálculo completo.
            </div>
          )}

          {loading && !summary ? (
            <div className="px-5 py-14 text-center text-sm text-zinc-500">Carregando pedidos...</div>
          ) : summary?.orders.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-zinc-50 text-[11px] uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Pedido</th>
                    <th className="px-5 py-3 font-semibold">Cliente</th>
                    <th className="px-5 py-3 font-semibold">Data</th>
                    <th className="px-5 py-3 text-right font-semibold">Receita</th>
                    <th className="px-5 py-3 text-right font-semibold">Frete</th>
                    <th className="px-5 py-3 text-right font-semibold">Base</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {summary.orders.map((order) => (
                    <tr key={order.id} className="text-zinc-700 hover:bg-zinc-50/70">
                      <td className="whitespace-nowrap px-5 py-3.5 font-semibold text-zinc-950">#{order.number}</td>
                      <td className="max-w-64 truncate px-5 py-3.5">{order.customerName}</td>
                      <td className="whitespace-nowrap px-5 py-3.5 text-zinc-500">{formatDate(order.createdAt)}</td>
                      <td className="whitespace-nowrap px-5 py-3.5 text-right">{BRL.format(order.totalPaid)}</td>
                      <td className="whitespace-nowrap px-5 py-3.5 text-right text-amber-700">{BRL.format(order.shippingCost)}</td>
                      <td className="whitespace-nowrap px-5 py-3.5 text-right font-medium text-zinc-950">{BRL.format(order.revenueAfterShipping)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-5 py-14 text-center text-sm text-zinc-500">
              Nenhum pedido pago foi encontrado no período escolhido.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function PresetButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 shadow-sm transition hover:border-zinc-300 hover:text-zinc-950"
    >
      {children}
    </button>
  );
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-zinc-700">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-[42px] w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
      />
    </label>
  );
}

function MoneyInput({ label, value, onChange, help }: { label: string; value: string; onChange: (value: string) => void; help: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-zinc-700">{label}</span>
      <div className="flex h-[44px] overflow-hidden rounded-lg border border-zinc-300 bg-white focus-within:border-zinc-500 focus-within:ring-2 focus-within:ring-zinc-200">
        <span className="grid place-items-center border-r border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-500">R$</span>
        <input
          type="number"
          min="0"
          step="0.01"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="min-w-0 flex-1 px-3 text-sm text-zinc-900 outline-none"
        />
      </div>
      <span className="mt-1.5 block text-[11px] leading-4 text-zinc-500">{help}</span>
    </label>
  );
}

function PercentInput({ label, value, onChange, help }: { label: string; value: string; onChange: (value: string) => void; help: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-zinc-700">{label}</span>
      <div className="flex h-[44px] overflow-hidden rounded-lg border border-zinc-300 bg-white focus-within:border-zinc-500 focus-within:ring-2 focus-within:ring-zinc-200">
        <input
          type="number"
          min="0"
          max="100"
          step="0.01"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="min-w-0 flex-1 px-3 text-sm text-zinc-900 outline-none"
        />
        <span className="grid place-items-center border-l border-zinc-200 bg-zinc-50 px-4 text-sm text-zinc-500">%</span>
      </div>
      <span className="mt-1.5 block text-[11px] leading-4 text-zinc-500">{help}</span>
    </label>
  );
}

function SummaryCard({ label, value, detail, tone = "neutral" }: { label: string; value: string; detail: string; tone?: "neutral" | "amber" | "blue" | "green" }) {
  const tones = {
    neutral: "border-zinc-200 bg-white",
    amber: "border-amber-200 bg-amber-50/70",
    blue: "border-blue-200 bg-blue-50/70",
    green: "border-emerald-200 bg-emerald-50/70",
  };
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${tones[tone]}`}>
      <div className="text-xs font-medium text-zinc-600">{label}</div>
      <div className="mt-3 text-2xl font-semibold tracking-tight text-zinc-950">{value}</div>
      <div className="mt-1 text-[11px] text-zinc-500">{detail}</div>
    </div>
  );
}

function CalculationRow({ label, value, muted = false, strong = false, accent = false }: { label: string; value: number; muted?: boolean; strong?: boolean; accent?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-4 ${strong ? "font-semibold" : ""}`}>
      <span className={muted ? "text-zinc-500" : accent ? "text-emerald-700" : "text-zinc-700"}>{label}</span>
      <span className={accent ? "font-semibold text-emerald-700" : "text-zinc-950"}>{BRL.format(value)}</span>
    </div>
  );
}

function periodFor(preset: PeriodPreset) {
  const today = new Date();
  if (preset === "last-30-days") {
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29);
    return { start: inputDate(start), end: inputDate(today) };
  }
  if (preset === "last-month") {
    const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const end = new Date(today.getFullYear(), today.getMonth(), 0);
    return { start: inputDate(start), end: inputDate(end) };
  }
  return {
    start: inputDate(new Date(today.getFullYear(), today.getMonth(), 1)),
    end: inputDate(today),
  };
}

function inputDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function positiveNumber(value: string): number {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? DATE.format(date) : "—";
}

function formatPercent(value: number): string {
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value)}%`;
}
