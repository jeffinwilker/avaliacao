import { createAdminClient } from "@/lib/supabase/admin";
import { ImportClient } from "./ImportClient";

export default async function ImportPage() {
  const admin = createAdminClient();
  const { data: products } = await admin
    .from("products")
    .select("id, name, external_product_id")
    .order("name")
    .limit(5000);

  return (
    <div className="p-8">
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold mb-2">Importar avaliações</h1>
          <p className="text-gray-600 max-w-2xl">
            Suba um arquivo CSV ou Excel (.xlsx) com avaliações de outro sistema.
            O importador vai tentar reconhecer cada produto pelo nome.
          </p>
        </div>
        <a
          href="/api/import/template"
          className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-white inline-flex items-center gap-2 whitespace-nowrap"
        >
          ⬇ Baixar modelo
        </a>
      </div>
      <ImportClient products={products ?? []} />
    </div>
  );
}
