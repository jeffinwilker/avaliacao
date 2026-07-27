import { createAdminClient } from "@/lib/supabase/admin";
import { SettingsForm } from "./SettingsForm";
import {
  DEFAULT_EMAIL_TEMPLATE,
  DEFAULT_WHATSAPP_TEMPLATE,
} from "@avaliacoes/shared";

export default async function SettingsPage() {
  const admin = createAdminClient();
  const { data: store } = await admin
    .from("stores")
    .select("id, name")
    .limit(1)
    .maybeSingle();

  if (!store) {
    return (
      <div className="p-8">
        <p className="text-gray-600">
          Conecte sua loja primeiro em{" "}
          <a href="/integration" className="underline">
            Integração
          </a>
          .
        </p>
      </div>
    );
  }

  const { data: settings } = await admin
    .from("store_settings")
    .select("*")
    .eq("store_id", store.id)
    .maybeSingle();

  const initial = settings ?? {
    store_id: store.id,
    auto_publish: false,
    request_delay_days: 7,
    email_enabled: true,
    whatsapp_enabled: false,
    email_subject: "Conta pra gente o que achou da sua compra?",
    email_template: DEFAULT_EMAIL_TEMPLATE,
    whatsapp_template: DEFAULT_WHATSAPP_TEMPLATE,
    brand_color: "#111827",
    allow_media: true,
    max_media_per_review: 5,
  };

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-bold mb-6">Configurações</h1>
      <SettingsForm storeName={store.name} initial={initial} />
    </div>
  );
}
