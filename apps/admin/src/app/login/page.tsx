"use client";

import { useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { createClient } from "@/lib/supabase/client";

type Mode = "login" | "recovery";

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function changeMode(nextMode: Mode) {
    setMode(nextMode);
    setError(null);
    setSent(false);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();

    if (mode === "recovery") {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        {
          redirectTo: `${window.location.origin}/auth/callback?next=/account/password`,
        }
      );
      setLoading(false);
      if (resetError) {
        setError(translateAuthError(resetError.message));
        return;
      }
      setSent(true);
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);

    if (signInError) {
      setError(translateAuthError(signInError.message));
      return;
    }

    const requestedPath = new URLSearchParams(window.location.search).get("next");
    const destination =
      requestedPath?.startsWith("/") && !requestedPath.startsWith("//")
        ? requestedPath
        : "/dashboard";
    window.location.assign(destination);
  }

  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-[1.05fr_0.95fr]">
      <section className="relative hidden overflow-hidden bg-zinc-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-32 -top-28 h-96 w-96 rounded-full border border-white/10" />
        <div className="absolute -right-12 -top-10 h-64 w-64 rounded-full border border-white/10" />
        <div className="relative flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-zinc-950">
            <AppIcon name="star" size={19} />
          </span>
          <div>
            <div className="text-sm font-semibold">Avaliações</div>
            <div className="text-xs text-zinc-400">Avaliações & Kits</div>
          </div>
        </div>

        <div className="relative max-w-xl">
          <p className="mb-5 text-xs font-medium uppercase tracking-[0.18em] text-zinc-400">
            Painel da sua loja
          </p>
          <h1 className="text-4xl font-semibold leading-tight tracking-tight xl:text-5xl">
            Reputação, produtos e automações em um só lugar.
          </h1>
          <p className="mt-5 max-w-lg text-sm leading-6 text-zinc-400">
            Acompanhe avaliações, gerencie kits e mantenha o relacionamento com seus
            clientes de forma simples.
          </p>
        </div>

        <p className="relative text-xs text-zinc-500">Mesafy · Painel administrativo</p>
      </section>

      <section className="flex min-h-screen items-center justify-center bg-[#f7f7f5] px-5 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-zinc-950 text-white">
              <AppIcon name="star" size={19} />
            </span>
            <div>
              <div className="text-sm font-semibold">Avaliações</div>
              <div className="text-xs text-zinc-500">Avaliações & Kits</div>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="mb-7">
              <h2 className="text-2xl font-semibold tracking-tight text-zinc-950">
                {mode === "login" ? "Acesse sua conta" : "Defina uma nova senha"}
              </h2>
              <p className="mt-1.5 text-sm leading-5 text-zinc-500">
                {mode === "login"
                  ? "Entre com o e-mail cadastrado e sua senha."
                  : "Enviaremos um link seguro para o seu e-mail."}
              </p>
            </div>

            {sent ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900">
                  <div className="font-medium">Verifique seu e-mail</div>
                  <p className="mt-1 text-green-800">
                    Se esse endereço estiver cadastrado, você receberá o link para definir
                    uma nova senha.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => changeMode("login")}
                  className="w-full rounded-lg border border-zinc-300 bg-white py-2.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
                >
                  Voltar para o login
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <Field label="E-mail" htmlFor="email">
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-200"
                    placeholder="voce@sualoja.com.br"
                  />
                </Field>

                {mode === "login" && (
                  <Field label="Senha" htmlFor="password">
                    <div className="relative">
                      <input
                        id="password"
                        name="password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="current-password"
                        required
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        className="w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 pr-20 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-200"
                        placeholder="Digite sua senha"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((visible) => !visible)}
                        className="absolute inset-y-0 right-3 text-xs font-medium text-zinc-500 hover:text-zinc-900"
                      >
                        {showPassword ? "Ocultar" : "Mostrar"}
                      </button>
                    </div>
                  </Field>
                )}

                {error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-lg bg-zinc-950 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading
                    ? mode === "login"
                      ? "Entrando..."
                      : "Enviando..."
                    : mode === "login"
                      ? "Entrar"
                      : "Enviar link para criar senha"}
                </button>

                <button
                  type="button"
                  onClick={() => changeMode(mode === "login" ? "recovery" : "login")}
                  className="w-full text-center text-sm font-medium text-zinc-600 hover:text-zinc-950"
                >
                  {mode === "login"
                    ? "Primeiro acesso ou esqueci minha senha"
                    : "Voltar para o login"}
                </button>
              </form>
            )}
          </div>

          <p className="mt-5 text-center text-xs text-zinc-400">
            Acesso restrito à administração da loja.
          </p>
        </div>
      </section>
    </main>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-zinc-800">
        {label}
      </label>
      {children}
    </div>
  );
}

function translateAuthError(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes("invalid login credentials")) {
    return "E-mail ou senha incorretos. Se ainda não criou sua senha, use o primeiro acesso.";
  }
  if (normalized.includes("email not confirmed")) {
    return "Este e-mail ainda não foi confirmado.";
  }
  if (normalized.includes("rate limit") || normalized.includes("security purposes")) {
    return "Aguarde alguns instantes antes de tentar novamente.";
  }
  return "Não foi possível concluir o acesso. Tente novamente.";
}
