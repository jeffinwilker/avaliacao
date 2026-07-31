import { useId, useState } from "react";

interface StarsProps {
  /** Nota. Pode ser decimal (ex: 4.5 → 4 cheias + 1 meia). */
  value: number;
  size?: "sm" | "lg";
  interactive?: boolean;
  onChange?: (value: number) => void;
}

export function Stars({ value, size = "sm", interactive = false, onChange }: StarsProps) {
  const [hover, setHover] = useState<number | null>(null);
  const display = hover ?? value;
  const uid = useId().replace(/:/g, "");

  return (
    <div
      className={`av-stars ${size === "lg" ? "av-stars-lg" : ""} ${interactive ? "av-stars-interactive" : ""}`}
      role={interactive ? "radiogroup" : "img"}
      aria-label={`${value.toFixed(1)} de 5 estrelas`}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        // 0..1 = porcentagem preenchida DESTA estrela
        const fill = Math.max(0, Math.min(1, display - (n - 1)));
        const pct = fill * 100;
        const gradId = `av-grad-${uid}-${n}`;

        return (
          <svg
            key={n}
            className="av-star"
            viewBox="0 0 24 24"
            onMouseEnter={interactive ? () => setHover(n) : undefined}
            onMouseLeave={interactive ? () => setHover(null) : undefined}
            onClick={interactive ? () => onChange?.(n) : undefined}
            role={interactive ? "radio" : undefined}
            aria-checked={interactive ? value === n : undefined}
            tabIndex={interactive ? 0 : undefined}
          >
            <defs>
              <linearGradient id={gradId} x1="0" x2="1" y1="0" y2="0">
                <stop offset={`${pct}%`} stopColor="var(--av-star)" />
                <stop offset={`${pct}%`} stopColor="var(--av-star-empty)" />
              </linearGradient>
            </defs>
            <path
              fill={`url(#${gradId})`}
              d="M12 2l2.95 6.97 7.55.62-5.75 4.97 1.78 7.36L12 17.77l-6.53 4.15 1.78-7.36L1.5 9.59l7.55-.62L12 2z"
            />
          </svg>
        );
      })}
    </div>
  );
}
