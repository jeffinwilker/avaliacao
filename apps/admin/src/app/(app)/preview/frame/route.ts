import { NextResponse, type NextRequest } from "next/server";

// Serve um HTML mínimo que simula uma página de produto e embarca o widget.
// É renderizado dentro de um iframe pela página /preview, isolado do CSS
// do admin. Reproduz exatamente o cenário do tema da loja.

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const productId = searchParams.get("product_id") ?? "";
  const storeKey = searchParams.get("store_key") ?? "";
  const productName = searchParams.get("product_name") ?? "Produto";
  const image = searchParams.get("image") ?? "";

  const esc = (s: string) =>
    s.replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[
        c
      ] as string)
    );

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Preview — ${esc(productName)}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      max-width: 900px;
      margin: 0 auto;
      padding: 32px 20px;
      color: #111827;
      background: #ffffff;
    }
    .product {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 32px;
      margin-bottom: 40px;
      padding-bottom: 32px;
      border-bottom: 1px solid #e5e7eb;
    }
    .product-image {
      background: #f3f4f6;
      border-radius: 12px;
      aspect-ratio: 1;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .product-image img { width: 100%; height: 100%; object-fit: cover; }
    .product-image span { color: #9ca3af; font-size: 14px; }
    h1 { margin: 0 0 8px; font-size: 22px; line-height: 1.3; }
    .price { font-size: 26px; color: #111827; font-weight: 700; margin: 16px 0; }
    .buy { background: #111827; color: white; padding: 14px 24px; border-radius: 10px; border: 0; font-weight: 600; cursor: pointer; }
    .fake { color: #9ca3af; font-size: 13px; margin-top: 8px; }
    @media (max-width: 640px) {
      .product { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="product">
    <div class="product-image">
      ${image ? `<img src="${esc(image)}" alt="">` : `<span>sem imagem</span>`}
    </div>
    <div>
      <div class="fake">▸ Página de produto simulada</div>
      <h1>${esc(productName)}</h1>
      <div class="price">R$ 199,90</div>
      <button class="buy" onclick="return false">Comprar agora</button>
      <p class="fake">(Botão fictício — página de exemplo)</p>
    </div>
  </div>

  <div data-avaliacoes data-product-id="${esc(productId)}"></div>
  <script
    src="${origin}/widget/avaliacoes-widget.js"
    data-store-key="${esc(storeKey)}"
    async
  ></script>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
