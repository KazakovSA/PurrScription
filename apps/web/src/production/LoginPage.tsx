import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { useForm } from "react-hook-form";
import { Navigate, useNavigate } from "react-router-dom";
import { z } from "zod";
import { loginRequest } from "./api";
import { CatPawLogo } from "./CatPawLogo";
import { useAppStore } from "./store";
import { FieldError } from "./ui";
const schema = z.object({
  email: z.string().email("Введите корректный email"),
  password: z.string().min(1, "Введите пароль"),
});
type Values = z.infer<typeof schema>;
export function LoginPage() {
  const user = useAppStore((s) => s.user),
    setSession = useAppStore((s) => s.setSession),
    navigate = useNavigate(),
    form = useForm<Values>({
      resolver: zodResolver(schema),
      defaultValues: { email: "", password: "" },
    }),
    mutation = useMutation({
      mutationFn: (v: Values) => loginRequest(v.email, v.password),
      onSuccess: (s) => {
        setSession(s);
        navigate("/projects", { replace: true });
      },
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
          <p className="eyebrow">Рабочая среда аннотации</p>
          <h1>
            Слышать детали.
            <br />
            Фиксировать точно.
          </h1>
          <p>
            Разметка, проверка и выпуск речевых данных в одном рабочем контуре.
          </p>
        </div>
        <div className="signal" aria-hidden>
          {Array.from({ length: 15 }, (_, i) => (
            <i key={i} />
          ))}
        </div>
      </section>
      <section className="login-panel">
        <form
          className="auth-form"
          onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
          noValidate
        >
          <p className="eyebrow">Авторизация</p>
          <h2>Войти в систему</h2>
          <p className="form-intro">
            Используйте учётную запись, созданную администратором.
          </p>
          <label>
            Email
            <input
              autoComplete="username"
              type="email"
              {...form.register("email")}
              aria-invalid={!!form.formState.errors.email}
            />
            <FieldError message={form.formState.errors.email?.message} />
          </label>
          <label>
            Пароль
            <input
              autoComplete="current-password"
              type="password"
              {...form.register("password")}
              aria-invalid={!!form.formState.errors.password}
            />
            <FieldError message={form.formState.errors.password?.message} />
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
            {mutation.isPending ? "Вход…" : "Войти"}
            <ArrowRight size={17} />
          </button>
          <p className="secure-note">
            <ShieldCheck size={15} />
            Токен хранится только в текущей вкладке
          </p>
          <p className="form-intro">
            Нет аккаунта? <a href="/register">Зарегистрироваться</a>
          </p>
        </form>
      </section>
    </main>
  );
}
