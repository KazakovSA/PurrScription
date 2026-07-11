import type { ReactNode } from "react";
import {
  BarChart3,
  BookOpen,
  FileAudio,
  FolderKanban,
  LogOut,
  Settings,
} from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { api, assetUrl } from "./api";
import { CatPawLogo } from "./CatPawLogo";
import { defaultCapabilities } from "./permissions";
import { useAppStore } from "./store";
import type { Envelope, Role, User } from "./types";
export const roleLabels: Record<Role, string> = {
  admin: "Администратор",
  supervisor: "Супервайзер",
  annotator: "Разметчик",
  verifier: "Верификатор",
  ml_engineer: "ML-инженер",
  customer: "Заказчик",
};
const items = [
  ["/projects", "Проекты", FolderKanban],
  ["/tasks", "Задачи", FileAudio],
  ["/terms", "Термины", BookOpen],
  ["/analytics", "Аналитика", BarChart3],
  ["/admin", "Администрирование", Settings],
] as const;
export function AppShell({ children }: { children: ReactNode }) {
  const user = useAppStore((s) => s.user),
    session = useAppStore((s) => s.session),
    setSession = useAppStore((s) => s.setSession),
    clear = useAppStore((s) => s.clearSession),
    navigate = useNavigate();
  if (!user) return null;
  const caps = defaultCapabilities(user.role);
  const logout = async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {}
    clear();
    navigate("/login");
  };
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Перейти к основному содержимому
      </a>
      <aside className="sidebar">
        <NavLink to="/projects" className="brand">
          <CatPawLogo />
          <span>PurrScription</span>
        </NavLink>
        <nav aria-label="Основная навигация">
          {items.map(([to, label, Icon]) => {
            const blocked =
              (to === "/admin" && !caps.manageUsers) ||
              (to === "/analytics" && !caps.viewAnalytics);
            return blocked ? (
              <span
                className="nav-disabled"
                title="Доступно только администратору"
                key={to}
              >
                <Icon size={18} />
                {label}
              </span>
            ) : (
              <NavLink key={to} to={to}>
                <Icon size={18} />
                {label}
              </NavLink>
            );
          })}
        </nav>
        <div className="account">
          <label className="avatar avatar-upload" title="Изменить аватар">
            {user.avatarUrl ? (
              <img src={assetUrl(user.avatarUrl)} alt="" />
            ) : (
              user.name.slice(0, 1).toUpperCase()
            )}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file || !session) return;
                if (file.size > 2_000_000) {
                  window.alert("Аватар должен быть не больше 2 МБ");
                  return;
                }
                void (async () => {
                  try {
                    const body = new FormData();
                    body.append("file", file);
                    const updated = (
                      await api<Envelope<User>>("/auth/me/avatar-file", {
                        method: "POST",
                        body,
                      })
                    ).data;
                    setSession({ ...session, user: updated });
                  } catch (error) {
                    window.alert(
                      error instanceof Error
                        ? error.message
                        : "Не удалось сохранить аватар",
                    );
                  }
                })();
              }}
            />
          </label>
          <div>
            <NavLink to="/profile" className="profile-link">
              <b>{user.name}</b>
            </NavLink>
            <small>{roleLabels[user.role]}</small>
          </div>
          <button className="icon-button" aria-label="Выйти" onClick={logout}>
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <main className="shell-content" id="main-content" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </header>
  );
}
