import type { ReactNode } from "react";
import { AlertCircle, RefreshCw, X } from "lucide-react";
export function Loading({ label = "Загрузка" }: { label?: string }) {
  return (
    <div className="state state-loading" role="status">
      <div className="skeleton-lines">
        <i />
        <i />
        <i />
      </div>
      <span>{label}</span>
    </div>
  );
}
export function ErrorState({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: () => void;
}) {
  return (
    <div className="state state-error" role="alert">
      <AlertCircle size={22} />
      <div>
        <b>Не удалось загрузить данные</b>
        <p>{error instanceof Error ? error.message : "Неизвестная ошибка"}</p>
        {onRetry && (
          <button className="button secondary" onClick={onRetry}>
            <RefreshCw size={15} />
            Повторить
          </button>
        )}
      </div>
    </div>
  );
}
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="state state-empty">
      <div>
        <b>{title}</b>
        <p>{description}</p>
        {action}
      </div>
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <h2>{title}</h2>
          <button
            className="icon-button"
            aria-label="Закрыть"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
export function FieldError({ message }: { message?: string }) {
  return message ? <small className="field-error">{message}</small> : null;
}
