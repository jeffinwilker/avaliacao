"use client";

import { useState, type FormEvent } from "react";

export function BirthdayCaptureForm({
  token,
  storeName,
  customerName,
}: {
  token: string;
  storeName: string;
  customerName: string;
}) {
  const [birthDate, setBirthDate] = useState("");
  const [acceptsMarketing, setAcceptsMarketing] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);

    const response = await fetch(`/api/customer-birthdate/${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ birthDate, acceptsMarketing }),
    });
    const json = (await response.json().catch(() => ({}))) as { error?: string };
    setSubmitting(false);

    if (!response.ok) {
      setError(json.error || "Não foi possível salvar sua data.");
      return;
    }
    setSuccess(true);
  }

  if (success) {
    return (
      <Shell storeName={storeName}>
        <div className="px-6 py-12 text-center sm:px-8">
          <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-full bg-emerald-50 text-emerald-600">
            <CheckIcon />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-950">
            Data salva
          </h1>
          <p className="mt-3 text-sm leading-6 text-zinc-600">
            Obrigado! Quando chegar seu aniversário, a loja poderá preparar uma
            mensagem especial para você.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell storeName={storeName}>
      <form onSubmit={submit} className="px-6 py-8 sm:px-8">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-zinc-950 text-white">
            <GiftIcon />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-950">
            Seu aniversário
          </h1>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            {firstName(customerName)}, cadastre sua data para receber um carinho
            da loja no seu mês especial.
          </p>
        </div>

        <label className="block text-sm font-semibold text-zinc-800">
          Data de nascimento
          <input
            type="date"
            value={birthDate}
            onChange={(event) => setBirthDate(event.target.value)}
            required
            className="mt-2 h-12 w-full rounded-xl border border-zinc-300 bg-white px-4 text-base text-zinc-950 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
          />
        </label>

        <label className="mt-5 flex items-start gap-3 text-sm leading-5 text-zinc-600">
          <input
            type="checkbox"
            checked={acceptsMarketing}
            onChange={(event) => setAcceptsMarketing(event.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-zinc-300"
          />
          Aceito receber mensagens da loja pelo WhatsApp.
        </label>

        {error && (
          <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || !birthDate}
          className="mt-7 flex min-h-[48px] w-full items-center justify-center rounded-xl bg-zinc-950 px-5 py-3 text-sm font-bold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Salvando..." : "Salvar minha data"}
        </button>
      </form>
    </Shell>
  );
}

function Shell({
  storeName,
  children,
}: {
  storeName: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-[#f3f2ef] px-4 py-10 sm:py-16">
      <section className="mx-auto max-w-md overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-100 px-6 py-5 text-center text-sm font-semibold text-zinc-900">
          {storeName}
        </div>
        {children}
      </section>
    </main>
  );
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || "Cliente";
}

function GiftIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="9" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 9v12M3 13h18M7.5 9C5.57 9 4 7.88 4 6.5S5.12 4 6.5 4C8.43 4 12 9 12 9M16.5 9C18.43 9 20 7.88 20 6.5S18.88 4 17.5 4C15.57 4 12 9 12 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m5 12 4 4L19 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
