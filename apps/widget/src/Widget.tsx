import { useEffect, useState } from "react";
import type { ListReviewsResponse } from "@avaliacoes/shared";
import { listReviews } from "./lib/api";
import { Stars } from "./components/Stars";
import { ReviewList } from "./components/ReviewList";
import { ReviewForm } from "./components/ReviewForm";
import { Pagination } from "./components/Pagination";

export interface WidgetProps {
  apiKey: string;
  externalProductId: string;
  /** Token vindo do link da solicitação (e-mail/WhatsApp) — pré-preenche o form */
  token?: string;
  /** Cor da marca (sobrescreve o setting da loja) */
  brandColor?: string;
  /** Máximo de mídias por avaliação (0 desabilita upload) */
  maxMedia?: number;
}

const PAGE_SIZE = 5;

export function Widget({
  apiKey,
  externalProductId,
  token,
  brandColor,
  maxMedia = 5,
}: WidgetProps) {
  const [data, setData] = useState<ListReviewsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(Boolean(token));
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listReviews({ apiKey, externalProductId, page, pageSize: PAGE_SIZE })
      .then((res) => {
        if (!cancelled) {
          setData(res);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apiKey, externalProductId, page, refresh]);

  const stats = data?.stats;

  const style = brandColor
    ? ({ "--av-brand": brandColor } as React.CSSProperties)
    : undefined;

  return (
    <section className="av-root" style={style} aria-label="Avaliações do produto">
      <div className="av-summary">
        <div className="av-summary-left">
          {stats && stats.totalReviews > 0 ? (
            <>
              <div className="av-summary-avg">{stats.averageRating.toFixed(1)}</div>
              <div>
                <Stars value={stats.averageRating} />
                <div className="av-summary-text">
                  Baseado em {stats.totalReviews}{" "}
                  {stats.totalReviews === 1 ? "avaliação" : "avaliações"}
                </div>
              </div>
            </>
          ) : (
            <div className="av-summary-text">Ainda sem avaliações</div>
          )}
        </div>
        {!showForm && (
          <button className="av-btn" onClick={() => setShowForm(true)}>
            Escrever avaliação
          </button>
        )}
      </div>

      {showForm && (
        <ReviewForm
          apiKey={apiKey}
          externalProductId={externalProductId}
          token={token}
          maxMedia={maxMedia}
          onClose={() => setShowForm(false)}
          onSubmitted={() => {
            setShowForm(false);
            setRefresh((n) => n + 1);
          }}
        />
      )}

      <ReviewList reviews={data?.reviews ?? []} loading={loading} />

      {data && (
        <Pagination
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          onChange={setPage}
        />
      )}
    </section>
  );
}
