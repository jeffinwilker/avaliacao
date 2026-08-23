"use client";

import { useState } from "react";

export function RunAutomationsButton() {
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    setState("running");
    setMessage(null);
    const res = await fetch("/api/automations/run", { method: "POST" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setState("error");
      setMessage(json.error || "Falha ao processar automações");
      return;
    }

    setState("done");
    setMessage(
      `${json.sync?.queued ?? 0} novo(s) carrinho(s) agendado(s) e ${
        json.messages?.sent ?? 0
      } mensagem(ns) enviada(s).`
    );
    window.setTimeout(() => window.location.reload(), 1200);
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <button
        type="button"
        onClick={run}
        disabled={state === "running"}
        className="bg-brand-900 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
      >
        {state === "running" ? "Processando..." : "Processar agora"}
      </button>
      {message && (
        <span className={`text-sm ${state === "error" ? "text-red-700" : "text-green-700"}`}>
          {message}
        </span>
      )}
    </div>
  );
}
