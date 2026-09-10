import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ColorVariationImporter,
  type ColorProductOption,
} from "./ColorVariationImporter";

export default async function ProductColorsPage() {
  const admin = createAdminClient();
  const { data: store } = await admin
    .from("stores")
    .select("id, platform, access_token")
    .limit(1)
    .maybeSingle();

  if (!store) {
    return (
      <div className="p-8">
        <p className="text-gray-600">
          Conecte sua loja primeiro em{" "}
          <Link href="/integration" className="underline">
            Integração
          </Link>
          .
        </p>
      </div>
    );
  }

  const { data: productRows } = await admin
    .from("products")
    .select("external_product_id, name, image_url")
    .eq("store_id", store.id)
    .order("name")
    .limit(5000);
  const products: ColorProductOption[] = (productRows ?? []).map((product) => ({
    externalProductId: product.external_product_id,
    name: product.name,
    imageUrl: product.image_url,
  }));

  return (
    <div className="p-5 sm:p-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 text-xs font-medium text-gray-500">
            <Link href="/products" className="hover:text-gray-900 hover:underline">
              Produtos
            </Link>{" "}
            / Importar cores
          </div>
          <h1 className="text-2xl font-bold">Importar cores dos produtos</h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            Envie sua planilha, confira os produtos encontrados e crie a variação
            Cor na Nuvemshop.
          </p>
        </div>
        <a
          href="/api/products/color-variations/template"
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Baixar modelo preenchível
        </a>
      </div>

      <ColorVariationImporter
        storeId={store.id}
        products={products}
        canSync={store.platform === "nuvemshop" && Boolean(store.access_token)}
      />
    </div>
  );
}
