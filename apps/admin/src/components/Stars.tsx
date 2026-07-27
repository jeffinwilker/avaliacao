interface StarsProps {
  value: number;
  size?: number;
}

export function Stars({ value, size = 16 }: StarsProps) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`${value} de 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <svg
          key={n}
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="currentColor"
          className={n <= value ? "text-amber-400" : "text-gray-200"}
        >
          <path d="M12 2l2.95 6.97 7.55.62-5.75 4.97 1.78 7.36L12 17.77l-6.53 4.15 1.78-7.36L1.5 9.59l7.55-.62L12 2z" />
        </svg>
      ))}
    </span>
  );
}
