"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function PasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("A senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirmation) {
      setError("As duas senhas precisam ser iguais.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError("Não foi possível salvar a senha. Solicite um novo link e tente novamente.");
      return;
    }

    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-5 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"
    >
      <PasswordInput
        id="new-password"
        label="Nova senha"
        value={password}
        onChange={setPassword}
        visible={showPassword}
        autoComplete="new-password"
      />
      <PasswordInput
        id="confirm-password"
        label="Confirmar nova senha"
        value={confirmation}
        onChange={setConfirmation}
        visible={showPassword}
        autoComplete="new-password"
      />

      <label className="flex items-center gap-2 text-sm text-zinc-600">
        <input
          type="checkbox"
          checked={showPassword}
          onChange={(event) => setShowPassword(event.target.checked)}
          className="h-4 w-4 rounded border-zinc-300 accent-zinc-950"
        />
        Mostrar senhas
      </label>

      <p className="text-xs leading-5 text-zinc-500">
        Use pelo menos 8 caracteres e evite reutilizar a senha de outros serviços.
      </p>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-zinc-950 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
      >
        {loading ? "Salvando..." : "Salvar nova senha"}
      </button>
    </form>
  );
}

function PasswordInput({
  id,
  label,
  value,
  onChange,
  visible,
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  visible: boolean;
  autoComplete: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-zinc-800">
        {label}
      </label>
      <input
        id={id}
        type={visible ? "text" : "password"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        minLength={8}
        required
        className="w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-200"
      />
    </div>
  );
}

