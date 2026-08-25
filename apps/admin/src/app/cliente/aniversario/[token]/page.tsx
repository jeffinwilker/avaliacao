import { customerMigrationError } from "@/lib/customers";
import { createAdminClient } from "@/lib/supabase/admin";
import { BirthdayCaptureForm } from "./BirthdayCaptureForm";

export const metadata = {
  title: "Seu aniversário",
  description: "Cadastre sua data para receber mensagens especiais da loja.",
};

export default async function BirthdayCapturePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const admin = createAdminClient();
  const { data: request, error } = await admin
    .from("customer_birthdate_requests")
    .select(
      `id, token, status, expires_at,
       customer:customers (name, birth_date),
       store:stores (name)`
    )
    .eq("token", token)
    .maybeSingle();

  if (error) {
    return (
      <State
        title="Link indisponível"
        message={customerMigrationError(error.message)}
      />
    );
  }

  const customer = pickRelation<{ name: string; birth_date: string | null }>(
    request?.customer
  );
  const store = pickRelation<{ name: string }>(request?.store);

  if (!request || !customer || !store) {
    return (
      <State
        title="Link não encontrado"
        message="Confira se o link recebido está completo ou fale com a loja."
      />
    );
  }

  if (customer.birth_date || request.status === "completed") {
    return (
      <State
        storeName={store.name}
        title="Data já salva"
        message="Obrigado! Seu cadastro já está completo para receber mensagens especiais."
        success
      />
    );
  }

  if (request.status !== "pending") {
    return (
      <State
        storeName={store.name}
        title="Link indisponível"
        message="Este link não está mais ativo. Fale com a loja caso precise atualizar sua data."
      />
    );
  }

  if (request.expires_at && Date.parse(request.expires_at) < Date.now()) {
    await admin
      .from("customer_birthdate_requests")
      .update({ status: "expired" })
      .eq("id", request.id);
    return (
      <State
        storeName={store.name}
        title="Link expirado"
        message="Fale com a loja para receber um novo link de cadastro."
      />
    );
  }

  return (
    <BirthdayCaptureForm
      token={request.token}
      storeName={store.name}
      customerName={customer.name}
    />
  );
}

function State({
  title,
  message,
  storeName,
  success = false,
}: {
  title: string;
  message: string;
  storeName?: string;
  success?: boolean;
}) {
  return (
    <main className="min-h-screen bg-[#f3f2ef] px-4 py-10 sm:py-16">
      <section className="mx-auto max-w-md overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-100 px-6 py-5 text-center text-sm font-semibold text-zinc-900">
          {storeName ?? "Cadastro"}
        </div>
        <div className="px-6 py-12 text-center sm:px-8">
          <div
            className={`mx-auto mb-5 grid h-14 w-14 place-items-center rounded-full ${
              success
                ? "bg-emerald-50 text-emerald-600"
                : "bg-zinc-100 text-zinc-500"
            }`}
          >
            {success ? <CheckIcon /> : <InfoIcon />}
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-950">
            {title}
          </h1>
          <p className="mt-3 text-sm leading-6 text-zinc-600">{message}</p>
        </div>
      </section>
    </main>
  );
}

function pickRelation<T>(value: unknown): T | null {
  if (Array.isArray(value)) return (value[0] as T | undefined) ?? null;
  return (value as T | null) ?? null;
}

function CheckIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m5 12 4 4L19 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 11v5m0-8h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
