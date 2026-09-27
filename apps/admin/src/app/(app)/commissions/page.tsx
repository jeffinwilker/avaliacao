import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { CommissionCalculator } from "./CommissionCalculator";

export default async function CommissionsPage() {
  const admin = createAdminClient();
  const { data: store } = await admin
    .from("stores")
    .select("id, platform, access_token")
    .limit(1)
    .maybeSingle();

  if (!store || store.platform !== "nuvemshop" || !store.access_token) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-4xl rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">
            Comissões
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            Conecte a loja Nuvemshop para carregar os pedidos pagos e calcular a comissão.
          </p>
          <Link
            href="/integration"
            className="mt-5 inline-flex rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white"
          >
            Ir para integração
          </Link>
        </div>
      </div>
    );
  }

  return <CommissionCalculator />;
}
