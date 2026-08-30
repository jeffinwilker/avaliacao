"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function SyncOrdersButton() {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const runningRef = useRef(false);

  const sync = useCallback(async (silent = false) => {
    if (runningRef.current) return;
    runningRef.current = true;
    if (!silent) {
      setState("loading");
      setMessage(null);
    }
    try {
      const res = await fetch("/api/automations/sync", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (!silent) {
          setState("error");
          setMessage(json.error || "Não foi possível atualizar a lista");
        }
        return;
      }

      setLastUpdatedAt(new Date());
      if (!silent) {
        setState("done");
        setMessage(`${json.sync?.found ?? 0} carrinho(s) encontrado(s).`);
      }
      router.refresh();
      if (!silent) window.setTimeout(() => setMessage(null), 3000);
    } catch {
      if (!silent) {
        setState("error");
        setMessage("Não foi possível atualizar a lista");
      }
    } finally {
      runningRef.current = false;
    }
  }, [router]);

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
    <div className="flex items-center gap-3 flex-wrap">
      <button
        type="button"
        onClick={() => void sync(false)}
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
      {!message && (
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
