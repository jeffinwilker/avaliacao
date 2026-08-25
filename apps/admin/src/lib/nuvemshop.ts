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
  weight?: string | null;
  depth?: string | null;
  width?: string | null;
  height?: string | null;
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
  number?: number | string;
  token?: string | null;
  customer?: {
    id?: number | string;
    name: string;
    email?: string;
    phone?: string;
  } | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  status: string;
  payment_status?: string;
  shipping_status?: string;
  shipping_tracking_number?: string | null;
  shipping_tracking_url?: string | null;
  products: Array<{
    product_id: number;
    variant_id?: number;
    quantity: number;
    name?: string;
  }>;
  created_at: string;
  paid_at?: string | null;
  shipped_at?: string;
  fulfillments?: NuvemshopFulfillmentOrder[];
}

export interface NuvemshopFulfillmentOrder {
  id: string;
  number?: string;
  status?: string;
  fulfilled_at?: string | null;
  tracking_info?: {
    code?: string | null;
    number?: string | null;
    url?: string | null;
  } | null;
  tracking_events?: Array<{
    id: string;
    status: string;
    description?: string | null;
    happened_at?: string | null;
    estimated_delivery_at?: string | null;
  }>;
}

export interface NuvemshopAbandonedCheckout {
  id: number;
  token: string;
  abandoned_checkout_url: string;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  shipping_name?: string | null;
  shipping_phone?: string | null;
  subtotal?: string | null;
  total?: string | null;
  currency?: string | null;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
  coupon?: Array<{
    id: number;
    code: string;
  }>;
  products: Array<{
    product_id: number;
    variant_id?: number;
    quantity: number;
    name: string;
    price?: string | null;
    image?: { src?: string | null } | null;
  }>;
}

export interface NuvemshopCoupon {
  id: number;
  code: string;
  type: "percentage" | "absolute" | "shipping";
  value?: string | number | null;
  valid: boolean;
}

export interface NuvemshopCustomer {
  id: number;
  name: string;
  email?: string | null;
  phone?: string | null;
  identification?: string | null;
  note?: string | null;
  default_address?: Record<string, unknown> | null;
  addresses?: Array<Record<string, unknown>>;
  billing_address?: string | null;
  billing_number?: string | null;
  billing_floor?: string | null;
  billing_locality?: string | null;
  billing_zipcode?: string | null;
  billing_city?: string | null;
  billing_province?: string | null;
  billing_country?: string | null;
  billing_phone?: string | null;
  extra?: Record<string, unknown> | null;
  total_spent?: string | number | null;
  total_spent_currency?: string | null;
  last_order_id?: number | string | null;
  active?: boolean;
  accepts_marketing?: boolean | null;
  accepts_marketing_updated_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface NuvemshopCategory {
  id: number;
  name: { pt?: string; es?: string; en?: string };
  handle?: { pt?: string; es?: string; en?: string };
}

const CUSTOMER_FIELDS =
  "id,name,email,phone,identification,note,default_address,addresses,billing_address,billing_number,billing_floor,billing_locality,billing_zipcode,billing_city,billing_province,billing_country,billing_phone,extra,total_spent,total_spent_currency,last_order_id,active,accepts_marketing,created_at,updated_at";

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
    weight?: number;
    depth?: number;
    width?: number;
    height?: number;
  }
): Promise<NuvemshopProduct> {
  const variant: Record<string, unknown> = {
    price: payload.price.toFixed(2),
    promotional_price: payload.promotional_price?.toFixed(2),
    stock_management: payload.stock !== undefined,
    stock: payload.stock,
  };
  if (payload.weight != null) variant.weight = payload.weight.toFixed(3);
  if (payload.depth != null) variant.depth = payload.depth.toFixed(2);
  if (payload.width != null) variant.width = payload.width.toFixed(2);
  if (payload.height != null) variant.height = payload.height.toFixed(2);

  const body: Record<string, unknown> = {
    name: { pt: payload.name },
    published: payload.published ?? true,
    variants: [variant],
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
    categoryIds?: number[];
  }
): Promise<NuvemshopProduct> {
  // Atenção: o PUT /products NÃO aceita o campo `images` (retorna 422).
  // Imagens são gerenciadas pelo sub-recurso /products/{id}/images.
  const body: Record<string, unknown> = {};
  if (payload.name) body.name = { pt: payload.name };
  if (payload.description !== undefined) body.description = { pt: payload.description };
  if (payload.published !== undefined) body.published = payload.published;
  if (payload.categoryIds) body.categories = payload.categoryIds;
  return request<NuvemshopProduct>("PUT", storeId, token, `/products/${productId}`, { body });
}

/**
 * Substitui toda a galeria de um produto (apaga as existentes e adiciona as novas).
 * Usado ao atualizar as imagens de um kit já criado.
 */
export async function replaceProductImages(
  storeId: string,
  token: string,
  productId: string | number,
  images: string[]
): Promise<void> {
  const existing = await request<Array<{ id: number }>>(
    "GET",
    storeId,
    token,
    `/products/${productId}/images`,
    { params: { fields: "id" } }
  );
  for (const img of existing) {
    try {
      await request("DELETE", storeId, token, `/products/${productId}/images/${img.id}`);
    } catch {
      // segue mesmo se uma exclusão falhar
    }
  }
  for (const src of images) {
    await request("POST", storeId, token, `/products/${productId}/images`, {
      body: { src },
    });
  }
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
  payload: {
    price?: number;
    promotional_price?: number | null;
    stock?: number;
    weight?: number;
    depth?: number;
    width?: number;
    height?: number;
  }
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
  if (payload.weight !== undefined) body.weight = payload.weight.toFixed(3);
  if (payload.depth !== undefined) body.depth = payload.depth.toFixed(2);
  if (payload.width !== undefined) body.width = payload.width.toFixed(2);
  if (payload.height !== undefined) body.height = payload.height.toFixed(2);
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
  try {
    return await request<NuvemshopOrder>("GET", storeId, token, `/orders/${orderId}`, {
      params: { aggregates: "fulfillment_orders" },
    });
  } catch (error) {
    // Mantém compatibilidade enquanto a loja ainda não autorizou o novo escopo.
    if (!/API (401|403|422)/.test((error as Error).message)) throw error;
    return request<NuvemshopOrder>("GET", storeId, token, `/orders/${orderId}`);
  }
}

export async function fetchFulfillmentOrder(
  storeId: string,
  token: string,
  fulfillmentId: string
): Promise<NuvemshopFulfillmentOrder> {
  return request<NuvemshopFulfillmentOrder>(
    "GET",
    storeId,
    token,
    `/fulfillment-orders/${fulfillmentId}`
  );
}

export async function checkFulfillmentOrderAccess(
  storeId: string,
  token: string
): Promise<void> {
  await request<NuvemshopFulfillmentOrder[]>(
    "GET",
    storeId,
    token,
    "/fulfillment-orders",
    { params: { page: 1, per_page: 1 } }
  );
}

/**
 * A Nuvemshop não possui webhook de carrinho abandonado. A lista pode ganhar
 * novos registros até seis horas depois do abandono, então o cron percorre as
 * páginas disponíveis e a fila local garante idempotência.
 */
export async function fetchAllAbandonedCheckouts(
  storeId: string,
  token: string
): Promise<NuvemshopAbandonedCheckout[]> {
  const all: NuvemshopAbandonedCheckout[] = [];
  let page = 1;
  const perPage = 200;

  while (true) {
    let batch: NuvemshopAbandonedCheckout[];
    try {
      batch = await request<NuvemshopAbandonedCheckout[]>(
        "GET",
        storeId,
        token,
        "/checkouts",
        { params: { page, per_page: perPage } }
      );
    } catch (error) {
      // Algumas contas retornam 404 em vez de [] quando não há carrinhos
      // ou quando a paginação chega ao fim.
      if ((error as Error).message.includes("API 404 GET /checkouts")) break;
      throw error;
    }
    all.push(...batch);
    if (batch.length < perPage) break;
    page++;
  }

  return all;
}

export async function checkAbandonedCheckoutAccess(
  storeId: string,
  token: string
): Promise<void> {
  try {
    await request<NuvemshopAbandonedCheckout[]>(
      "GET",
      storeId,
      token,
      "/checkouts",
      { params: { page: 1, per_page: 1, fields: "id" } }
    );
  } catch (error) {
    if ((error as Error).message.includes("API 404 GET /checkouts")) return;
    throw error;
  }
}

export async function checkCouponAccess(
  storeId: string,
  token: string
): Promise<void> {
  await request<NuvemshopCoupon[]>("GET", storeId, token, "/coupons", {
    params: { page: 1, per_page: 1, fields: "id,code" },
  });
}

export async function checkCustomerAccess(
  storeId: string,
  token: string
): Promise<void> {
  await request<NuvemshopCustomer[]>("GET", storeId, token, "/customers", {
    params: { page: 1, per_page: 1, fields: "id,email" },
  });
}

// ============================ CUSTOMERS ============================

export async function fetchAllCustomers(
  storeId: string,
  token: string
): Promise<NuvemshopCustomer[]> {
  const all: NuvemshopCustomer[] = [];
  let page = 1;
  const perPage = 200;

  while (true) {
    const batch = await request<NuvemshopCustomer[]>(
      "GET",
      storeId,
      token,
      "/customers",
      {
        params: {
          page,
          per_page: perPage,
          fields: CUSTOMER_FIELDS,
        },
      }
    );
    if (batch.length === 0) break;
    all.push(...batch);
    if (batch.length < perPage) break;
    page++;
  }

  return all;
}

export async function fetchCustomer(
  storeId: string,
  token: string,
  customerId: string | number
): Promise<NuvemshopCustomer> {
  return request<NuvemshopCustomer>(
    "GET",
    storeId,
    token,
    `/customers/${customerId}`,
    { params: { fields: CUSTOMER_FIELDS } }
  );
}

/**
 * Garante um cupom exclusivo no checkout abandonado. Se o cliente já tiver
 * aplicado outro cupom, preserva e devolve esse código em vez de substituí-lo.
 */
export async function ensureAbandonedCheckoutCoupon(
  storeId: string,
  token: string,
  checkoutId: string | number,
  input: {
    code: string;
    type: "percentage" | "absolute" | "shipping";
    value: number;
    validHours: number;
    minPrice?: number | null;
  }
): Promise<NuvemshopCoupon> {
  const checkout = await request<NuvemshopAbandonedCheckout>(
    "GET",
    storeId,
    token,
    `/checkouts/${checkoutId}`,
    { params: { fields: "id,coupon" } }
  );
  const assigned = checkout.coupon?.find((coupon) => coupon.id && coupon.code);
  if (assigned) {
    return {
      id: assigned.id,
      code: assigned.code,
      type: input.type,
      valid: true,
    };
  }

  const matches = await request<NuvemshopCoupon[]>(
    "GET",
    storeId,
    token,
    "/coupons",
    { params: { q: input.code, per_page: 50 } }
  );
  let coupon = matches.find(
    (candidate) => candidate.code.toUpperCase() === input.code.toUpperCase()
  );

  if (!coupon) {
    const now = new Date();
    const end = new Date(now.getTime() + input.validHours * 60 * 60 * 1000);
    const body: Record<string, unknown> = {
      code: input.code,
      type: input.type,
      valid: true,
      max_uses: 1,
      start_date: now.toISOString(),
      end_date: end.toISOString(),
      combines_with_other_discounts: true,
    };
    if (input.type !== "shipping") body.value = input.value.toFixed(2);
    if (input.minPrice && input.minPrice > 0) body.min_price = input.minPrice;

    try {
      coupon = await request<NuvemshopCoupon>(
        "POST",
        storeId,
        token,
        "/coupons",
        { body }
      );
    } catch (error) {
      if (!(error as Error).message.includes("API 422 POST /coupons")) throw error;
      const retried = await request<NuvemshopCoupon[]>(
        "GET",
        storeId,
        token,
        "/coupons",
        { params: { q: input.code, per_page: 50 } }
      );
      coupon = retried.find(
        (candidate) => candidate.code.toUpperCase() === input.code.toUpperCase()
      );
      if (!coupon) throw error;
    }
  }

  try {
    await request<NuvemshopAbandonedCheckout>(
      "POST",
      storeId,
      token,
      `/checkouts/${checkoutId}/coupon`,
      { body: { coupon_id: coupon.id } }
    );
    return coupon;
  } catch (error) {
    if (!(error as Error).message.includes("already has an assigned coupon")) {
      throw error;
    }
    const refreshed = await request<NuvemshopAbandonedCheckout>(
      "GET",
      storeId,
      token,
      `/checkouts/${checkoutId}`,
      { params: { fields: "id,coupon" } }
    );
    const current = refreshed.coupon?.find((item) => item.id && item.code);
    if (!current) throw error;
    return {
      id: current.id,
      code: current.code,
      type: input.type,
      valid: true,
    };
  }
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
