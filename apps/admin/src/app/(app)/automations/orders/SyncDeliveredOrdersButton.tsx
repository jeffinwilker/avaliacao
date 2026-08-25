"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SyncDeliveredOrdersButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "ok" | "error";
    text: string;
  } | null>(null);

  async function sync() {
    setLoading(true);
    setFeedback(null);
    const response = await fetch("/api/automations/sync-orders", { method: "POST" });
    const result = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) {
      setFeedback({
        type: "error",
        text: result.error || "Não foi possível atualizar os pedidos",
      });
      return;
    }

    setFeedback({
      type: "ok",
      text: `${result.sync?.delivered ?? 0} pedido(s) entregue(s) encontrado(s).`,
    });
    router.refresh();
    window.setTimeout(() => setFeedback(null), 4_000);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={sync}
        disabled={loading}
        className="rounded-lg bg-brand-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {loading ? "Atualizando..." : "Atualizar pedidos"}
      </button>
      {feedback && (
        <span
          className={`text-sm ${feedback.type === "error" ? "text-red-700" : "text-green-700"}`}
        >
          {feedback.text}
        </span>
      )}
    </div>
  );
}
