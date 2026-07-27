import { createAdminClient } from "@/lib/supabase/admin";
import { IntegrationView } from "./IntegrationView";

export default async function IntegrationPage() {
  const admin = createAdminClient();
  const { data: store } = await admin
    .from("stores")
    .select("id, name, external_store_id, api_key, domain, created_at")
    .limit(1)
    .maybeSingle();

  const appId = process.env.NUVEMSHOP_CLIENT_ID;
  const installUrl = appId
    ? `https://www.nuvemshop.com.br/apps/${appId}/authorize`
    : null;

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-bold mb-2">Integração com a Nuvemshop</h1>
      <p className="text-gray-600 mb-6">
        Conecte sua loja para sincronizar produtos e disparar avaliações automáticas
        após cada compra.
      </p>
      <IntegrationView store={store} installUrl={installUrl} />
    </div>
  );
}
