"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function NativeKitImportButton({
  initialValue = "",
  compact = false,
}: {
  initialValue?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(initialValue);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!value.trim() || loading) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    const response = await fetch("/api/kits/import-native", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: value.trim() }),
    });
    const json = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) {
      setError(json.error ?? "Não foi possível importar o kit.");
      return;
    }
    setSuccess(
      `${json.name} reconhecido: ${json.totalUnits} ${
        json.totalUnits === 1 ? "unidade" : "unidades"
      }.`
    );
    router.refresh();
  }

  function close() {
    if (loading) return;
    setOpen(false);
    setError(null);
    setSuccess(null);
    setValue(initialValue);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          compact
            ? "text-xs font-medium text-brand-900 hover:underline"
            : "rounded-lg bg-brand-900 px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        }
      >
        {compact ? "Atualizar dados" : "Importar kit nativo"}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Importar kit nativo da Nuvemshop"
          onMouseDown={(event) => event.currentTarget === event.target && close()}
        >
          <form
            onSubmit={submit}
            className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-6 py-5">
              <div>
                <h2 className="text-lg font-semibold text-gray-950">
                  Importar kit nativo
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  O kit é criado na Nuvemshop. Aqui nós reconhecemos os produtos e
                  as quantidades para exibi-los corretamente na loja.
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                disabled={loading}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-xl text-gray-500 hover:bg-gray-100 disabled:opacity-50"
                aria-label="Fechar"
              >
                ×
              </button>
            </div>

            <div className="space-y-4 p-6">
              <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                No painel da Nuvemshop, abra o kit que você criou e copie o link da
                página dele na loja.
              </div>
              <label className="block text-sm font-medium text-gray-700">
                Link ou ID do kit
                <input
                  autoFocus
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  placeholder="https://sualoja.com/produtos/nome-do-kit/"
                  className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-normal outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
                />
              </label>
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                  {error}
                </div>
              )}
              {success && (
                <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2.5 text-sm text-green-800">
                  {success}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
              <button
                type="button"
                onClick={close}
                disabled={loading}
                className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {success ? "Fechar" : "Cancelar"}
              </button>
              {!success && (
                <button
                  type="submit"
                  disabled={loading || !value.trim()}
                  className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? "Buscando..." : "Reconhecer kit"}
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </>
  );
}
