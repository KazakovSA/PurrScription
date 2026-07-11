export function CatPawLogo({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`cat-logo ${compact ? "compact" : ""}`} aria-hidden="true">
      <svg viewBox="0 0 48 48" role="img">
        <ellipse cx="24" cy="30" rx="11" ry="9" />
        <ellipse
          cx="10.5"
          cy="23"
          rx="5"
          ry="6.5"
          transform="rotate(-25 10.5 23)"
        />
        <ellipse
          cx="18.5"
          cy="13"
          rx="5"
          ry="6.5"
          transform="rotate(-8 18.5 13)"
        />
        <ellipse
          cx="29.5"
          cy="13"
          rx="5"
          ry="6.5"
          transform="rotate(8 29.5 13)"
        />
        <ellipse
          cx="37.5"
          cy="23"
          rx="5"
          ry="6.5"
          transform="rotate(25 37.5 23)"
        />
      </svg>
    </span>
  );
}
