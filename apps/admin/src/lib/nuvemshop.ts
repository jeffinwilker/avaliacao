// ----------------------------------------------------------------------------
// Cliente da API Nuvemshop (server-side).
// Doc: https://tiendanube.github.io/api-documentation/
// ----------------------------------------------------------------------------

const BASE = "https://api.tiendanube.com/v1";
const UA = "Avaliacoes (contato@exemplo.com)";

export interface NuvemshopVariant {
  id: number;
  price?: string | null;
  promotional_price?: string | null;
  stock?: number | null;
  stock_management?: boolean;
  sku?: string | null;
}

export interface NuvemshopProduct {
  id: number;
  name: { pt?: string; es?: string; en?: string };
  description?: { pt?: string; es?: string; en?: string };
  handle?: { pt?: string; es?: string; en?: string };
  images?: Array<{ src: string }>;
  variants?: NuvemshopVariant[];
  canonical_url?: string;
}

export interface NuvemshopOrder {
  id: number;
  customer: {
    name: string;
    email?: string;
    phone?: string;
  };
  status: string;
  shipping_status?: string;
  products: Array<{ product_id: number; variant_id?: number; quantity: number }>;
  created_at: string;
  shipped_at?: string;
}

export interface NuvemshopCategory {
  id: number;
  name: { pt?: string; es?: string; en?: string };
  handle?: { pt?: string; es?: string; en?: string };
}

async function request<T>(
  method: string,
  storeId: string,
  token: string,
  path: string,
  init?: { params?: Record<string, string | number>; body?: unknown }
): Promise<T> {
  const url = new URL(`${BASE}/${storeId}${path}`);
  if (init?.params) {
    Object.entries(init.params).forEach(([k, v]) =>
      url.searchParams.set(k, String(v))
    );
  }
  const res = await fetch(url, {
    method,
    headers: {
      Authentication: `bearer ${token}`,
      "User-Agent": UA,
      ...(init?.body ? { "content-type": "application/json" } : {}),
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`Nuvemshop API ${res.status} ${method} ${path}: ${await res.text()}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ============================ PRODUCTS ============================

export async function fetchAllProducts(
  storeId: string,
  token: string
): Promise<NuvemshopProduct[]> {
  const all: NuvemshopProduct[] = [];
  let page = 1;
  const perPage = 200;
  while (true) {
    const batch = await request<NuvemshopProduct[]>("GET", storeId, token, "/products", {
      params: {
        page,
        per_page: perPage,
        fields: "id,name,description,handle,images,variants,canonical_url",
      },
    });
    if (batch.length === 0) break;
    all.push(...batch);
    if (batch.length < perPage) break;
    page++;
  }
  return all;
}

/** Cria um produto na Nuvemshop. Retorna o produto criado com ID. */
export async function createProduct(
  storeId: string,
  token: string,
  payload: {
    name: string;
    description?: string;
    price: number;
    promotional_price?: number;
    stock?: number;
    images?: string[];
    categoryIds?: number[];
    published?: boolean;
    handle?: string;
  }
): Promise<NuvemshopProduct> {
  const body: Record<string, unknown> = {
    name: { pt: payload.name },
    published: payload.published ?? true,
    variants: [
      {
        price: payload.price.toFixed(2),
        promotional_price: payload.promotional_price?.toFixed(2),
        stock_management: payload.stock !== undefined,
        stock: payload.stock,
      },
    ],
  };
  if (payload.description) body.description = { pt: payload.description };
  if (payload.handle) body.handle = { pt: payload.handle };
  if (payload.categoryIds && payload.categoryIds.length > 0) {
    body.categories = payload.categoryIds;
  }
  if (payload.images && payload.images.length > 0) {
    body.images = payload.images.map((src) => ({ src }));
  }
  return request<NuvemshopProduct>("POST", storeId, token, "/products", { body });
}

export async function updateProduct(
  storeId: string,
  token: string,
  productId: string | number,
  payload: {
    name?: string;
    description?: string;
    published?: boolean;
    images?: string[];
    categoryIds?: number[];
  }
): Promise<NuvemshopProduct> {
  const body: Record<string, unknown> = {};
  if (payload.name) body.name = { pt: payload.name };
  if (payload.description !== undefined) body.description = { pt: payload.description };
  if (payload.published !== undefined) body.published = payload.published;
  if (payload.images !== undefined) {
    body.images = payload.images.map((src) => ({ src }));
  }
  if (payload.categoryIds) body.categories = payload.categoryIds;
  return request<NuvemshopProduct>("PUT", storeId, token, `/products/${productId}`, { body });
}

/** Busca um produto (usado para pegar canonical_url + variant id após criar). */
export async function getProduct(
  storeId: string,
  token: string,
  productId: string | number
): Promise<NuvemshopProduct> {
  return request<NuvemshopProduct>("GET", storeId, token, `/products/${productId}`, {
    params: { fields: "id,canonical_url,variants" },
  });
}

export async function updateVariant(
  storeId: string,
  token: string,
  productId: string | number,
  variantId: string | number,
  payload: { price?: number; promotional_price?: number | null; stock?: number }
): Promise<NuvemshopVariant> {
  const body: Record<string, unknown> = {};
  if (payload.price !== undefined) body.price = payload.price.toFixed(2);
  if (payload.promotional_price !== undefined) {
    body.promotional_price = payload.promotional_price === null
      ? null
      : payload.promotional_price.toFixed(2);
  }
  if (payload.stock !== undefined) {
    body.stock_management = true;
    body.stock = payload.stock;
  }
  return request<NuvemshopVariant>(
    "PUT",
    storeId,
    token,
    `/products/${productId}/variants/${variantId}`,
    { body }
  );
}

export async function deleteProduct(
  storeId: string,
  token: string,
  productId: string | number
): Promise<void> {
  await request<void>("DELETE", storeId, token, `/products/${productId}`);
}

// ============================ CATEGORIES ============================

export async function findOrCreateCategory(
  storeId: string,
  token: string,
  name: string
): Promise<NuvemshopCategory> {
  // busca pelo nome
  const existing = await request<NuvemshopCategory[]>(
    "GET",
    storeId,
    token,
    "/categories",
    { params: { q: name, per_page: 50 } }
  );
  const match = existing.find(
    (c) =>
      (c.name?.pt ?? "").toLowerCase() === name.toLowerCase() ||
      (c.name?.es ?? "").toLowerCase() === name.toLowerCase()
  );
  if (match) return match;
  // cria
  return request<NuvemshopCategory>("POST", storeId, token, "/categories", {
    body: { name: { pt: name } },
  });
}

// ============================ ORDERS ============================

export async function fetchOrder(
  storeId: string,
  token: string,
  orderId: string | number
): Promise<NuvemshopOrder> {
  return request<NuvemshopOrder>("GET", storeId, token, `/orders/${orderId}`);
}

// ============================ WEBHOOKS ============================

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

// ============================ HELPERS ============================

/** Extrai a variante principal (a primeira) de um produto. */
export function mainVariant(product: NuvemshopProduct): NuvemshopVariant | null {
  return product.variants?.[0] ?? null;
}

/** Extrai nome em pt/es/en, com fallback. */
export function productName(product: NuvemshopProduct): string {
  return (
    product.name?.pt ??
    product.name?.es ??
    product.name?.en ??
    `Produto ${product.id}`
  );
}

/** Extrai descrição HTML em pt/es/en. */
export function productDescription(product: NuvemshopProduct): string | null {
  return (
    product.description?.pt ??
    product.description?.es ??
    product.description?.en ??
    null
  );
}
