import type { Review } from "@avaliacoes/shared";
import { Stars } from "./Stars";

interface ReviewItemProps {
  review: Review;
}

const dtf = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export function ReviewItem({ review }: ReviewItemProps) {
  return (
    <article className="av-item">
      <header className="av-item-head">
        <div>
          <span className="av-item-author">{review.customerName}</span>
          {review.verifiedPurchase && (
            <span className="av-item-verified" style={{ marginLeft: 8 }}>
              ✓ Compra verificada
            </span>
          )}
        </div>
        <span className="av-item-date">
          {dtf.format(new Date(review.createdAt))}
        </span>
      </header>

      <Stars value={review.rating} />

      {review.title && <h4 className="av-item-title">{review.title}</h4>}
      {review.comment && <p className="av-item-comment">{review.comment}</p>}

      {review.media && review.media.length > 0 && (
        <div className="av-item-media">
          {review.media.map((m) =>
            m.type === "video" ? (
              <video key={m.id} src={m.url ?? undefined} controls preload="metadata" />
            ) : (
              <img key={m.id} src={m.url ?? undefined} alt="" loading="lazy" />
            )
          )}
        </div>
      )}

      {review.reply && (
        <div className="av-item-reply">
          <div className="av-item-reply-label">Resposta da loja:</div>
          <div>{review.reply}</div>
        </div>
      )}
    </article>
  );
}
