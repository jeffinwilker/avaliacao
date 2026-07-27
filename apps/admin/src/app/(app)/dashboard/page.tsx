import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { Stars } from "@/components/Stars";
import { StatusBadge } from "@/components/StatusBadge";
import Link from "next/link";

async function getStoreId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  // Por enquanto: 1 usuário = 1 loja (relação implícita pelo e-mail). Quando tiver
  // multi-usuários por loja, criar tabela store_members.
  const admin = createAdminClient();
  const { data } = await admin.from("stores").select("id").limit(1).maybeSingle();
  return data?.id ?? null;
}

export default async function Dashboard() {
  const storeId = await getStoreId();

  if (!storeId) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-2">Bem-vindo!</h1>
        <p className="text-gray-600 mb-6">
          Você ainda não conectou nenhuma loja. Vamos lá?
        </p>
        <Link
          href="/integration"
          className="inline-block bg-brand-900 text-white px-4 py-2 rounded-lg font-medium"
        >
          Conectar minha loja
        </Link>
      </div>
    );
  }

  const admin = createAdminClient();

  const [{ count: total }, { count: pending }, { data: avg }, { data: recent }] =
    await Promise.all([
      admin.from("reviews").select("*", { count: "exact", head: true }).eq("store_id", storeId),
      admin
        .from("reviews")
        .select("*", { count: "exact", head: true })
        .eq("store_id", storeId)
        .eq("status", "pending"),
      admin
        .rpc("avg_rating_for_store", { p_store: storeId })
        .single<{ avg: number }>()
        .then((r) => r)
        .catch(() => ({ data: null })),
      admin
        .from("reviews")
        .select("id, customer_name, rating, comment, status, created_at, products(name)")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Card label="Total de avaliações" value={total ?? 0} />
        <Card label="Aguardando moderação" value={pending ?? 0} highlight={(pending ?? 0) > 0} />
        <Card label="Nota média" value={avg?.avg ? Number(avg.avg).toFixed(1) : "—"} />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="font-semibold">Últimas avaliações</h2>
          <Link href="/reviews" className="text-sm text-brand-900 hover:underline">
            Ver todas →
          </Link>
        </div>
        {recent && recent.length > 0 ? (
          <ul className="divide-y divide-gray-100">
            {recent.map((r) => (
              <li key={r.id} className="px-5 py-3 flex items-center gap-4">
                <Stars value={r.rating} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {r.customer_name}
                    {r.products && (
                      <span className="text-gray-500 font-normal">
                        {" "}
                        — {(r.products as { name: string }).name}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-500 truncate">{r.comment}</div>
                </div>
                <StatusBadge status={r.status} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="px-5 py-12 text-center text-gray-500 text-sm">
            Nenhuma avaliação ainda.
          </div>
        )}
      </div>
    </div>
  );
}

function Card({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string | number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`bg-white rounded-xl border p-5 ${
        highlight ? "border-amber-300 bg-amber-50" : "border-gray-200"
      }`}
    >
      <div className="text-sm text-gray-500 mb-1">{label}</div>
      <div className="text-3xl font-bold">{value}</div>
    </div>
  );
}
