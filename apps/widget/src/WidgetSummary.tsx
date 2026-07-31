import { useEffect, useState } from "react";
import type { ProductReviewStats } from "@avaliacoes/shared";
import { listReviews } from "./lib/api";
import { Stars } from "./components/Stars";

export interface WidgetSummaryProps {
  apiKey: string;
  externalProductId: string;
  /** Seletor pra onde rolar ao clicar em "Ver avaliações". Default: primeiro `[data-avaliacoes]` */
  target?: string;
  brandColor?: string;
  /**
   * Stats pré-carregados (usado em vitrines/categorias via batch).
   * - undefined → o componente faz fetch próprio
   * - null → sem reviews aprovadas (não renderiza)
   * - objeto → renderiza com esses stats
   */
  initialStats?: ProductReviewStats | null;
}

/**
 * Versão compacta do widget — mostra só a nota média + total + link.
 * Usado no topo da página do produto, perto do nome/preço.
 */
export function WidgetSummary({
  apiKey,
  externalProductId,
  target,
  brandColor,
  initialStats,
}: WidgetSummaryProps) {
  const hasPreloaded = initialStats !== undefined;
  const [stats, setStats] = useState<ProductReviewStats | null>(
    hasPreloaded ? initialStats ?? null : null
  );
  const [loading, setLoading] = useState(!hasPreloaded);

  useEffect(() => {
    if (hasPreloaded) return; // já veio via batch
    let cancelled = false;
    listReviews({ apiKey, externalProductId, page: 1, pageSize: 1 })
      .then((res) => {
        if (!cancelled) {
          setStats(res.stats);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apiKey, externalProductId, hasPreloaded]);

  const style = brandColor
    ? ({ "--av-brand": brandColor } as React.CSSProperties)
    : undefined;

  function scrollToReviews(e: React.MouseEvent) {
    e.preventDefault();
    const selector = target ?? "[data-avaliacoes]";
    const el = document.querySelector<HTMLElement>(selector);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  // Se ainda carregando ou sem reviews aprovadas, não renderiza nada
  if (loading) return null;
  if (!stats || stats.totalReviews === 0) return null;

  return (
    <span className="av-root av-summary-inline" style={style}>
      <Stars value={stats.averageRating} />
      <a
        href="#avaliacoes"
        onClick={scrollToReviews}
        className="av-summary-inline-link"
      >
        {stats.averageRating.toFixed(1)} · {stats.totalReviews}{" "}
        {stats.totalReviews === 1 ? "avaliação" : "avaliações"}
      </a>
    </span>
  );
}
