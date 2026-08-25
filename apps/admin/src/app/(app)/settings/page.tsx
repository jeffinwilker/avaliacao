import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { SettingsForm } from "./SettingsForm";
import type { TeamMemberView } from "./TeamUsers";
import {
  DEFAULT_ABANDONED_CART_SEQUENCE,
  DEFAULT_ABANDONED_CART_WHATSAPP_TEMPLATE,
  DEFAULT_EMAIL_TEMPLATE,
  DEFAULT_POST_PURCHASE_WHATSAPP_TEMPLATE,
  DEFAULT_WHATSAPP_TEMPLATE,
} from "@avaliacoes/shared";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
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

  const [{ data: settings }, membersResult] = await Promise.all([
    admin
      .from("store_settings")
      .select("*")
      .eq("store_id", store.id)
      .maybeSingle(),
    admin
      .from("store_members")
      .select("id, user_id, name, email, role, created_at")
      .eq("store_id", store.id)
      .order("created_at", { ascending: true }),
  ]);

  const members: TeamMemberView[] = (membersResult.data ?? []).map((member) => ({
    id: member.id,
    userId: member.user_id,
    name: member.name,
    email: member.email,
    role: member.role === "owner" ? "owner" : "member",
    createdAt: member.created_at,
  }));
  const initial = {
    store_id: store.id,
    auto_publish: false,
    request_delay_days: 1,
    email_enabled: true,
    whatsapp_enabled: false,
    whatsapp_instance: null,
    email_subject: "Conta pra gente o que achou da sua compra?",
    email_template: DEFAULT_EMAIL_TEMPLATE,
    whatsapp_template: DEFAULT_WHATSAPP_TEMPLATE,
    abandoned_cart_enabled: false,
    abandoned_cart_delay_hours: 8,
    abandoned_cart_whatsapp_template: DEFAULT_ABANDONED_CART_WHATSAPP_TEMPLATE,
    abandoned_cart_sequence: DEFAULT_ABANDONED_CART_SEQUENCE,
    post_purchase_enabled: false,
    post_purchase_delay_hours: 24,
    post_purchase_whatsapp_template: DEFAULT_POST_PURCHASE_WHATSAPP_TEMPLATE,
    brand_color: "#111827",
    allow_media: true,
    max_media_per_review: 5,
    ...settings,
  };

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-bold mb-6">Configurações</h1>
      <SettingsForm
        storeName={store.name}
        initial={initial}
        evolutionServerConfigured={Boolean(
          process.env.WHATSAPP_API_URL && process.env.WHATSAPP_API_KEY
        )}
        currentUserId={user?.id ?? ""}
        teamMembers={members}
        teamAvailable={!membersResult.error}
        canManageTeam={Boolean(user)}
      />
    </div>
  );
}
