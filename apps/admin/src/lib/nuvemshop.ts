// ----------------------------------------------------------------------------
// Cliente mínimo da API Nuvemshop (server-side).
// Doc: https://tiendanube.github.io/api-documentation/
// ----------------------------------------------------------------------------

const BASE = "https://api.tiendanube.com/v1";
const UA = "Avaliacoes (contato@exemplo.com)";

interface NuvemshopProduct {
  id: number;
  name: { pt?: string; es?: string; en?: string };
  images?: Array<{ src: string }>;
}

interface NuvemshopOrder {
  id: number;
  customer: {
    name: string;
    email?: string;
    phone?: string;
  };
  status: string;
  shipping_status?: string;
  products: Array<{ product_id: number; quantity: number }>;
  created_at: string;
  shipped_at?: string;
}

async function get<T>(
  storeId: string,
  token: string,
  path: string,
  params?: Record<string, string | number>
): Promise<T> {
  const url = new URL(`${BASE}/${storeId}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) =>
      url.searchParams.set(k, String(v))
    );
  }
  const res = await fetch(url, {
    headers: {
      Authentication: `bearer ${token}`,
      "User-Agent": UA,
    },
  });
  if (!res.ok) {
    throw new Error(`Nuvemshop API ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchAllProducts(
  storeId: string,
  token: string
): Promise<NuvemshopProduct[]> {
  const all: NuvemshopProduct[] = [];
  let page = 1;
  const perPage = 200;
  while (true) {
    const batch = await get<NuvemshopProduct[]>(storeId, token, "/products", {
      page,
      per_page: perPage,
      fields: "id,name,images",
    });
    if (batch.length === 0) break;
    all.push(...batch);
    if (batch.length < perPage) break;
    page++;
  }
  return all;
}

export async function fetchOrder(
  storeId: string,
  token: string,
  orderId: string | number
): Promise<NuvemshopOrder> {
  return get<NuvemshopOrder>(storeId, token, `/orders/${orderId}`);
}

export async function registerWebhook(
  storeId: string,
  token: string,
  event: string,
  url: string
): Promise<void> {
  const res = await fetch(`${BASE}/${storeId}/webhooks`, {
    method: "POST",
    headers: {
      Authentication: `bearer ${token}`,
      "User-Agent": UA,
      "content-type": "application/json",
    },
    body: JSON.stringify({ event, url }),
  });
  if (!res.ok && res.status !== 422) {
    // 422 = já registrado
    throw new Error(`Webhook register failed: ${await res.text()}`);
  }
}
