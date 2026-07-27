import { useState } from "react";

interface StarsProps {
  value: number;
  size?: "sm" | "lg";
  interactive?: boolean;
  onChange?: (value: number) => void;
}

export function Stars({ value, size = "sm", interactive = false, onChange }: StarsProps) {
  const [hover, setHover] = useState<number | null>(null);
  const display = hover ?? value;

  return (
    <div
      className={`av-stars ${size === "lg" ? "av-stars-lg" : ""} ${interactive ? "av-stars-interactive" : ""}`}
      role={interactive ? "radiogroup" : "img"}
      aria-label={`${value} de 5 estrelas`}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <svg
          key={n}
          className={`av-star ${display >= n ? "filled" : ""}`}
          viewBox="0 0 24 24"
          fill="currentColor"
          onMouseEnter={interactive ? () => setHover(n) : undefined}
          onMouseLeave={interactive ? () => setHover(null) : undefined}
          onClick={interactive ? () => onChange?.(n) : undefined}
          role={interactive ? "radio" : undefined}
          aria-checked={interactive ? value === n : undefined}
          tabIndex={interactive ? 0 : undefined}
        >
          <path d="M12 2l2.95 6.97 7.55.62-5.75 4.97 1.78 7.36L12 17.77l-6.53 4.15 1.78-7.36L1.5 9.59l7.55-.62L12 2z" />
        </svg>
      ))}
    </div>
  );
}
