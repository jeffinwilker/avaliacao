import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { Stars } from "@/components/Stars";
import { StatusBadge } from "@/components/StatusBadge";
import { pickOne } from "@/lib/pick-one";
import type { ReviewStatus } from "@avaliacoes/shared";

const dtf = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
});

interface SearchParams {
  status?: ReviewStatus;
  rating?: string;
  q?: string;
}

export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const admin = createAdminClient();

  let query = admin
    .from("reviews")
    .select(
      "id, customer_name, customer_email, rating, title, comment, status, created_at, products(name, image_url)"
    )
    .order("created_at", { ascending: false })
    .limit(50);

  if (sp.status) query = query.eq("status", sp.status);
  if (sp.rating) query = query.eq("rating", Number(sp.rating));
  if (sp.q) query = query.ilike("customer_name", `%${sp.q}%`);

  const { data: reviews } = await query;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Avaliações</h1>
      </div>

      <Filters current={sp} />

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mt-4">
        {reviews && reviews.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="text-left px-4 py-3">Cliente</th>
                <th className="text-left px-4 py-3">Produto</th>
                <th className="text-left px-4 py-3">Nota</th>
                <th className="text-left px-4 py-3">Comentário</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Data</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {reviews.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{r.customer_name}</td>
                  <td className="px-4 py-3 text-gray-700">
                    {pickOne<{ name: string }>(r.products)?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Stars value={r.rating} />
                  </td>
                  <td className="px-4 py-3 text-gray-700 max-w-xs truncate">
                    {r.title || r.comment || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {dtf.format(new Date(r.created_at))}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/reviews/${r.id}`}
                      className="text-brand-900 font-medium hover:underline"
                    >
                      Abrir →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="px-5 py-16 text-center text-gray-500">
            Nenhuma avaliação encontrada com esses filtros.
          </div>
        )}
      </div>
    </div>
  );
}

function Filters({ current }: { current: SearchParams }) {
  const statuses: { v: ReviewStatus | "all"; label: string }[] = [
    { v: "all", label: "Todas" },
    { v: "pending", label: "Pendentes" },
    { v: "approved", label: "Aprovadas" },
    { v: "rejected", label: "Reprovadas" },
  ];

  function href(status?: ReviewStatus) {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (current.rating) params.set("rating", current.rating);
    if (current.q) params.set("q", current.q);
    const s = params.toString();
    return s ? `/reviews?${s}` : "/reviews";
  }

  return (
    <div className="flex gap-2 flex-wrap">
      {statuses.map((s) => {
        const active = (current.status ?? "all") === s.v;
        return (
          <Link
            key={s.v}
            href={href(s.v === "all" ? undefined : s.v)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
              active
                ? "bg-brand-900 text-white"
                : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
            }`}
          >
            {s.label}
          </Link>
        );
      })}
    </div>
  );
}
