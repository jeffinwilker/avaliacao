"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CustomerImportModal } from "./CustomerImportModal";

export interface CustomerView {
  id: string;
  externalCustomerId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  identification: string | null;
  birthDate: string | null;
  acceptsMarketing: boolean | null;
  active: boolean;
  source: "manual" | "nuvemshop" | "order";
  totalSpent: number | null;
  totalSpentCurrency: string | null;
  lastOrderId: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

type Feedback = { type: "ok" | "error"; text: string } | null;

const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function CustomersManager({
  storeId,
  initialCustomers,
  available,
  unavailableMessage,
  canSyncNuvemshop,
}: {
  storeId: string;
  initialCustomers: CustomerView[];
  available: boolean;
  unavailableMessage: string | null;
  canSyncNuvemshop: boolean;
}) {
  const router = useRouter();
  const [customers, setCustomers] = useState(initialCustomers);
  const [search, setSearch] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [formCustomer, setFormCustomer] = useState<CustomerView | "new" | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  useEffect(() => setCustomers(initialCustomers), [initialCustomers]);

  const stats = useMemo(() => ({
    withBirthday: customers.filter((customer) => customer.birthDate).length,
    withPhone: customers.filter((customer) => customer.phone).length,
    nuvemshop: customers.filter((customer) => customer.source === "nuvemshop").length,
  }), [customers]);

  const filteredCustomers = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    if (!term) return customers;
    return customers.filter((customer) =>
      [customer.name, customer.email, customer.phone, customer.identification]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("pt-BR").includes(term))
    );
  }, [customers, search]);

  async function syncCustomers() {
    if (syncing) return;
    setSyncing(true);
    setFeedback(null);
    const res = await fetch("/api/nuvemshop/sync-customers", { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setSyncing(false);
    if (!res.ok) {
      setFeedback({ type: "error", text: json.error || "Não foi possível sincronizar os clientes." });
      return;
    }
    setFeedback({ type: "ok", text: `${json.count ?? 0} cliente(s) sincronizados da Nuvemshop.` });
    router.refresh();
  }

  async function removeCustomer(customer: CustomerView) {
    if (!window.confirm(`Remover ${customer.name} da base de clientes?`)) return;
    setDeletingId(customer.id);
    setFeedback(null);
    const res = await fetch(`/api/customers/${customer.id}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ storeId }),
    });
    const json = await res.json().catch(() => ({}));
    setDeletingId(null);
    if (!res.ok) {
      setFeedback({ type: "error", text: json.error || "Não foi possível remover o cliente." });
      return;
    }
    setCustomers((current) => current.filter((item) => item.id !== customer.id));
    setFeedback({ type: "ok", text: "Cliente removido." });
  }

  if (!available) {
    return <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">{unavailableMessage}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="Clientes" value={customers.length} />
        <Metric label="Com aniversário" value={stats.withBirthday} />
        <Metric label="Com telefone" value={stats.withPhone} />
        <Metric label="Da Nuvemshop" value={stats.nuvemshop} />
      </div>

      {feedback && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${feedback.type === "ok" ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-700"}`}>
          {feedback.text}
        </div>
      )}

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-200 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold">Base de clientes</h2>
              <p className="mt-1 text-xs text-gray-500">{filteredCustomers.length} de {customers.length} cliente(s).</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setImportOpen(true)} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                Importar arquivo
              </button>
              <button type="button" onClick={syncCustomers} disabled={!canSyncNuvemshop || syncing} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50">
                {syncing ? "Sincronizando..." : "Sincronizar Nuvemshop"}
              </button>
              <button type="button" onClick={() => setFormCustomer("new")} className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800">
                + Novo cliente
              </button>
            </div>
          </div>
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome, e-mail, telefone ou CPF/CNPJ" className="mt-4 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200" />
        </div>

        {!canSyncNuvemshop && <div className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900">Conecte a loja Nuvemshop em Integração para sincronizar clientes.</div>}

        {filteredCustomers.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-500">{customers.length === 0 ? "Nenhum cliente cadastrado ainda." : "Nenhum cliente encontrado nessa busca."}</div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {filteredCustomers.map((customer) => (
              <li key={customer.id} className="flex flex-wrap items-center gap-4 p-4">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-zinc-900 text-sm font-semibold text-white">{initials(customer.name)}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-semibold text-gray-900">{customer.name}</span>
                    <SourceBadge source={customer.source} />
                    {!customer.active && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">Inativo</span>}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
                    {customer.email && <span>{customer.email}</span>}
                    {customer.phone && <span>{customer.phone}</span>}
                    {customer.birthDate ? <span>Aniversário: {formatDate(customer.birthDate)}</span> : <span className="text-amber-700">Sem aniversário</span>}
                    {customer.totalSpent != null && <span>Total: {BRL.format(customer.totalSpent)}</span>}
                  </div>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <button type="button" onClick={() => setFormCustomer(customer)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">Editar</button>
                  <button type="button" onClick={() => removeCustomer(customer)} disabled={deletingId === customer.id} className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50">{deletingId === customer.id ? "Removendo..." : "Remover"}</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {formCustomer && (
        <CustomerFormModal
          key={formCustomer === "new" ? "new" : formCustomer.id}
          storeId={storeId}
          customer={formCustomer === "new" ? null : formCustomer}
          onClose={() => setFormCustomer(null)}
          onSaved={(saved, editing) => {
            setCustomers((current) => editing ? current.map((customer) => customer.id === saved.id ? saved : customer) : [saved, ...current]);
            setFormCustomer(null);
            setFeedback({ type: "ok", text: editing ? "Cliente atualizado." : "Cliente cadastrado." });
          }}
        />
      )}

      {importOpen && (
        <CustomerImportModal
          storeId={storeId}
          onClose={() => setImportOpen(false)}
          onImported={(inserted, updated) => {
            setImportOpen(false);
            setFeedback({ type: "ok", text: `Importação concluída: ${inserted} novo(s) e ${updated} atualizado(s).` });
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function CustomerFormModal({ storeId, customer, onClose, onSaved }: { storeId: string; customer: CustomerView | null; onClose: () => void; onSaved: (customer: CustomerView, editing: boolean) => void }) {
  const [name, setName] = useState(customer?.name ?? "");
  const [email, setEmail] = useState(customer?.email ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [identification, setIdentification] = useState(customer?.identification ?? "");
  const [birthDate, setBirthDate] = useState(customer?.birthDate ?? "");
  const [acceptsMarketing, setAcceptsMarketing] = useState(customer?.acceptsMarketing !== false);
  const [active, setActive] = useState(customer?.active ?? true);
  const [note, setNote] = useState(customer?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    const res = await fetch(customer ? `/api/customers/${customer.id}` : "/api/customers", {
      method: customer ? "PUT" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ storeId, name, email, phone, identification, birthDate, acceptsMarketing, active, note }),
    });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(json.error || "Não foi possível salvar o cliente.");
      return;
    }
    onSaved(normalizeCustomer(json.customer), Boolean(customer));
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/50 p-4" role="dialog" aria-modal="true" aria-label={customer ? "Editar cliente" : "Novo cliente"} onMouseDown={(event) => { if (event.currentTarget === event.target && !saving) onClose(); }}>
      <form onSubmit={submit} className="max-h-[calc(100vh-32px)] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-6 py-5">
          <div><h2 className="text-lg font-semibold text-gray-950">{customer ? "Editar cliente" : "Novo cliente"}</h2><p className="mt-1 text-sm text-gray-500">Cadastre manualmente ou complete os dados trazidos pela Nuvemshop.</p></div>
          <button type="button" onClick={onClose} disabled={saving} className="grid h-9 w-9 place-items-center rounded-lg text-xl text-gray-500 hover:bg-gray-100 disabled:opacity-50" aria-label="Fechar">×</button>
        </div>
        <div className="grid gap-4 p-6 sm:grid-cols-2">
          <Input label="Nome" value={name} onChange={setName} placeholder="Nome completo" />
          <Input label="E-mail" value={email} onChange={setEmail} placeholder="cliente@email.com" type="email" />
          <Input label="Telefone/WhatsApp" value={phone} onChange={setPhone} placeholder="(00) 00000-0000" />
          <Input label="CPF/CNPJ" value={identification} onChange={setIdentification} placeholder="Opcional" />
          <Input label="Data de nascimento" value={birthDate} onChange={setBirthDate} type="date" />
          <div className="space-y-3 self-end pb-1">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700"><input type="checkbox" checked={acceptsMarketing} onChange={(event) => setAcceptsMarketing(event.target.checked)} className="h-4 w-4 rounded border-gray-300" />Aceita receber mensagens</label>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} className="h-4 w-4 rounded border-gray-300" />Cliente ativo</label>
          </div>
          <label className="block text-sm font-medium text-gray-700 sm:col-span-2">Observação<textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Preferências, restrições ou observações internas" className="mt-1.5 min-h-24 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-normal outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200" /></label>
          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 sm:col-span-2">{error}</div>}
        </div>
        <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">Cancelar</button>
          <button type="submit" disabled={saving || name.trim().length < 2 || (!email.trim() && !phone.trim())} className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Salvando..." : customer ? "Salvar alterações" : "Cadastrar cliente"}</button>
        </div>
      </form>
    </div>
  );
}

function Input({ label, value, onChange, type = "text", placeholder }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string }) {
  return <label className="block text-sm font-medium text-gray-700">{label}<input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-normal outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200" /></label>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl border border-gray-200 bg-white p-4"><div className="text-xs font-medium text-gray-500">{label}</div><div className="mt-1 text-2xl font-bold text-gray-950">{value}</div></div>;
}

function SourceBadge({ source }: { source: CustomerView["source"] }) {
  const label = source === "nuvemshop" ? "Nuvemshop" : source === "order" ? "Pedido" : "Manual";
  return <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600">{label}</span>;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return `${parts[0]?.[0] || "C"}${parts[1]?.[0] || ""}`.toUpperCase();
}

function formatDate(value: string): string {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}` : value;
}

function normalizeCustomer(value: unknown): CustomerView {
  const customer = value as Record<string, unknown>;
  const source = String(customer.source ?? "manual");
  return {
    id: String(customer.id), externalCustomerId: typeof customer.external_customer_id === "string" ? customer.external_customer_id : null,
    name: String(customer.name ?? ""), email: typeof customer.email === "string" ? customer.email : null,
    phone: typeof customer.phone === "string" ? customer.phone : null, identification: typeof customer.identification === "string" ? customer.identification : null,
    birthDate: typeof customer.birth_date === "string" ? customer.birth_date : null,
    acceptsMarketing: typeof customer.accepts_marketing === "boolean" ? customer.accepts_marketing : null,
    active: customer.active === true, source: source === "nuvemshop" || source === "order" || source === "manual" ? source : "manual",
    totalSpent: customer.total_spent != null && Number.isFinite(Number(customer.total_spent)) ? Number(customer.total_spent) : null,
    totalSpentCurrency: typeof customer.total_spent_currency === "string" ? customer.total_spent_currency : null,
    lastOrderId: typeof customer.last_order_id === "string" ? customer.last_order_id : null,
    note: typeof customer.note === "string" ? customer.note : null,
    createdAt: typeof customer.created_at === "string" ? customer.created_at : new Date().toISOString(),
    updatedAt: typeof customer.updated_at === "string" ? customer.updated_at : new Date().toISOString(),
  };
}
