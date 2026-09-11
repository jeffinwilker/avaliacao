import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { SyncButton } from "./SyncButton";
import { DuplicateButton } from "./DuplicateButton";
import { NativeKitImportButton } from "./NativeKitImportButton";

const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export default async function KitsPage() {
  const admin = createAdminClient();
  const { data: kits } = await admin
    .from("kits_with_items")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Kits de produtos</h1>
          <p className="text-sm text-gray-500 mt-1">
            {kits?.length ?? 0} kit{(kits?.length ?? 0) !== 1 ? "s" : ""} cadastrado
            {(kits?.length ?? 0) !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/kits/new"
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Criar produto-kit antigo
          </Link>
          <NativeKitImportButton />
        </div>
      </div>

      <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950">
        <span className="font-semibold">Recomendado:</span> crie o kit no painel da
        Nuvemshop e depois use <span className="font-semibold">Importar kit nativo</span>.
        Assim estoque, unidades e desconto continuam controlados pela própria
        Nuvemshop.
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {kits && kits.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="text-left px-4 py-3">Kit</th>
                <th className="text-left px-4 py-3">Itens</th>
                <th className="text-left px-4 py-3">Preço original</th>
                <th className="text-left px-4 py-3">Preço final</th>
                <th className="text-left px-4 py-3">Desconto</th>
                <th className="text-left px-4 py-3">Nuvemshop</th>
                <th className="text-left px-4 py-3">Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {kits.map((k) => {
                const isNative = k.source === "nuvemshop_native";
                const original = Number(k.original_price ?? 0);
                const final = Number(k.final_price ?? 0);
                const discountPct =
                  original > 0
                    ? Math.round(((original - final) / original) * 100)
                    : 0;
                return (
                  <tr key={k.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {k.image_url ? (
                          <img
                            src={k.image_url}
                            alt=""
                            className="w-8 h-8 rounded object-cover"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded bg-gray-100" />
                        )}
                        <div>
                          <div className="font-medium">{k.name}</div>
                          <span
                            className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              isNative
                                ? "bg-blue-100 text-blue-800"
                                : "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {isNative ? "Kit nativo" : "Produto-kit antigo"}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      <div>
                        {Number(k.total_units ?? 0)}{" "}
                        {Number(k.total_units ?? 0) === 1 ? "unidade" : "unidades"}
                      </div>
                      {Number(k.items_count ?? 0) > 1 && (
                        <div className="text-xs text-gray-500">
                          em {k.items_count} produtos
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 line-through">
                      {original > 0 ? BRL.format(original) : "—"}
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {final > 0 ? BRL.format(final) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {discountPct > 0 ? (
                        <span className="text-green-700 font-medium">
                          −{discountPct}%
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isNative ? (
                        <div className="flex items-center gap-2">
                          {k.nuvemshop_url && (
                            <a
                              href={k.nuvemshop_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-brand-900 hover:underline"
                            >
                              Ver na loja ↗
                            </a>
                          )}
                          <NativeKitImportButton
                            initialValue={String(k.nuvemshop_product_id ?? "")}
                            compact
                          />
                        </div>
                      ) : k.sync_error ? (
                        <div className="flex items-center gap-2">
                          <span
                            className="text-red-700 text-xs max-w-[140px] truncate"
                            title={k.sync_error}
                          >
                            Erro: {k.sync_error}
                          </span>
                          <SyncButton kitId={k.id} label="Tentar de novo" />
                        </div>
                      ) : k.nuvemshop_product_id ? (
                        <div className="flex items-center gap-2">
                          {k.nuvemshop_url ? (
                            <a
                              href={k.nuvemshop_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-brand-900 hover:underline text-xs"
                            >
                              Ver na loja ↗
                            </a>
                          ) : (
                            <span className="text-green-700 text-xs">
                              Sincronizado
                            </span>
                          )}
                          <SyncButton kitId={k.id} label="↻" />
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-amber-700 text-xs">
                            Não sincronizado
                          </span>
                          <SyncButton kitId={k.id} />
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {k.active ? (
                        <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">
                          Ativo
                        </span>
                      ) : (
                        <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">
                          Inativo
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {isNative ? (
                        <span className="text-xs text-gray-500">
                          Editado na Nuvemshop
                        </span>
                      ) : (
                        <div className="flex items-center gap-3 justify-end text-sm">
                          <DuplicateButton kitId={k.id} />
                          <Link
                            href={`/kits/${k.id}`}
                            className="text-brand-900 font-medium hover:underline"
                          >
                            Editar →
                          </Link>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="px-5 py-16 text-center text-gray-500 text-sm">
            <div className="text-4xl mb-3">🎁</div>
            <div className="font-medium mb-1">Nenhum kit cadastrado ainda</div>
            <p className="mb-4">
              Crie o kit na Nuvemshop e importe o link para reconhecer suas
              unidades.
            </p>
            <div className="flex justify-center">
              <NativeKitImportButton />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
