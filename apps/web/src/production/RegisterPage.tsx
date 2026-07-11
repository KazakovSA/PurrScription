import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { useForm } from "react-hook-form";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { z } from "zod";
import { registerRequest } from "./api";
import { CatPawLogo } from "./CatPawLogo";
import { roleLabels } from "./AppShell";
import { useAppStore } from "./store";
import type { Role } from "./types";
import { FieldError } from "./ui";

const demoMode = import.meta.env.VITE_DEMO_MODE !== "false";

const schema = z.object({
  email: z.string().email("Введите корректный email"),
  name: z.string().min(2, "Имя должно быть не короче 2 символов"),
  password: z.string().min(8, "Пароль — минимум 8 символов"),
  role: z.enum([
    "annotator",
    "verifier",
    "supervisor",
    "ml_engineer",
    "customer",
  ] as const),
});

type Values = z.infer<typeof schema>;

export function RegisterPage() {
  const user = useAppStore((s) => s.user);
  const navigate = useNavigate();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: "",
      name: "",
      password: "",
      role: "annotator",
    },
  });
  const mutation = useMutation({
    mutationFn: (values: Values) =>
      registerRequest({ ...values, role: values.role as Role }),
    onSuccess: () => navigate("/login", { replace: true }),
  });

  if (user) return <Navigate to="/projects" replace />;

  return (
    <main className="login-shell">
      <section className="brand-panel">
        <div className="brand">
          <CatPawLogo />
          <span>PurrScription</span>
        </div>
        <div>
          <p className="eyebrow">Новая учётная запись</p>
          <h1>Регистрация</h1>
          <p>
            {demoMode
              ? "В демо-режиме можно создать учётную запись без входа администратора."
              : "Регистрация доступна только администратору через раздел «Администрирование»."}
          </p>
        </div>
      </section>
      <section className="login-panel">
        {!demoMode ? (
          <div className="auth-form">
            <p className="eyebrow">Регистрация закрыта</p>
            <h2>Обратитесь к администратору</h2>
            <p className="form-intro">
              Публичная регистрация отключена. Попросите администратора создать
              учётную запись.
            </p>
            <Link className="button secondary" to="/login">
              Вернуться ко входу
            </Link>
          </div>
        ) : (
          <form
            className="auth-form"
            onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
            noValidate
          >
            <p className="eyebrow">Демо-регистрация</p>
            <h2>Создать аккаунт</h2>
            <label>
              Имя
              <input {...form.register("name")} autoComplete="name" />
              <FieldError message={form.formState.errors.name?.message} />
            </label>
            <label>
              Email
              <input
                type="email"
                autoComplete="username"
                {...form.register("email")}
              />
              <FieldError message={form.formState.errors.email?.message} />
            </label>
            <label>
              Пароль
              <input
                type="password"
                autoComplete="new-password"
                {...form.register("password")}
              />
              <FieldError message={form.formState.errors.password?.message} />
            </label>
            <label>
              Роль
              <select {...form.register("role")}>
                {(
                  [
                    "annotator",
                    "verifier",
                    "supervisor",
                    "ml_engineer",
                    "customer",
                  ] as const
                ).map((role) => (
                  <option key={role} value={role}>
                    {roleLabels[role]}
                  </option>
                ))}
              </select>
            </label>
            {mutation.error && (
              <div className="inline-error" role="alert">
                {mutation.error.message}
              </div>
            )}
            <button
              className="button primary"
              type="submit"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? "Создание…" : "Зарегистрироваться"}
              <ArrowRight size={17} />
            </button>
            <p className="form-intro">
              Уже есть аккаунт? <Link to="/login">Войти</Link>
            </p>
          </form>
        )}
      </section>
    </main>
  );
}
