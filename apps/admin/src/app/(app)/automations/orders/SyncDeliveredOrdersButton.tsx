"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function SyncDeliveredOrdersButton({
  mode = "delivered",
}: {
  mode?: "delivered" | "pending_payment";
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "ok" | "error";
    text: string;
  } | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const runningRef = useRef(false);

  const sync = useCallback(async (silent = false) => {
    if (runningRef.current) return;
    runningRef.current = true;
    if (!silent) {
      setLoading(true);
      setFeedback(null);
    }
    try {
      const response = await fetch("/api/automations/sync-orders", {
        method: "POST",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (!silent) {
          setFeedback({
            type: "error",
            text: result.error || "Não foi possível atualizar os pedidos",
          });
        }
        return;
      }

      setLastUpdatedAt(new Date());
      if (!silent) {
        const queued = mode === "pending_payment"
          ? result.pendingPayments?.queued ?? 0
          : (result.sync?.reviewRequestsQueued ?? 0) +
            (result.sync?.reviewRequestsReactivated ?? 0);
        setFeedback({
          type: "ok",
          text:
            queued > 0
              ? mode === "pending_payment"
                ? `${queued} lembrete(s) de Pix agendado(s).`
                : `${queued} convite(s) de avaliação agendado(s).`
              : mode === "pending_payment"
                ? `${result.pendingPayments?.eligible ?? 0} pedido(s) com Pix pendente encontrado(s).`
                : `${result.sync?.delivered ?? 0} pedido(s) entregue(s) encontrado(s).`,
        });
        window.setTimeout(() => setFeedback(null), 4_000);
      }
      router.refresh();
    } catch {
      if (!silent) {
        setFeedback({
          type: "error",
          text: "Não foi possível atualizar os pedidos",
        });
      }
    } finally {
      runningRef.current = false;
      if (!silent) setLoading(false);
    }
  }, [mode, router]);

  useEffect(() => {
    const syncWhenVisible = () => {
      if (document.visibilityState === "visible") void sync(true);
    };
    const initial = window.setTimeout(syncWhenVisible, 1_000);
    const syncInterval = window.setInterval(syncWhenVisible, 5 * 60_000);
    const refreshInterval = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 60_000);
    document.addEventListener("visibilitychange", syncWhenVisible);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(syncInterval);
      window.clearInterval(refreshInterval);
      document.removeEventListener("visibilitychange", syncWhenVisible);
    };
  }, [router, sync]);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => void sync(false)}
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
      {!feedback && (
        <span className="text-xs text-gray-500">
          Atualização automática ativa
          {lastUpdatedAt
            ? ` · última às ${lastUpdatedAt.toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
              })}`
            : ""}
        </span>
      )}
    </div>
  );
}
