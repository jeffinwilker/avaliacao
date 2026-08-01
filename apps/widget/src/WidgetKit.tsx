import type { WidgetKitCard } from "@avaliacoes/shared";

const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export interface WidgetKitProps {
  kits: WidgetKitCard[];
  brandColor?: string;
  title?: string;
}

/**
 * Card(s) "Compre no kit" exibido na página do produto.
 * Cada card leva pra página do kit (produto real na loja).
 */
export function WidgetKit({ kits, brandColor, title }: WidgetKitProps) {
  if (!kits || kits.length === 0) return null;

  const style = brandColor
    ? ({ "--av-brand": brandColor } as React.CSSProperties)
    : undefined;

  return (
    <div className="av-root av-kit-wrap" style={style}>
      <div className="av-kit-label">{title ?? "Compre no kit e economize"}</div>
      <div className="av-kit-list">
        {kits.map((kit) => (
          <a
            key={kit.id}
            href={kit.url ?? "#"}
            className="av-kit-card"
            aria-label={`Ver kit ${kit.name}`}
          >
            {kit.imageUrl ? (
              <img src={kit.imageUrl} alt="" className="av-kit-thumb" loading="lazy" />
            ) : (
              <div className="av-kit-thumb av-kit-thumb-empty" />
            )}
            <div className="av-kit-info">
              <div className="av-kit-name">{kit.name}</div>
              {kit.itemsCount > 0 && (
                <div className="av-kit-count">
                  {kit.itemsCount} {kit.itemsCount === 1 ? "produto" : "produtos"}
                </div>
              )}
              <div className="av-kit-price">
                {kit.originalPrice && kit.discountPercent ? (
                  <>
                    <span className="av-kit-from">{BRL.format(kit.originalPrice)}</span>
                    <span className="av-kit-to">{BRL.format(kit.finalPrice ?? 0)}</span>
                    <span className="av-kit-badge">−{kit.discountPercent}%</span>
                  </>
                ) : kit.finalPrice ? (
                  <span className="av-kit-to">{BRL.format(kit.finalPrice)}</span>
                ) : null}
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
