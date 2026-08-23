import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { Stars } from "@/components/Stars";
import { StatusBadge } from "@/components/StatusBadge";
import { pickOne } from "@/lib/pick-one";
import Link from "next/link";
import { AppIcon, type AppIconName } from "@/components/AppIcon";

async function getStore(): Promise<{ id: string; name: string } | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  // Por enquanto: 1 usuário = 1 loja (relação implícita pelo e-mail). Quando tiver
  // multi-usuários por loja, criar tabela store_members.
  const admin = createAdminClient();
  const { data } = await admin
    .from("stores")
    .select("id, name")
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

export default async function Dashboard() {
  const store = await getStore();

  if (!store) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-6xl rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
          <h1 className="mb-2 text-2xl font-semibold tracking-tight">Bem-vindo!</h1>
          <p className="mb-6 text-zinc-600">
          Você ainda não conectou nenhuma loja. Vamos lá?
          </p>
          <Link
            href="/integration"
            className="inline-flex rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white"
          >
            Conectar minha loja
          </Link>
        </div>
      </div>
    );
  }

  const admin = createAdminClient();

  const [
    { count: total },
    { count: pending },
    { count: approved },
    { data: avg },
    { data: recent },
  ] = await Promise.all([
      admin.from("reviews").select("*", { count: "exact", head: true }).eq("store_id", store.id),
      admin
        .from("reviews")
        .select("*", { count: "exact", head: true })
        .eq("store_id", store.id)
        .eq("status", "pending"),
      admin
        .from("reviews")
        .select("*", { count: "exact", head: true })
        .eq("store_id", store.id)
        .eq("status", "approved"),
      admin.rpc("avg_rating_for_store", { p_store: store.id }).single<{
        avg: number;
      }>(),
      admin
        .from("reviews")
        .select("id, customer_name, rating, comment, status, created_at, products(name)")
        .eq("store_id", store.id)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);
  const approvalRate = total ? Math.round(((approved ?? 0) / total) * 100) : 0;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-[1480px]">
        <div className="mb-7">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">
            Bem-vindo de volta, {store.name}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Acompanhe a reputação da loja e o que precisa da sua atenção.
          </p>
        </div>

        {(pending ?? 0) > 0 && (
          <div className="mb-5 flex flex-col gap-3 rounded-xl border border-zinc-200 bg-[#efeeeb] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 flex-none place-items-center rounded-lg bg-zinc-950 text-white">
                <AppIcon name="clock" size={18} />
              </span>
              <div>
                <div className="text-sm font-medium text-zinc-900">
                  Há {pending} avaliação{pending !== 1 ? "ões" : ""} aguardando moderação
                </div>
                <div className="text-xs text-zinc-500">
                  Revise os novos comentários antes de publicá-los na loja.
                </div>
              </div>
            </div>
            <Link
              href="/reviews?status=pending"
              className="inline-flex items-center justify-center gap-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-800 shadow-sm hover:bg-zinc-50"
            >
              Ver avaliações
              <AppIcon name="chevron-right" size={14} />
            </Link>
          </div>
        )}

        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Card icon="star" label="Total de avaliações" value={total ?? 0} />
          <Card
            icon="clock"
            label="Aguardando moderação"
            value={pending ?? 0}
          />
          <Card
            icon="trend"
            label="Nota média"
            value={avg?.avg ? Number(avg.avg).toFixed(1) : "—"}
          />
          <Card
            icon="check-circle"
            label="Taxa de aprovação"
            value={`${approvalRate}%`}
          />
        </div>

        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900">Últimas avaliações</h2>
              <p className="mt-0.5 text-xs text-zinc-500">Atividade recente dos clientes</p>
            </div>
            <Link
              href="/reviews"
              className="inline-flex items-center gap-1 text-xs font-medium text-zinc-700 hover:text-zinc-950"
            >
              Ver todas
              <AppIcon name="chevron-right" size={14} />
            </Link>
          </div>
          {recent && recent.length > 0 ? (
            <ul className="divide-y divide-zinc-100">
              {recent.map((review) => {
                const product = pickOne<{ name: string }>(review.products);
                return (
                  <li
                    key={review.id}
                    className="flex items-center gap-4 px-5 py-4 transition hover:bg-zinc-50/70"
                  >
                    <div className="grid h-9 w-9 flex-none place-items-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-700">
                      {review.customer_name.trim().slice(0, 1).toUpperCase() || "C"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-zinc-800">
                        {review.customer_name}
                        {product && (
                          <span className="font-normal text-zinc-400"> — {product.name}</span>
                        )}
                      </div>
                      <div className="truncate text-xs text-zinc-500">
                        {review.comment || "Avaliação sem comentário"}
                      </div>
                    </div>
                    <div className="hidden sm:block">
                      <Stars value={review.rating} />
                    </div>
                    <StatusBadge status={review.status} />
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="px-5 py-14 text-center text-sm text-zinc-500">
              Nenhuma avaliação ainda.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Card({
  icon,
  label,
  value,
}: {
  icon: AppIconName;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="mb-6 flex items-start justify-between">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-zinc-950 text-white">
          <AppIcon name={icon} size={17} />
        </span>
        <span className="text-[11px] font-medium text-zinc-400">Ver detalhes</span>
      </div>
      <div className="text-2xl font-semibold tracking-tight text-zinc-950">{value}</div>
      <div className="mt-1 text-xs text-zinc-500">{label}</div>
    </div>
  );
}
