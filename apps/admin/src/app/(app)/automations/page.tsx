import {
  DEFAULT_ABANDONED_CART_WHATSAPP_TEMPLATE,
  type AbandonedCartMessageStep,
} from "@avaliacoes/shared";
import { parseAbandonedCartSequence } from "@/lib/automations";
import { createAdminClient } from "@/lib/supabase/admin";
import { AbandonedCartDashboard } from "./AbandonedCartDashboard";
import { AutomationNav } from "./AutomationNav";

export default async function AutomationsPage() {
  const admin = createAdminClient();
  const { data: store } = await admin
    .from("stores")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (!store) {
    return <div className="p-8 text-gray-600">Conecte uma loja primeiro.</div>;
  }

  const { data: settings, error } = await admin
    .from("store_settings")
    .select(
      `abandoned_cart_enabled, abandoned_cart_delay_hours,
       abandoned_cart_whatsapp_template, abandoned_cart_sequence`
    )
    .eq("store_id", store.id)
    .maybeSingle();

  if (error) {
    return <MigrationNotice />;
  }

  const initialSteps: AbandonedCartMessageStep[] = parseAbandonedCartSequence(
    settings?.abandoned_cart_sequence,
    settings?.abandoned_cart_delay_hours ?? 8,
    settings?.abandoned_cart_whatsapp_template ??
      DEFAULT_ABANDONED_CART_WHATSAPP_TEMPLATE
  ).map((step) => ({
    id: step.id,
    delayHours: step.delay_hours,
    messageTemplate: step.message_template,
    enabled: step.enabled,
  }));

  return (
    <div className="p-5 md:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Automações de WhatsApp</h1>
        <p className="text-sm text-gray-600 mt-1">
          Configure os horários, descontos e textos das suas rotinas.
        </p>
      </div>

      <AutomationNav />

      <AbandonedCartDashboard
        storeId={store.id}
        initialEnabled={settings?.abandoned_cart_enabled ?? false}
        initialSteps={initialSteps}
        carts={[]}
        mode="routine"
      />
    </div>
  );
}

function MigrationNotice() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">Automações de WhatsApp</h1>
      <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-900">
        A estrutura de carrinhos ainda não está disponível no banco. Execute a
        migration <code className="font-mono">0007_abandoned_cart_routines.sql</code>
        {" "}no Supabase e atualize esta página.
      </div>
    </div>
  );
}
