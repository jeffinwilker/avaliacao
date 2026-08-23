"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SyncOrdersButton() {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function sync() {
    setState("loading");
    setMessage(null);
    const res = await fetch("/api/automations/sync", { method: "POST" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setState("error");
      setMessage(json.error || "Não foi possível atualizar a lista");
      return;
    }

    setState("done");
    setMessage(`${json.sync?.found ?? 0} carrinho(s) encontrado(s).`);
    router.refresh();
    window.setTimeout(() => setMessage(null), 3000);
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <button
        type="button"
        onClick={sync}
        disabled={state === "loading"}
        className="bg-brand-900 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
      >
        {state === "loading" ? "Atualizando..." : "Atualizar lista"}
      </button>
      {message && (
        <span className={`text-sm ${state === "error" ? "text-red-700" : "text-green-700"}`}>
          {message}
        </span>
      )}
    </div>
  );
}
