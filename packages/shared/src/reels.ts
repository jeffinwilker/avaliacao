/**
 * Tipos dos reels/stories de produto exibidos no widget publico.
 */

export interface WidgetProductReel {
  id: string;
  title: string;
  videoUrl: string;
  thumbnailUrl: string | null;
  productName: string;
  productUrl: string | null;
}
