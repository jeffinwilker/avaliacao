import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";

const PAGE_SIZE = 50;
const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

interface SearchParams {
  page?: string;
  q?: string;
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));
  const q = (sp.q ?? "").trim();
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const admin = createAdminClient();

  let query = admin
    .from("products")
    .select(
      "id, name, external_product_id, image_url, price, promotional_price, stock",
      { count: "exact" }
    )
    .order("name")
    .range(from, to);

  if (q) query = query.ilike("name", `%${q}%`);

  const { data: products, count } = await query;
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Produtos</h1>
          <p className="text-sm text-gray-500 mt-1">
            {total} produto{total !== 1 ? "s" : ""} sincronizado
            {total !== 1 ? "s" : ""}
            {q && (
              <>
                {" "}
                — filtrando por <strong>&quot;{q}&quot;</strong>
              </>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href="/api/products/export"
            className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-white inline-flex items-center gap-2"
          >
            ⬇ Exportar Excel
          </a>
          <Link
            href="/integration"
            className="bg-brand-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90"
          >
            Sincronizar
          </Link>
        </div>
      </div>

      <form action="/products" className="mb-4">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Buscar produto por nome..."
          className="w-full max-w-md border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
      </form>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {products && products.length > 0 ? (
          <ul className="divide-y divide-gray-100">
            {products.map((p) => {
              const price = p.price != null ? Number(p.price) : null;
              const promo =
                p.promotional_price != null ? Number(p.promotional_price) : null;
              return (
                <li key={p.id} className="px-5 py-3 flex items-center gap-3">
                  {p.image_url ? (
                    <img
                      src={p.image_url}
                      alt=""
                      className="w-12 h-12 rounded object-cover"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded bg-gray-100" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{p.name}</div>
                    <div className="text-xs text-gray-500">
                      ID Nuvemshop: {p.external_product_id}
                    </div>
                  </div>
                  <div className="text-right whitespace-nowrap">
                    {promo && price ? (
                      <>
                        <div className="text-xs text-gray-400 line-through">
                          {BRL.format(price)}
                        </div>
                        <div className="font-semibold text-green-700">
                          {BRL.format(promo)}
                        </div>
                      </>
                    ) : price != null ? (
                      <div className="font-semibold">{BRL.format(price)}</div>
                    ) : (
                      <div className="text-xs text-gray-400">sem preço</div>
                    )}
                  </div>
                  <div className="text-right w-20">
                    {p.stock != null ? (
                      <span
                        className={
                          p.stock > 0
                            ? "text-xs text-gray-700"
                            : "text-xs text-red-700 font-medium"
                        }
                      >
                        {p.stock > 0 ? `${p.stock} em est.` : "sem est."}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="px-5 py-12 text-center text-gray-500 text-sm">
            {q
              ? `Nenhum produto encontrado para "${q}".`
              : "Nenhum produto ainda. Vá em Integração e clique em Sincronizar."}
          </div>
        )}
      </div>

      {totalPages > 1 && <Pagination page={page} totalPages={totalPages} q={q} />}
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  q,
}: {
  page: number;
  totalPages: number;
  q: string;
}) {
  const href = (p: number) => {
    const params = new URLSearchParams();
    if (p > 1) params.set("page", String(p));
    if (q) params.set("q", q);
    const s = params.toString();
    return s ? `/products?${s}` : "/products";
  };

  return (
    <nav className="flex items-center justify-center gap-2 mt-6 text-sm">
      <Link
        href={href(Math.max(1, page - 1))}
        aria-disabled={page <= 1}
        className={`px-3 py-1.5 border border-gray-300 rounded-lg bg-white ${
          page <= 1 ? "opacity-40 pointer-events-none" : "hover:bg-gray-50"
        }`}
      >
        ‹ Anterior
      </Link>
      <span className="px-3 py-1.5 text-gray-600">
        Página <strong>{page}</strong> de {totalPages}
      </span>
      <Link
        href={href(Math.min(totalPages, page + 1))}
        aria-disabled={page >= totalPages}
        className={`px-3 py-1.5 border border-gray-300 rounded-lg bg-white ${
          page >= totalPages ? "opacity-40 pointer-events-none" : "hover:bg-gray-50"
        }`}
      >
        Próxima ›
      </Link>
    </nav>
  );
}
