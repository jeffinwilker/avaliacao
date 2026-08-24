import { createAdminClient } from "@/lib/supabase/admin";
import { ReviewInvitationForm } from "./ReviewInvitationForm";

export const metadata = {
  title: "Avalie sua compra",
  description: "Conte como foi sua experiência com o produto.",
};

export default async function ReviewInvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const admin = createAdminClient();

  const { data: invitation } = await admin
    .from("review_requests")
    .select("store_id, order_id, product_id, status")
    .eq("token", token)
    .maybeSingle();

  if (!invitation) {
    return (
      <InvitationState
        title="Convite não encontrado"
        message="Confira se o link recebido está completo ou fale com a loja para solicitar um novo convite."
      />
    );
  }

  const [orderResult, productResult, storeResult, settingsResult] =
    await Promise.all([
      admin
        .from("orders")
        .select("customer_name, customer_email")
        .eq("id", invitation.order_id)
        .maybeSingle(),
      admin
        .from("products")
        .select("external_product_id, name, image_url")
        .eq("id", invitation.product_id)
        .maybeSingle(),
      admin
        .from("stores")
        .select("name, api_key")
        .eq("id", invitation.store_id)
        .maybeSingle(),
      admin
        .from("store_settings")
        .select("brand_color, allow_media, max_media_per_review")
        .eq("store_id", invitation.store_id)
        .maybeSingle(),
    ]);

  const order = orderResult.data;
  const product = productResult.data;
  const store = storeResult.data;
  const settings = settingsResult.data;

  if (!order || !product || !store) {
    return (
      <InvitationState
        title="Não foi possível abrir a avaliação"
        message="Os dados deste pedido não estão mais disponíveis. Entre em contato com a loja para receber ajuda."
      />
    );
  }

  if (invitation.status === "completed") {
    return (
      <InvitationState
        storeName={store.name}
        title="Avaliação já enviada"
        message="Obrigado! Sua opinião sobre este produto já foi recebida."
        success
      />
    );
  }

  if (!["scheduled", "sent"].includes(invitation.status)) {
    return (
      <InvitationState
        storeName={store.name}
        title="Convite indisponível"
        message="Este convite não está mais ativo. Fale com a loja caso precise de ajuda."
      />
    );
  }

  const brandColor = normalizeColor(settings?.brand_color);
  const maxMedia =
    settings?.allow_media === false
      ? 0
      : Math.max(0, Math.min(settings?.max_media_per_review ?? 5, 10));

  return (
    <ReviewInvitationForm
      apiKey={store.api_key}
      token={token}
      storeName={store.name}
      product={{
        externalId: product.external_product_id,
        name: product.name,
        imageUrl: product.image_url,
      }}
      initialName={order.customer_name}
      initialEmail={order.customer_email ?? ""}
      brandColor={brandColor}
      maxMedia={maxMedia}
    />
  );
}

function InvitationState({
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
      <section className="mx-auto max-w-lg overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-100 px-6 py-5 text-center text-sm font-semibold text-zinc-900">
          {storeName ?? "Avaliação da compra"}
        </div>
        <div className="px-7 py-12 text-center">
          <div
            className={`mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full ${
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

function normalizeColor(value: string | null | undefined): string {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value : "#18181b";
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
