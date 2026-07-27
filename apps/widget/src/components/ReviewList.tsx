import type { Review } from "@avaliacoes/shared";
import { ReviewItem } from "./ReviewItem";

interface ReviewListProps {
  reviews: Review[];
  loading: boolean;
}

export function ReviewList({ reviews, loading }: ReviewListProps) {
  if (loading) {
    return (
      <div className="av-loading">
        <div className="av-spinner" />
        <div>Carregando avaliações...</div>
      </div>
    );
  }

  if (reviews.length === 0) {
    return (
      <div className="av-empty">
        Ainda não há avaliações. Seja o primeiro a avaliar!
      </div>
    );
  }

  return (
    <div className="av-list">
      {reviews.map((r) => (
        <ReviewItem key={r.id} review={r} />
      ))}
    </div>
  );
}
