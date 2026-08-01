import type { WidgetKitContentItem } from "@avaliacoes/shared";

export interface WidgetKitContentsProps {
  items: WidgetKitContentItem[];
  brandColor?: string;
  title?: string;
}

/**
 * Lista "Produtos do kit" — exibida na página do produto-kit.
 * Mostra cada item que compõe o kit, com link pro produto individual.
 */
export function WidgetKitContents({
  items,
  brandColor,
  title,
}: WidgetKitContentsProps) {
  if (!items || items.length === 0) return null;

  const style = brandColor
    ? ({ "--av-brand": brandColor } as React.CSSProperties)
    : undefined;

  return (
    <div className="av-root av-kitc-wrap" style={style}>
      <div className="av-kitc-title">{title ?? "Produtos do kit"}</div>
      <div className="av-kitc-list">
        {items.map((it) => (
          <a
            key={it.id}
            href={it.url ?? "#"}
            className="av-kitc-row"
            aria-label={it.name}
          >
            {it.imageUrl ? (
              <img src={it.imageUrl} alt="" className="av-kitc-thumb" loading="lazy" />
            ) : (
              <div className="av-kitc-thumb av-kitc-thumb-empty" />
            )}
            <div className="av-kitc-info">
              <div className="av-kitc-name">{it.name}</div>
              <div className="av-kitc-qty">
                {it.quantity} {it.quantity === 1 ? "unidade" : "unidades"}
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
