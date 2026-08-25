"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_BIRTHDAY_COLLECTION_WHATSAPP_TEMPLATE } from "@avaliacoes/shared";

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

export interface BirthdayCollectionSettingsView {
  enabled: boolean;
  delayMinutes: number;
  template: string | null;
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
  birthdaySettings,
  birthdaySettingsAvailable,
  birthdaySettingsUnavailableMessage,
}: {
  storeId: string;
  initialCustomers: CustomerView[];
  available: boolean;
  unavailableMessage: string | null;
  canSyncNuvemshop: boolean;
  birthdaySettings: BirthdayCollectionSettingsView;
  birthdaySettingsAvailable: boolean;
  birthdaySettingsUnavailableMessage: string | null;
}) {
  const router = useRouter();
  const [customers, setCustomers] = useState(initialCustomers);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [identification, setIdentification] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [acceptsMarketing, setAcceptsMarketing] = useState(true);
  const [active, setActive] = useState(true);
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [savingBirthdaySettings, setSavingBirthdaySettings] = useState(false);
  const [birthdayFeedback, setBirthdayFeedback] = useState<Feedback>(null);
  const [birthdayEnabled, setBirthdayEnabled] = useState(
    birthdaySettings.enabled
  );
  const [birthdayDelayHours, setBirthdayDelayHours] = useState(
    String(Math.round(birthdaySettings.delayMinutes / 60))
  );
  const [birthdayTemplate, setBirthdayTemplate] = useState(
    birthdaySettings.template || DEFAULT_BIRTHDAY_COLLECTION_WHATSAPP_TEMPLATE
  );
  const [feedback, setFeedback] = useState<Feedback>(null);

  const editing = editingId
    ? customers.find((customer) => customer.id === editingId) ?? null
    : null;

  const stats = useMemo(() => {
    const withBirthday = customers.filter((customer) => customer.birthDate).length;
    const withPhone = customers.filter((customer) => customer.phone).length;
    const nuvemshop = customers.filter((customer) => customer.source === "nuvemshop").length;
    return { withBirthday, withPhone, nuvemshop };
  }, [customers]);

  const filteredCustomers = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    if (!term) return customers;
    return customers.filter((customer) => {
      return [customer.name, customer.email, customer.phone, customer.identification]
        .filter(Boolean)
        .some((value) =>
          String(value).toLocaleLowerCase("pt-BR").includes(term)
        );
    });
  }, [customers, search]);

  async function syncCustomers() {
    if (syncing) return;
    setSyncing(true);
    setFeedback(null);
    const res = await fetch("/api/nuvemshop/sync-customers", { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setSyncing(false);
    if (!res.ok) {
      setFeedback({
        type: "error",
        text: json.error || "Não foi possível sincronizar os clientes.",
      });
      return;
    }
    setFeedback({
      type: "ok",
      text: `${json.count ?? 0} cliente(s) sincronizados da Nuvemshop.`,
    });
    router.refresh();
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setFeedback(null);
    const payload = {
      storeId,
      name,
      email,
      phone,
      identification,
      birthDate,
      acceptsMarketing,
      active,
      note,
    };
    const res = await fetch(editing ? `/api/customers/${editing.id}` : "/api/customers", {
      method: editing ? "PUT" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setFeedback({
        type: "error",
        text: json.error || "Não foi possível salvar o cliente.",
      });
      return;
    }

    const saved = normalizeCustomer(json.customer);
    setCustomers((current) =>
      editing
        ? current.map((customer) => (customer.id === saved.id ? saved : customer))
        : [saved, ...current]
    );
    resetForm();
    setFeedback({
      type: "ok",
      text: editing ? "Cliente atualizado." : "Cliente cadastrado.",
    });
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
      setFeedback({
        type: "error",
        text: json.error || "Não foi possível remover o cliente.",
      });
      return;
    }
    setCustomers((current) => current.filter((item) => item.id !== customer.id));
    if (editingId === customer.id) resetForm();
    setFeedback({ type: "ok", text: "Cliente removido." });
  }

  async function saveBirthdaySettings(event: React.FormEvent) {
    event.preventDefault();
    if (savingBirthdaySettings) return;
    const delayHours = Number(birthdayDelayHours);
    const delayMinutes = Math.round(delayHours * 60);
    setSavingBirthdaySettings(true);
    setBirthdayFeedback(null);

    const res = await fetch("/api/customers/birthday-settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        storeId,
        enabled: birthdayEnabled,
        delayMinutes,
        template: birthdayTemplate,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setSavingBirthdaySettings(false);
    if (!res.ok) {
      setBirthdayFeedback({
        type: "error",
        text: json.error || "Não foi possível salvar a coleta de aniversário.",
      });
      return;
    }
    setBirthdayFeedback({ type: "ok", text: "Coleta de aniversário salva." });
  }

  function startEdit(customer: CustomerView) {
    setEditingId(customer.id);
    setName(customer.name);
    setEmail(customer.email ?? "");
    setPhone(customer.phone ?? "");
    setIdentification(customer.identification ?? "");
    setBirthDate(customer.birthDate ?? "");
    setAcceptsMarketing(customer.acceptsMarketing !== false);
    setActive(customer.active);
    setNote(customer.note ?? "");
    setFeedback(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetForm() {
    setEditingId(null);
    setName("");
    setEmail("");
    setPhone("");
    setIdentification("");
    setBirthDate("");
    setAcceptsMarketing(true);
    setActive(true);
    setNote("");
  }

  if (!available) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        {unavailableMessage}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="Clientes" value={customers.length} />
        <Metric label="Com aniversário" value={stats.withBirthday} />
        <Metric label="Com telefone" value={stats.withPhone} />
        <Metric label="Da Nuvemshop" value={stats.nuvemshop} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(360px,420px)_1fr]">
        <div className="space-y-6">
          <form
            onSubmit={submit}
            className="rounded-xl border border-gray-200 bg-white p-5"
          >
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">
                {editing ? "Editar cliente" : "Novo cliente"}
              </h2>
              <p className="mt-1 text-xs text-gray-500">
                Cadastre manualmente ou complete dados que a Nuvemshop não trouxe.
              </p>
            </div>
            {editing && (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
            )}
          </div>

          <div className="space-y-4">
            <Input label="Nome" value={name} onChange={setName} placeholder="Nome completo" />
            <Input label="E-mail" value={email} onChange={setEmail} placeholder="cliente@email.com" type="email" />
            <Input label="Telefone/WhatsApp" value={phone} onChange={setPhone} placeholder="(00) 00000-0000" />
            <Input label="CPF/CNPJ" value={identification} onChange={setIdentification} placeholder="Opcional" />
            <Input label="Data de nascimento" value={birthDate} onChange={setBirthDate} type="date" />

            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <input
                type="checkbox"
                checked={acceptsMarketing}
                onChange={(event) => setAcceptsMarketing(event.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              Aceita receber mensagens
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <input
                type="checkbox"
                checked={active}
                onChange={(event) => setActive(event.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              Cliente ativo
            </label>

            <label className="block text-sm font-medium text-gray-700">
              Observação
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Preferências, restrições ou observações internas"
                className="mt-1.5 min-h-20 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-normal outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
              />
            </label>

            <button
              type="submit"
              disabled={saving || name.trim().length < 2 || (!email.trim() && !phone.trim())}
              className="w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving
                ? "Salvando..."
                : editing
                  ? "Salvar alterações"
                  : "Cadastrar cliente"}
            </button>
          </div>

          {feedback && (
            <div
              className={`mt-4 rounded-lg border px-3 py-2.5 text-sm ${
                feedback.type === "ok"
                  ? "border-green-200 bg-green-50 text-green-800"
                  : "border-red-200 bg-red-50 text-red-700"
              }`}
            >
              {feedback.text}
            </div>
          )}
          </form>

          <form
            onSubmit={saveBirthdaySettings}
            className="rounded-xl border border-gray-200 bg-white p-5"
          >
            <div className="mb-5">
              <h2 className="font-semibold">Coleta de aniversário</h2>
              <p className="mt-1 text-xs text-gray-500">
                Mensagem enviada depois da compra para clientes sem data cadastrada.
              </p>
            </div>

            {!birthdaySettingsAvailable && (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
                {birthdaySettingsUnavailableMessage}
              </div>
            )}

            <div className="space-y-4">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <input
                  type="checkbox"
                  checked={birthdayEnabled}
                  disabled={!birthdaySettingsAvailable}
                  onChange={(event) => setBirthdayEnabled(event.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                Pedir aniversário após a compra
              </label>

              <Input
                label="Enviar após quantas horas"
                value={birthdayDelayHours}
                onChange={setBirthdayDelayHours}
                type="number"
                placeholder="24"
              />

              <label className="block text-sm font-medium text-gray-700">
                Mensagem
                <textarea
                  value={birthdayTemplate}
                  onChange={(event) => setBirthdayTemplate(event.target.value)}
                  disabled={!birthdaySettingsAvailable}
                  className="mt-1.5 min-h-40 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-normal outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200 disabled:bg-gray-50"
                />
              </label>

              <button
                type="submit"
                disabled={
                  savingBirthdaySettings ||
                  !birthdaySettingsAvailable ||
                  !Number.isFinite(Number(birthdayDelayHours)) ||
                  Number(birthdayDelayHours) < 0 ||
                  Number(birthdayDelayHours) > 720 ||
                  !birthdayTemplate.trim() ||
                  (birthdayEnabled && !birthdayTemplate.includes("{{link}}"))
                }
                className="w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingBirthdaySettings
                  ? "Salvando..."
                  : "Salvar coleta de aniversário"}
              </button>

              {birthdayFeedback && (
                <div
                  className={`rounded-lg border px-3 py-2.5 text-sm ${
                    birthdayFeedback.type === "ok"
                      ? "border-green-200 bg-green-50 text-green-800"
                      : "border-red-200 bg-red-50 text-red-700"
                  }`}
                >
                  {birthdayFeedback.text}
                </div>
              )}
            </div>
          </form>
        </div>

        <section className="rounded-xl border border-gray-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 p-5">
            <div>
              <h2 className="font-semibold">Base de clientes</h2>
              <p className="mt-1 text-xs text-gray-500">
                {filteredCustomers.length} de {customers.length} cliente(s).
              </p>
            </div>
            <div className="flex w-full flex-wrap gap-2 sm:w-auto">
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar cliente"
                className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200 sm:w-64 sm:flex-none"
              />
              <button
                type="button"
                onClick={syncCustomers}
                disabled={!canSyncNuvemshop || syncing}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {syncing ? "Sincronizando..." : "Sincronizar Nuvemshop"}
              </button>
            </div>
          </div>

          {!canSyncNuvemshop && (
            <div className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900">
              Conecte a loja Nuvemshop em Integração para importar clientes.
            </div>
          )}

          {filteredCustomers.length === 0 ? (
            <div className="p-10 text-center text-sm text-gray-500">
              {customers.length === 0
                ? "Nenhum cliente cadastrado ainda."
                : "Nenhum cliente encontrado nessa busca."}
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {filteredCustomers.map((customer) => (
                <li key={customer.id} className="flex flex-wrap items-center gap-4 p-4">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-zinc-900 text-sm font-semibold text-white">
                    {initials(customer.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-semibold text-gray-900">
                        {customer.name}
                      </span>
                      <SourceBadge source={customer.source} />
                      {!customer.active && (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">
                          Inativo
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
                      {customer.email && <span>{customer.email}</span>}
                      {customer.phone && <span>{customer.phone}</span>}
                      {customer.birthDate ? (
                        <span>Aniversário: {formatDate(customer.birthDate)}</span>
                      ) : (
                        <span className="text-amber-700">Sem aniversário</span>
                      )}
                      {customer.totalSpent != null && (
                        <span>Total: {BRL.format(customer.totalSpent)}</span>
                      )}
                    </div>
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => startEdit(customer)}
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => removeCustomer(customer)}
                      disabled={deletingId === customer.id}
                      className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      {deletingId === customer.id ? "Removendo..." : "Remover"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block text-sm font-medium text-gray-700">
      {label}
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-normal outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
      />
    </label>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="text-xs font-medium text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-gray-950">{value}</div>
    </div>
  );
}

function SourceBadge({ source }: { source: CustomerView["source"] }) {
  const label =
    source === "nuvemshop" ? "Nuvemshop" : source === "order" ? "Pedido" : "Manual";
  return (
    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600">
      {label}
    </span>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return `${parts[0]?.[0] || "C"}${parts[1]?.[0] || ""}`.toUpperCase();
}

function formatDate(value: string): string {
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}`;
}

function normalizeCustomer(value: unknown): CustomerView {
  const customer = value as Record<string, unknown>;
  const source = String(customer.source ?? "manual");
  return {
    id: String(customer.id),
    externalCustomerId:
      typeof customer.external_customer_id === "string"
        ? customer.external_customer_id
        : null,
    name: String(customer.name ?? ""),
    email: typeof customer.email === "string" ? customer.email : null,
    phone: typeof customer.phone === "string" ? customer.phone : null,
    identification:
      typeof customer.identification === "string" ? customer.identification : null,
    birthDate:
      typeof customer.birth_date === "string" ? customer.birth_date : null,
    acceptsMarketing:
      typeof customer.accepts_marketing === "boolean"
        ? customer.accepts_marketing
        : null,
    active: customer.active === true,
    source:
      source === "nuvemshop" || source === "order" || source === "manual"
        ? source
        : "manual",
    totalSpent:
      customer.total_spent != null && Number.isFinite(Number(customer.total_spent))
        ? Number(customer.total_spent)
        : null,
    totalSpentCurrency:
      typeof customer.total_spent_currency === "string"
        ? customer.total_spent_currency
        : null,
    lastOrderId:
      typeof customer.last_order_id === "string" ? customer.last_order_id : null,
    note: typeof customer.note === "string" ? customer.note : null,
    createdAt:
      typeof customer.created_at === "string"
        ? customer.created_at
        : new Date().toISOString(),
    updatedAt:
      typeof customer.updated_at === "string"
        ? customer.updated_at
        : new Date().toISOString(),
  };
}
