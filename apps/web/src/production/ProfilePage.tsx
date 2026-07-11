import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Navigate } from "react-router-dom";
import { api, assetUrl, updateProfileRequest } from "./api";
import { AppShell, PageHeader, roleLabels } from "./AppShell";
import { useAppStore } from "./store";
import type { Envelope, User } from "./types";

export function ProfilePage() {
  const user = useAppStore((s) => s.user);
  const session = useAppStore((s) => s.session);
  const setSession = useAppStore((s) => s.setSession);
  const [name, setName] = useState(user?.name || "");
  const [message, setMessage] = useState("");

  const saveName = useMutation({
    mutationFn: () => updateProfileRequest(name.trim()),
    onSuccess: (updated) => {
      if (session) setSession({ ...session, user: updated });
      setMessage("Имя сохранено");
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : "Ошибка сохранения");
    },
  });

  if (!user) return <Navigate to="/login" replace />;

  return (
    <AppShell>
      <div className="page">
        <PageHeader
          eyebrow="Учётная запись"
          title="Профиль"
          description="Отображаемое имя и аватар видны другим участникам задачи"
        />
        <section className="admin-profile">
          <label className="avatar large avatar-upload" title="Изменить аватар">
            {user.avatarUrl ? (
              <img src={assetUrl(user.avatarUrl)} alt={user.name} />
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
                  setMessage("Аватар должен быть не больше 2 МБ");
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
                    setMessage("Аватар обновлён");
                  } catch (error) {
                    setMessage(
                      error instanceof Error
                        ? error.message
                        : "Не удалось сохранить аватар",
                    );
                  }
                })();
              }}
            />
          </label>
          <div className="profile-form">
            <label>
              Отображаемое имя
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={120}
              />
            </label>
            <p>{user.email}</p>
            <span>{roleLabels[user.role]}</span>
            <button
              className="button primary"
              disabled={saveName.isPending || !name.trim()}
              onClick={() => saveName.mutate()}
            >
              {saveName.isPending ? "Сохранение…" : "Сохранить имя"}
            </button>
            {message && <p className="form-intro">{message}</p>}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
