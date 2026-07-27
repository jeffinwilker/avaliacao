"use client";

import { useMemo, useState } from "react";

interface Product {
  id: string;
  external_product_id: string;
  name: string;
  image_url: string | null;
}

export function PreviewClient({
  storeKey,
  storeName,
  products,
}: {
  storeKey: string;
  storeName: string;
  products: Product[];
}) {
  const [productIdx, setProductIdx] = useState(0);
  const product = products[productIdx];

  const frameUrl = useMemo(() => {
    if (!product) return null;
    const p = new URLSearchParams();
    p.set("product_id", product.external_product_id);
    p.set("store_key", storeKey);
    p.set("product_name", product.name);
    if (product.image_url) p.set("image", product.image_url);
    return `/preview/frame?${p.toString()}`;
  }, [product, storeKey]);

  if (products.length === 0) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
        Sincronize seus produtos primeiro (
        <a href="/integration" className="underline">Integração</a> → Sincronizar).
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3 flex-wrap">
        <label className="text-sm font-medium">Produto:</label>
        <select
          value={productIdx}
          onChange={(e) => setProductIdx(Number(e.target.value))}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1 min-w-[240px]"
        >
          {products.map((p, i) => (
            <option key={p.id} value={i}>
              {p.name}
            </option>
          ))}
        </select>
        <span className="text-xs text-gray-500">
          Loja: <strong>{storeName}</strong>
        </span>
      </div>

      <div className="bg-gray-100 rounded-xl border border-gray-200 overflow-hidden">
        <div className="bg-white border-b border-gray-200 px-4 py-2 text-xs text-gray-500">
          🔍 Simulação de página de produto
        </div>
        <iframe
          key={frameUrl ?? "none"}
          src={frameUrl ?? undefined}
          title="Preview do widget"
          className="w-full h-[800px] bg-white"
        />
      </div>

      <details className="bg-white rounded-xl border border-gray-200 p-4">
        <summary className="font-medium cursor-pointer">
          Como isso vai ficar na loja (código para colar no tema)
        </summary>
        <p className="text-sm text-gray-600 mt-3">
          Depois do deploy, cole isto no <em>produto.tpl</em> da sua Nuvemshop:
        </p>
        <pre className="bg-gray-900 text-gray-100 rounded-lg p-3 text-xs mt-2 overflow-x-auto">
{`<div data-avaliacoes data-product-id="{{ product.id }}"></div>
<script
  src="https://SEU_DOMINIO/widget/avaliacoes-widget.js"
  data-store-key="${storeKey}"
  async
></script>`}
        </pre>
      </details>
    </div>
  );
}
