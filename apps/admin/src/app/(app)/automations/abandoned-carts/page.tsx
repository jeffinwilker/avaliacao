import {
  DEFAULT_ABANDONED_CART_WHATSAPP_TEMPLATE,
  type AbandonedCartMessageStep,
} from "@avaliacoes/shared";
import { parseAbandonedCartSequence } from "@/lib/automations";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  AbandonedCartDashboard,
  type AbandonedCartView,
  type CartMessageView,
  type CartProductView,
} from "../AbandonedCartDashboard";
import { AutomationNav } from "../AutomationNav";
import { SyncOrdersButton } from "../orders/SyncOrdersButton";

type AutomationSection = "orders" | "messages" | "routines";

export default async function AbandonedCartsPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const params = await searchParams;
  const section = normalizeSection(params.section);
  const admin = createAdminClient();
  const { data: store } = await admin
    .from("stores")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (!store) {
    return <div className="p-8 text-gray-600">Conecte uma loja primeiro.</div>;
  }

  const [settingsResult, cartsResult, messagesResult] = await Promise.all([
    admin
      .from("store_settings")
      .select(
        `abandoned_cart_enabled, abandoned_cart_delay_hours,
         abandoned_cart_whatsapp_template, abandoned_cart_sequence`
      )
      .eq("store_id", store.id)
      .maybeSingle(),
    admin
      .from("abandoned_carts")
      .select(
        `id, external_checkout_id, customer_name, customer_email,
         customer_phone, checkout_url, products, products_summary, total,
         currency, status, nuvemshop_created_at, completed_at`
      )
      .eq("store_id", store.id)
      .order("nuvemshop_created_at", { ascending: false })
      .limit(200),
    admin
      .from("automation_messages")
      .select(
        `id, external_reference, routine_step_key, sequence_step, status,
         scheduled_for, sent_at, error_message`
      )
      .eq("store_id", store.id)
      .eq("automation_type", "abandoned_cart")
      .order("sequence_step", { ascending: true }),
  ]);

  if (settingsResult.error || cartsResult.error) {
    return <MigrationNotice />;
  }

  const settings = settingsResult.data;
  const initialSteps: AbandonedCartMessageStep[] = parseAbandonedCartSequence(
    settings?.abandoned_cart_sequence,
    settings?.abandoned_cart_delay_hours ?? 8,
    settings?.abandoned_cart_whatsapp_template ??
      DEFAULT_ABANDONED_CART_WHATSAPP_TEMPLATE
  ).map((step) => ({
    id: step.id,
    delayMinutes: step.delay_minutes,
    messageTemplate: step.message_template,
    enabled: step.enabled,
  }));

  const messagesByCheckout = new Map<string, CartMessageView[]>();
  for (const message of messagesResult.data ?? []) {
    const list = messagesByCheckout.get(message.external_reference) ?? [];
    list.push({
      id: message.id,
      routineStepKey: message.routine_step_key,
      sequenceStep: message.sequence_step,
      status: message.status,
      scheduledFor: message.scheduled_for,
      sentAt: message.sent_at,
      errorMessage: message.error_message,
    });
    messagesByCheckout.set(message.external_reference, list);
  }

  const carts: AbandonedCartView[] = (cartsResult.data ?? []).map((cart) => ({
    id: cart.id,
    externalCheckoutId: cart.external_checkout_id,
    customerName: cart.customer_name,
    customerEmail: cart.customer_email,
    customerPhone: cart.customer_phone,
    checkoutUrl: cart.checkout_url,
    products: normalizeProducts(cart.products),
    productsSummary: cart.products_summary,
    total: toNumber(cart.total),
    currency: cart.currency || "BRL",
    status: cart.status,
    createdAt: cart.nuvemshop_created_at,
    completedAt: cart.completed_at,
    messages: messagesByCheckout.get(cart.external_checkout_id) ?? [],
  }));

  return (
    <div className="space-y-6 p-5 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{sectionTitle(section)}</h1>
          <p className="mt-1 text-sm text-gray-600">
            {sectionDescription(section)}
          </p>
        </div>
        {section === "orders" && <SyncOrdersButton />}
      </div>

      <AutomationNav />

      <AbandonedCartDashboard
        storeId={store.id}
        initialEnabled={settings?.abandoned_cart_enabled ?? false}
        initialSteps={initialSteps}
        carts={carts}
        mode={section === "routines" ? "routine" : section}
      />
    </div>
  );
}

function normalizeSection(value: string | undefined): AutomationSection {
  return value === "messages" || value === "routines" ? value : "orders";
}

function sectionTitle(section: AutomationSection): string {
  if (section === "messages") return "Mensagens";
  if (section === "routines") return "Rotinas";
  return "Pedidos e envios";
}

function sectionDescription(section: AutomationSection): string {
  if (section === "messages") {
    return "Crie e personalize as mensagens usadas para recuperar carrinhos.";
  }
  if (section === "routines") {
    return "Defina quais mensagens serão enviadas e escolha os intervalos.";
  }
  return "Veja os carrinhos, produtos e o status de cada envio.";
}

function normalizeProducts(value: unknown): CartProductView[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const product = item as Record<string, unknown>;
    const image =
      product.image && typeof product.image === "object"
        ? (product.image as Record<string, unknown>)
        : null;
    return [
      {
        name: typeof product.name === "string" ? product.name : "Produto",
        quantity: Math.max(1, Number(product.quantity) || 1),
        price: toNumber(product.price),
        imageUrl: typeof image?.src === "string" ? image.src : null,
      },
    ];
  });
}

function toNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function MigrationNotice() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">Carrinhos abandonados</h1>
      <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-900">
        A estrutura de carrinhos ainda não está disponível no banco. Execute a
        migration <code className="font-mono">0007_abandoned_cart_routines.sql</code>{" "}
        no Supabase e atualize esta página.
      </div>
    </div>
  );
}
