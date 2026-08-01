import type {
  ListReviewsParams,
  ListReviewsResponse,
  Review,
  ReviewMedia,
} from "@avaliacoes/shared";
import { supabase } from "./supabase";

// ----------------------------------------------------------------------------
// Em modo MVP: leitura usa Supabase direto (RLS público em reviews aprovadas).
// Escrita (submit) e upload de mídia vão por uma Edge Function que valida a
// api_key da loja e cria com status='pending'.
// ----------------------------------------------------------------------------

interface SubmitInput {
  apiKey: string;
  externalProductId: string;
  customerName: string;
  customerEmail?: string;
  rating: number;
  title?: string;
  comment?: string;
  media: File[];
  token?: string;
}

export const ADMIN_URL = import.meta.env.VITE_ADMIN_URL ?? "";

/**
 * Batch dos kits que contêm cada produto (usado nas páginas de produto).
 * Retorna Map external_product_id → array de cards de kit.
 */
export async function fetchKitsBatch(
  apiKey: string,
  externalProductIds: string[]
): Promise<Record<string, import("@avaliacoes/shared").WidgetKitCard[]>> {
  if (externalProductIds.length === 0) return {};
  try {
    const ids = externalProductIds.map(encodeURIComponent).join(",");
    const url = `${ADMIN_URL}/api/widget/kits?apiKey=${encodeURIComponent(apiKey)}&productIds=${ids}`;
    const res = await fetch(url);
    if (!res.ok) return {};
    const json = await res.json();
    return (json.kits ?? {}) as Record<
      string,
      import("@avaliacoes/shared").WidgetKitCard[]
    >;
  } catch {
    return {};
  }
}

/**
 * Batch stats para múltiplos produtos (usado em vitrines/categorias).
 * Retorna um Map external_product_id → stats.
 */
export async function fetchStatsBatch(
  apiKey: string,
  externalProductIds: string[]
): Promise<Record<string, import("@avaliacoes/shared").ProductReviewStats>> {
  if (externalProductIds.length === 0) return {};
  try {
    const ids = externalProductIds.map(encodeURIComponent).join(",");
    const url = `${ADMIN_URL}/api/widget/stats?apiKey=${encodeURIComponent(apiKey)}&productIds=${ids}`;
    const res = await fetch(url);
    if (!res.ok) return {};
    const json = await res.json();
    return (json.stats ?? {}) as Record<
      string,
      import("@avaliacoes/shared").ProductReviewStats
    >;
  } catch {
    return {};
  }
}

export async function listReviews(
  params: ListReviewsParams
): Promise<ListReviewsResponse> {
  if (!supabase) {
    return mockListReviews(params);
  }

  const pageSize = params.pageSize ?? 10;
  const page = params.page ?? 1;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // 1) resolver product_id a partir do external_product_id + api_key
  const { data: store } = await supabase
    .from("stores")
    .select("id")
    .eq("api_key", params.apiKey)
    .maybeSingle();

  if (!store) {
    return { reviews: [], stats: null, page, pageSize, total: 0 };
  }

  const { data: product } = await supabase
    .from("products")
    .select("id")
    .eq("store_id", store.id)
    .eq("external_product_id", params.externalProductId)
    .maybeSingle();

  if (!product) {
    return { reviews: [], stats: null, page, pageSize, total: 0 };
  }

  // 2) listar reviews aprovadas
  let query = supabase
    .from("reviews")
    .select(
      `
      id, store_id, product_id, order_id, customer_name, customer_email,
      rating, title, comment, status, verified_purchase, reply, replied_at,
      created_at, moderated_at, moderation_note,
      media:review_media (id, review_id, type, storage_path, url, width, height, ordering)
    `,
      { count: "exact" }
    )
    .eq("product_id", product.id)
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .range(from, to);

  if (params.rating) query = query.eq("rating", params.rating);

  const { data: rows, count } = await query;

  // 3) stats agregadas
  const { data: stats } = await supabase
    .from("product_review_stats")
    .select("*")
    .eq("product_id", product.id)
    .maybeSingle();

  return {
    reviews: (rows ?? []).map(rowToReview),
    stats: stats
      ? {
          productId: stats.product_id,
          totalReviews: stats.total_reviews,
          averageRating: Number(stats.average_rating ?? 0),
          rating5: stats.rating_5,
          rating4: stats.rating_4,
          rating3: stats.rating_3,
          rating2: stats.rating_2,
          rating1: stats.rating_1,
        }
      : null,
    page,
    pageSize,
    total: count ?? 0,
  };
}

export async function submitReview(input: SubmitInput): Promise<{
  ok: boolean;
  error?: string;
  review?: Review;
}> {
  if (!supabase) {
    return mockSubmit(input);
  }

  const form = new FormData();
  form.append("apiKey", input.apiKey);
  form.append("externalProductId", input.externalProductId);
  form.append("customerName", input.customerName);
  if (input.customerEmail) form.append("customerEmail", input.customerEmail);
  form.append("rating", String(input.rating));
  if (input.title) form.append("title", input.title);
  if (input.comment) form.append("comment", input.comment);
  if (input.token) form.append("token", input.token);
  input.media.forEach((file) => form.append("media", file, file.name));

  try {
    const res = await fetch(`${ADMIN_URL}/api/widget/submit`, {
      method: "POST",
      body: form,
    });
    const json = await res.json();
    if (!res.ok) return { ok: false, error: json.error ?? "Erro ao enviar." };
    return { ok: true, review: json.review };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

interface ReviewRow {
  id: string;
  store_id: string;
  product_id: string;
  order_id: string | null;
  customer_name: string;
  customer_email: string | null;
  rating: number;
  title: string | null;
  comment: string | null;
  status: Review["status"];
  verified_purchase: boolean;
  reply: string | null;
  replied_at: string | null;
  created_at: string;
  moderated_at: string | null;
  moderation_note: string | null;
  media?: Array<{
    id: string;
    review_id: string;
    type: ReviewMedia["type"];
    storage_path: string;
    url: string | null;
    width: number | null;
    height: number | null;
    ordering: number;
  }>;
}

function rowToReview(r: ReviewRow): Review {
  return {
    id: r.id,
    storeId: r.store_id,
    productId: r.product_id,
    orderId: r.order_id,
    customerName: r.customer_name,
    customerEmail: r.customer_email,
    rating: r.rating,
    title: r.title,
    comment: r.comment,
    status: r.status,
    verifiedPurchase: r.verified_purchase,
    reply: r.reply,
    repliedAt: r.replied_at,
    createdAt: r.created_at,
    moderatedAt: r.moderated_at,
    moderationNote: r.moderation_note,
    media: (r.media ?? [])
      .sort((a, b) => a.ordering - b.ordering)
      .map((m) => ({
        id: m.id,
        reviewId: m.review_id,
        type: m.type,
        storagePath: m.storage_path,
        url: m.url,
        width: m.width,
        height: m.height,
        ordering: m.ordering,
      })),
  };
}

// ----------------------------------------------------------------------------
// Mocks (quando Supabase não está configurado — para dev local sem backend)
// ----------------------------------------------------------------------------

function mockListReviews(params: ListReviewsParams): ListReviewsResponse {
  const reviews: Review[] = [
    {
      id: "1",
      storeId: "s1",
      productId: params.externalProductId,
      orderId: null,
      customerName: "Mariana Silva",
      customerEmail: null,
      rating: 5,
      title: "Adorei!",
      comment:
        "Produto chegou super rápido, embalagem caprichada e a qualidade é excelente. Já é a segunda vez que compro nessa loja, recomendo demais!",
      status: "approved",
      verifiedPurchase: true,
      reply:
        "Obrigado pelo carinho, Mariana! Ficamos felizes que gostou 💛",
      repliedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
      createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
      moderatedAt: null,
      moderationNote: null,
      media: [],
    },
    {
      id: "2",
      storeId: "s1",
      productId: params.externalProductId,
      orderId: null,
      customerName: "João Pedro",
      customerEmail: null,
      rating: 4,
      title: "Muito bom, mas demorou pra chegar",
      comment:
        "Produto em si é ótimo, só achei que demorou um pouquinho a entrega. Fora isso, perfeito.",
      status: "approved",
      verifiedPurchase: true,
      reply: null,
      repliedAt: null,
      createdAt: new Date(Date.now() - 86400000 * 12).toISOString(),
      moderatedAt: null,
      moderationNote: null,
      media: [],
    },
    {
      id: "3",
      storeId: "s1",
      productId: params.externalProductId,
      orderId: null,
      customerName: "Ana Carolina",
      customerEmail: null,
      rating: 5,
      title: null,
      comment: "Simplesmente perfeito ✨",
      status: "approved",
      verifiedPurchase: false,
      reply: null,
      repliedAt: null,
      createdAt: new Date(Date.now() - 86400000 * 20).toISOString(),
      moderatedAt: null,
      moderationNote: null,
      media: [],
    },
  ];

  return {
    reviews,
    stats: {
      productId: params.externalProductId,
      totalReviews: 3,
      averageRating: 4.7,
      rating5: 2,
      rating4: 1,
      rating3: 0,
      rating2: 0,
      rating1: 0,
    },
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 10,
    total: 3,
  };
}

function mockSubmit(input: SubmitInput): Promise<{ ok: boolean; review?: Review }> {
  return Promise.resolve({
    ok: true,
    review: {
      id: "mock",
      storeId: "s1",
      productId: input.externalProductId,
      orderId: null,
      customerName: input.customerName,
      customerEmail: input.customerEmail ?? null,
      rating: input.rating,
      title: input.title ?? null,
      comment: input.comment ?? null,
      status: "pending",
      verifiedPurchase: false,
      reply: null,
      repliedAt: null,
      createdAt: new Date().toISOString(),
      moderatedAt: null,
      moderationNote: null,
      media: [],
    },
  });
}
