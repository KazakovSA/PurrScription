import logoUrl from "../../../../Untitled.svg";

export function CatPawLogo({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`cat-logo ${compact ? "compact" : ""}`} aria-hidden="true">
      <img src={logoUrl} alt="" />
    </span>
  );
}
