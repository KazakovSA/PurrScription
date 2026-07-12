import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  CheckCircle2,
  Clock3,
  FileAudio,
  KeyRound,
  ShieldCheck,
} from "lucide-react";
import { Navigate } from "react-router-dom";
import { api, assetUrl, registerRequest } from "./api";
import { defaultCapabilities } from "./permissions";
import { AppShell, PageHeader, roleLabels } from "./AppShell";
import { useAppStore } from "./store";
import type {
  Envelope,
  Paginated,
  Project,
  Role,
  Task,
  Term,
  User,
} from "./types";
import { EmptyState, ErrorState, Loading } from "./ui";
export function AnalyticsPage() {
  const projects = useQuery({
      queryKey: ["projects"],
      queryFn: () => api<Paginated<Project>>("/projects?limit=100"),
    }),
    tasks = useQuery({
      queryKey: ["tasks", "all"],
      queryFn: () => api<Paginated<Task>>("/tasks?limit=100"),
    });
  if (projects.isLoading || tasks.isLoading)
    return (
      <AppShell>
        <Loading label="Считаем показатели" />
      </AppShell>
    );
  if (projects.error || tasks.error)
    return (
      <AppShell>
        <ErrorState error={projects.error || tasks.error} />
      </AppShell>
    );
  const data = tasks.data?.data || [],
    counts = Object.entries(
      data.reduce<Record<string, number>>((acc, t) => {
        acc[t.status] = (acc[t.status] || 0) + 1;
        return acc;
      }, {}),
    );
  return (
    <AppShell>
      <div className="page">
        <PageHeader
          eyebrow="Операционная сводка"
          title="Аналитика"
          description="Показатели рассчитаны только из доступных вам задач"
        />
        <section className="feature-guide" aria-label="Как работает словарь">
          <strong>Как использовать словарь</strong>
          <ol>
            <li>
              Выберите проект: словарь принадлежит проекту, а не отдельной
              задаче.
            </li>
            <li>
              Добавьте точное написание термина, нормализацию/перевод и
              контекст.
            </li>
            <li>
              Переведите термин в «На проверке», затем в «Утверждён» или
              «Отклонён».
            </li>
          </ol>
          <p>
            Утверждённые термины — эталон для аннотаторов и верификаторов;
            спорные оставляйте на проверке с пояснением в поле контекста.
          </p>
        </section>
        <section className="metrics">
          <div>
            <FileAudio size={18} />
            <small>Всего задач</small>
            <strong>{data.length}</strong>
          </div>
          <div>
            <Clock3 size={18} />
            <small>В работе</small>
            <strong>
              {
                data.filter((t) =>
                  ["assigned", "in_progress", "rework"].includes(t.status),
                ).length
              }
            </strong>
          </div>
          <div>
            <ShieldCheck size={18} />
            <small>На проверке</small>
            <strong>{data.filter((t) => t.status === "review").length}</strong>
          </div>
          <div>
            <CheckCircle2 size={18} />
            <small>Завершено</small>
            <strong>
              {
                data.filter((t) => ["accepted", "exported"].includes(t.status))
                  .length
              }
            </strong>
          </div>
        </section>
        <section className="analytics-grid">
          <div>
            <h2>Распределение по статусам</h2>
            {counts.length ? (
              counts.map(([status, count]) => (
                <div className="bar-row" key={status}>
                  <span>{status}</span>
                  <i>
                    <b
                      style={{
                        width: `${Math.max(5, (count / data.length) * 100)}%`,
                      }}
                    />
                  </i>
                  <strong>{count}</strong>
                </div>
              ))
            ) : (
              <EmptyState
                title="Нет данных"
                description="Задачи появятся после загрузки медиа."
              />
            )}
          </div>
          <div>
            <h2>Проекты</h2>
            {projects.data?.data.map((project) => (
              <div className="plain-row" key={project.id}>
                <span>{project.name}</span>
                <b>{data.filter((t) => t.projectId === project.id).length}</b>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
export function TermsPage() {
  const user = useAppStore((s) => s.user)!;
  const qc = useQueryClient();
  const [projectId, setProjectId] = useState("");
  const [draft, setDraft] = useState({
    text: "",
    translation: "",
    context: "",
  });
  const projects = useQuery({
    queryKey: ["projects", "terms"],
    queryFn: () => api<Paginated<Project>>("/projects?limit=100"),
  });
  const selectedProject = projectId || projects.data?.data[0]?.id || "";
  const terms = useQuery({
    queryKey: ["terms", selectedProject],
    enabled: Boolean(selectedProject),
    queryFn: async () =>
      (await api<Envelope<Term[]>>(`/projects/${selectedProject}/terms`)).data,
  });
  const canEdit = defaultCapabilities(user.role).editTerms;
  return (
    <AppShell>
      <div className="page">
        <PageHeader
          eyebrow="Словарь проекта"
          title="Термины"
          description="Единая терминология для аннотаторов и верификаторов"
        />
        <div className="terms-toolbar">
          <label>
            Проект
            <select
              value={selectedProject}
              onChange={(event) => setProjectId(event.target.value)}
            >
              {projects.data?.data.map((project) => (
                <option value={project.id} key={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {canEdit && selectedProject && (
          <form
            className="term-create"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!draft.text.trim()) return;
              await api("/terms", {
                method: "POST",
                body: JSON.stringify({ projectId: selectedProject, ...draft }),
              });
              setDraft({ text: "", translation: "", context: "" });
              await qc.invalidateQueries({
                queryKey: ["terms", selectedProject],
              });
            }}
          >
            <input
              placeholder="Термин"
              value={draft.text}
              onChange={(e) => setDraft({ ...draft, text: e.target.value })}
            />
            <input
              placeholder="Перевод или нормализация"
              value={draft.translation}
              onChange={(e) =>
                setDraft({ ...draft, translation: e.target.value })
              }
            />
            <input
              placeholder="Контекст"
              value={draft.context}
              onChange={(e) => setDraft({ ...draft, context: e.target.value })}
            />
            <button className="button primary">Добавить</button>
          </form>
        )}
        <div className="terms-list">
          {terms.data?.map((term) => (
            <div className="term-row" key={term.id}>
              <strong>{term.text}</strong>
              <span>{term.translation || "—"}</span>
              <span>{term.context || "Без контекста"}</span>
              <select
                value={term.status}
                disabled={!canEdit}
                onChange={async (event) => {
                  await api(`/terms/${term.id}`, {
                    method: "PATCH",
                    body: JSON.stringify({ status: event.target.value }),
                  });
                  void terms.refetch();
                }}
              >
                <option value="new">Новый</option>
                <option value="review">На проверке</option>
                <option value="approved">Утверждён</option>
                <option value="rejected">Отклонён</option>
              </select>
              {canEdit && (
                <button
                  className="button danger"
                  onClick={async () => {
                    await api(`/terms/${term.id}`, { method: "DELETE" });
                    void terms.refetch();
                  }}
                >
                  Удалить
                </button>
              )}
            </div>
          ))}
          {terms.data && !terms.data.length && (
            <EmptyState
              title="Терминов пока нет"
              description="Добавьте первый термин для выбранного проекта."
            />
          )}
        </div>
      </div>
    </AppShell>
  );
}
export function AdminPage() {
  const user = useAppStore((s) => s.user);
  const session = useAppStore((s) => s.session);
  const setSession = useAppStore((s) => s.setSession);
  const users = useQuery({
    queryKey: ["admin-users"],
    enabled: user?.role === "admin",
    queryFn: async () => (await api<Envelope<User[]>>("/auth/users")).data,
  });
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "admin") return <Navigate to="/projects" replace />;
  return (
    <AppShell>
      <div className="page">
        <PageHeader
          eyebrow="Контроль доступа"
          title="Администрирование"
          description="Текущая учётная запись и доступные административные операции"
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
            <h2>{user.name}</h2>
            <p>{user.email}</p>
            <span>
              <KeyRound size={15} />
              {roleLabels[user.role]}
            </span>
          </div>
        </section>
        <section className="role-guide">
          <h2>Права ролей</h2>
          <p>
            <b>Администратор</b> — все операции, пользователи, роли и контроль
            качества.
          </p>
          <p>
            <b>Супервайзер</b> — проекты, назначение задач, проверка и принятие
            работ.
          </p>
          <p>
            <b>Разметчик</b> — редактирование назначенных сегментов, маркеры и
            комментарии.
          </p>
          <p>
            <b>Верификатор</b> — проверка, принятие и возврат задач на
            доработку.
          </p>
          <p>
            <b>ML-инженер</b> — запуск ASR и анализ качества распознавания.
          </p>
          <p>
            <b>Заказчик</b> — просмотр принятых материалов и экспорт без
            редактирования.
          </p>
        </section>
        <section className="admin-users">
          <h2>Создать пользователя</h2>
          <CreateUserForm onCreated={() => void users.refetch()} />
          <h2>Пользователи</h2>
          {users.data?.map((member) => (
            <div className="admin-user-row" key={member.id}>
              <span>
                {member.name}
                <small>{member.email}</small>
              </span>
              <select
                value={member.role}
                disabled={member.id === user.id}
                onChange={async (event) => {
                  await api(`/auth/users/${member.id}/role`, {
                    method: "PATCH",
                    body: JSON.stringify({ role: event.target.value }),
                  });
                  void users.refetch();
                }}
              >
                {Object.entries(roleLabels).map(([role, label]) => (
                  <option key={role} value={role}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </section>
      </div>
    </AppShell>
  );
}

function CreateUserForm({ onCreated }: { onCreated: () => void }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("annotator");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="admin-create-user"
      onSubmit={(event) => {
        event.preventDefault();
        setBusy(true);
        setMessage("");
        void registerRequest({ email, name, password, role })
          .then(() => {
            setEmail("");
            setName("");
            setPassword("");
            setRole("annotator");
            setMessage("Пользователь создан");
            onCreated();
          })
          .catch((error) => {
            setMessage(error instanceof Error ? error.message : "Ошибка");
          })
          .finally(() => setBusy(false));
      }}
    >
      <label>
        Email
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </label>
      <label>
        Имя
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />
      </label>
      <label>
        Пароль
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          minLength={8}
          required
        />
      </label>
      <label>
        Роль
        <select
          value={role}
          onChange={(event) => setRole(event.target.value as Role)}
        >
          {(
            [
              "annotator",
              "verifier",
              "supervisor",
              "ml_engineer",
              "customer",
              "admin",
            ] as const
          ).map((item) => (
            <option key={item} value={item}>
              {roleLabels[item]}
            </option>
          ))}
        </select>
      </label>
      <button className="button primary" type="submit" disabled={busy}>
        {busy ? "Создание…" : "Создать"}
      </button>
      {message && <p className="form-intro">{message}</p>}
    </form>
  );
}
