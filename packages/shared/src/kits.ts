/**
 * Tipos e helpers do domínio de Kits.
 */

export const KIT_DISCOUNT_TYPES = ["percent", "fixed", "total"] as const;
export type KitDiscountType = (typeof KIT_DISCOUNT_TYPES)[number];

export interface Kit {
  id: string;
  storeId: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  discountType: KitDiscountType;
  discountValue: number;
  nuvemshopProductId: string | null;
  nuvemshopVariantId: string | null;
  nuvemshopCategoryId: string | null;
  nuvemshopUrl: string | null;
  originalPrice: number | null;
  finalPrice: number | null;
  active: boolean;
  lastSyncedAt: string | null;
  syncError: string | null;
  createdAt: string;
  updatedAt: string;
  // relações opcionais
  items?: KitItem[];
  itemsCount?: number;
  totalUnits?: number;
}

export interface KitItem {
  id: string;
  kitId: string;
  productId: string;
  quantity: number;
  ordering: number;
  // hidratado com dados do produto na maioria das leituras
  product?: {
    id: string;
    externalProductId: string;
    name: string;
    imageUrl: string | null;
    price: number | null;
    stock: number | null;
  };
}

// ---------- Payloads (admin API) ----------

export interface CreateKitPayload {
  name: string;
  description?: string;
  imageUrl?: string;
  discountType: KitDiscountType;
  discountValue: number;
  active?: boolean;
  items: Array<{
    productId: string;
    quantity: number;
    ordering?: number;
  }>;
}

export type UpdateKitPayload = Partial<CreateKitPayload>;

// ---------- Payloads (widget público) ----------

export interface WidgetKitCard {
  id: string;
  name: string;
  imageUrl: string | null;
  originalPrice: number | null;
  finalPrice: number | null;
  discountPercent: number | null;
  url: string | null; // URL pra página do kit na loja
  itemsCount: number;
}

// ---------- Helpers ----------

/**
 * Calcula preços do kit baseado nos itens e tipo de desconto.
 * Retorna { original, final } — ambos em R$.
 */
export function computeKitPrices(
  items: Array<{ price: number | null; quantity: number }>,
  discountType: KitDiscountType,
  discountValue: number
): { original: number; final: number } {
  const original = items.reduce(
    (sum, i) => sum + (i.price ?? 0) * i.quantity,
    0
  );
  let final: number;
  switch (discountType) {
    case "percent":
      final = original * (1 - Math.max(0, Math.min(100, discountValue)) / 100);
      break;
    case "fixed":
      final = Math.max(0, original - discountValue);
      break;
    case "total":
      final = Math.max(0, discountValue);
      break;
  }
  return {
    original: round2(original),
    final: round2(final),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function discountPercent(original: number, final: number): number {
  if (!original || original <= 0) return 0;
  return Math.round(((original - final) / original) * 100);
}
