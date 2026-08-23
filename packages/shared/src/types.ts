import type {
  REVIEW_STATUS,
  PLATFORMS,
  CHANNELS,
  MEDIA_TYPES,
} from "./constants";

export type ReviewStatus = (typeof REVIEW_STATUS)[number];
export type Platform = (typeof PLATFORMS)[number];
export type Channel = (typeof CHANNELS)[number];
export type MediaType = (typeof MEDIA_TYPES)[number];

export interface Store {
  id: string;
  name: string;
  platform: Platform;
  externalStoreId: string;
  apiKey: string;
  domain: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StoreSettings {
  storeId: string;
  autoPublish: boolean;
  requestDelayDays: number;
  emailEnabled: boolean;
  whatsappEnabled: boolean;
  emailSubject: string;
  emailTemplate: string | null;
  whatsappTemplate: string | null;
  abandonedCartEnabled: boolean;
  abandonedCartDelayHours: number;
  abandonedCartWhatsappTemplate: string | null;
  abandonedCartSequence: AbandonedCartMessageStep[];
  postPurchaseEnabled: boolean;
  postPurchaseDelayHours: number;
  postPurchaseWhatsappTemplate: string | null;
  brandColor: string;
  allowMedia: boolean;
  maxMediaPerReview: number;
  updatedAt: string;
}

export interface AbandonedCartMessageStep {
  id: string;
  delayHours: number;
  messageTemplate: string;
  enabled: boolean;
}

export interface Product {
  id: string;
  storeId: string;
  externalProductId: string;
  name: string;
  imageUrl: string | null;
  url: string | null;
  /** Preço regular da variante principal */
  price?: number | null;
  /** Preço promocional (opcional) */
  promotionalPrice?: number | null;
  /** Estoque atual */
  stock?: number | null;
  /** ID da variante principal na Nuvemshop */
  variantId?: string | null;
  /** Descrição HTML do produto */
  description?: string | null;
  /** Galeria de imagens (URLs) */
  images?: string[];
  /** Peso em kg */
  weight?: number | null;
  /** Comprimento em cm */
  depth?: number | null;
  /** Largura em cm */
  width?: number | null;
  /** Altura em cm */
  height?: number | null;
}

export interface Order {
  id: string;
  storeId: string;
  externalOrderId: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  status: string;
  orderedAt: string;
  deliveredAt: string | null;
}

export interface Review {
  id: string;
  storeId: string;
  productId: string;
  orderId: string | null;
  customerName: string;
  customerEmail: string | null;
  rating: number;
  title: string | null;
  comment: string | null;
  status: ReviewStatus;
  verifiedPurchase: boolean;
  reply: string | null;
  repliedAt: string | null;
  createdAt: string;
  moderatedAt: string | null;
  moderationNote: string | null;
  media?: ReviewMedia[];
}

export interface ReviewMedia {
  id: string;
  reviewId: string;
  type: MediaType;
  storagePath: string;
  url: string | null;
  width: number | null;
  height: number | null;
  ordering: number;
}

export interface ReviewRequest {
  id: string;
  storeId: string;
  orderId: string;
  productId: string;
  channel: Channel;
  status: "scheduled" | "sent" | "failed" | "cancelled" | "completed";
  scheduledFor: string;
  sentAt: string | null;
  token: string;
  errorMessage: string | null;
  attempts: number;
}

export interface ProductReviewStats {
  productId: string;
  totalReviews: number;
  averageRating: number;
  rating5: number;
  rating4: number;
  rating3: number;
  rating2: number;
  rating1: number;
}

// ---------- Payloads (widget → API) ----------

export interface SubmitReviewPayload {
  apiKey: string;
  externalProductId: string;
  customerName: string;
  customerEmail?: string;
  rating: number;
  title?: string;
  comment?: string;
  token?: string; // se vier do link da solicitação (pré-verificado)
}

export interface ListReviewsParams {
  apiKey: string;
  externalProductId: string;
  page?: number;
  pageSize?: number;
  rating?: number;
}

export interface ListReviewsResponse {
  reviews: Review[];
  stats: ProductReviewStats | null;
  page: number;
  pageSize: number;
  total: number;
}
