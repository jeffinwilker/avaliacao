import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createAdminClient } from "@/lib/supabase/admin";
import { PreviewClient } from "./PreviewClient";

export default async function PreviewPage() {
  const admin = createAdminClient();

  const [{ data: store }, { data: products }] = await Promise.all([
    admin.from("stores").select("id, name, api_key, domain").limit(1).maybeSingle(),
    admin
      .from("products")
      .select("id, external_product_id, name, image_url")
      .order("name")
      .limit(500),
  ]);

  // O widget precisa estar buildado em public/widget/avaliacoes-widget.js
  const widgetPath = resolve(process.cwd(), "public/widget/avaliacoes-widget.js");
  const widgetReady = existsSync(widgetPath);

  return (
    <div className="p-8 max-w-5xl">
      <h1 className="text-2xl font-bold mb-2">Preview do widget</h1>
      <p className="text-gray-600 mb-6">
        Veja como o widget vai aparecer no site da sua loja — sem precisar colar
        nada no tema ainda.
      </p>

      {!store ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
          Conecte uma loja primeiro em <a href="/integration" className="underline">Integração</a>.
        </div>
      ) : !widgetReady ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
          <strong>Widget ainda não foi buildado.</strong>
          <p className="text-sm text-gray-700 mt-2 mb-3">
            Rode no terminal (na raiz do projeto):
          </p>
          <pre className="bg-gray-900 text-gray-100 rounded-lg p-3 text-xs overflow-x-auto">
{`npm run build:widget:copy`}
          </pre>
          <p className="text-sm text-gray-700 mt-3">
            Depois recarrega essa página. O arquivo vai ficar em{" "}
            <code>apps/admin/public/widget/avaliacoes-widget.js</code> e passa a ser
            servido em <code>/widget/avaliacoes-widget.js</code>.
          </p>
        </div>
      ) : (
        <PreviewClient
          storeKey={store.api_key}
          storeName={store.name}
          products={products ?? []}
        />
      )}
    </div>
  );
}
