import { useEffect, useMemo, useState } from "react";
import type { WidgetProductReel } from "@avaliacoes/shared";

export interface WidgetReelsProps {
  reels: WidgetProductReel[];
  brandColor?: string;
  title?: string;
}

export function WidgetReels({ reels, brandColor, title }: WidgetReelsProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const activeReel = activeIndex == null ? null : reels[activeIndex] ?? null;
  const hasMany = reels.length > 1;
  const currentPosition = activeIndex == null ? 0 : activeIndex + 1;

  const style = brandColor
    ? ({ "--av-brand": brandColor } as React.CSSProperties)
    : undefined;

  useEffect(() => {
    if (!activeReel) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setActiveIndex(null);
      if (event.key === "ArrowRight") {
        setActiveIndex((index) => nextIndex(index, reels.length));
      }
      if (event.key === "ArrowLeft") {
        setActiveIndex((index) => prevIndex(index, reels.length));
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [activeReel, reels.length]);

  const progressItems = useMemo(() => reels.map((reel) => reel.id), [reels]);

  if (!reels || reels.length === 0) return null;

  return (
    <div className="av-root av-reels-wrap" style={style}>
      <div className="av-reels-label">{title ?? "Vídeos do produto"}</div>
      <div className="av-reels-strip" role="list">
        {reels.map((reel, index) => (
          <button
            key={reel.id}
            type="button"
            className="av-reel-chip"
            onClick={() => setActiveIndex(index)}
            aria-label={`Abrir vídeo ${reel.title}`}
          >
            <span className="av-reel-ring">
              <span className="av-reel-thumb">
                {reel.thumbnailUrl ? (
                  <img src={reel.thumbnailUrl} alt="" loading="lazy" />
                ) : (
                  <video
                    src={reel.videoUrl}
                    muted
                    playsInline
                    preload="metadata"
                  />
                )}
                <span className="av-reel-play" aria-hidden="true" />
              </span>
            </span>
            <span className="av-reel-chip-title">{reel.title}</span>
          </button>
        ))}
      </div>

      {activeReel && activeIndex != null && (
        <div
          className="av-reel-modal"
          role="dialog"
          aria-modal="true"
          aria-label={activeReel.title}
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setActiveIndex(null);
          }}
        >
          <div className="av-reel-player-shell">
            <div className="av-reel-progress" aria-hidden="true">
              {progressItems.map((id, index) => (
                <span
                  key={id}
                  className={index <= activeIndex ? "active" : undefined}
                />
              ))}
            </div>
            <button
              type="button"
              className="av-reel-close"
              onClick={() => setActiveIndex(null)}
              aria-label="Fechar vídeo"
            >
              ×
            </button>
            {hasMany && (
              <button
                type="button"
                className="av-reel-nav av-reel-nav-prev"
                onClick={() =>
                  setActiveIndex((index) => prevIndex(index, reels.length))
                }
                aria-label="Vídeo anterior"
              >
                ‹
              </button>
            )}
            <video
              key={activeReel.id}
              src={activeReel.videoUrl}
              poster={activeReel.thumbnailUrl ?? undefined}
              className="av-reel-player"
              controls
              autoPlay
              playsInline
            />
            {hasMany && (
              <button
                type="button"
                className="av-reel-nav av-reel-nav-next"
                onClick={() =>
                  setActiveIndex((index) => nextIndex(index, reels.length))
                }
                aria-label="Próximo vídeo"
              >
                ›
              </button>
            )}
            <div className="av-reel-caption">
              <div>
                <div className="av-reel-caption-title">{activeReel.title}</div>
                <div className="av-reel-caption-product">
                  {activeReel.productName}
                </div>
              </div>
              {activeReel.productUrl && (
                <a href={activeReel.productUrl} className="av-reel-product-link">
                  Ver produto
                </a>
              )}
              <span className="av-reel-count">
                {currentPosition}/{reels.length}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function nextIndex(index: number | null, total: number): number {
  if (index == null || total <= 1) return 0;
  return (index + 1) % total;
}

function prevIndex(index: number | null, total: number): number {
  if (index == null || total <= 1) return 0;
  return (index - 1 + total) % total;
}
