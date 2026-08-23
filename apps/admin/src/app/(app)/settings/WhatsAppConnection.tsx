"use client";

import { useCallback, useEffect, useState } from "react";

type ConnectionState =
  | "loading"
  | "not_configured"
  | "not_created"
  | "open"
  | "close"
  | "connecting"
  | "unknown";

interface ConnectionResponse {
  serverConfigured?: boolean;
  instance?: string | null;
  state?: ConnectionState;
  qrCode?: string | null;
  pairingCode?: string | null;
  error?: string;
}

export function WhatsAppConnection({
  serverConfigured,
  initialInstance,
}: {
  serverConfigured: boolean;
  initialInstance: string | null;
}) {
  const [state, setState] = useState<ConnectionState>("loading");
  const [instance, setInstance] = useState<string | null>(initialInstance);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyResponse = useCallback((data: ConnectionResponse) => {
    setInstance(data.instance ?? null);
    setState(data.state ?? "unknown");
    setQrCode((current) =>
      data.state === "open" ? null : data.qrCode || current
    );
    setPairingCode((current) =>
      data.state === "open" ? null : data.pairingCode || current
    );
    setError(data.error ?? null);
  }, []);

  const checkStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/whatsapp/instance", { cache: "no-store" });
      const data = (await response.json()) as ConnectionResponse;
      if (!response.ok) throw new Error(data.error || "Não foi possível consultar a conexão");
      applyResponse(data);
    } catch (statusError) {
      setState("unknown");
      setError((statusError as Error).message);
    }
  }, [applyResponse]);

  useEffect(() => {
    if (!serverConfigured) {
      setState("not_configured");
      return;
    }
    void checkStatus();
  }, [checkStatus, serverConfigured]);

  useEffect(() => {
    if (!instance || state === "open" || state === "not_configured") return;
    const timer = window.setInterval(() => void checkStatus(), 5000);
    return () => window.clearInterval(timer);
  }, [checkStatus, instance, state]);

  async function runAction(action: "create" | "connect") {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/whatsapp/instance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await response.json()) as ConnectionResponse;
      if (!response.ok) throw new Error(data.error || "Não foi possível conectar o WhatsApp");
      applyResponse(data);
    } catch (actionError) {
      setError((actionError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (state === "not_configured") {
    return (
      <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-4">
        Configure somente <code>WHATSAPP_API_URL</code> e <code>WHATSAPP_API_KEY</code> no
        servidor. Depois disso, você poderá criar a instância e conectar o número por aqui.
      </div>
    );
  }

  if (state === "loading") {
    return <p className="text-sm text-gray-500">Verificando a conexão...</p>;
  }

  if (state === "not_created") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-600">
          Crie uma instância exclusiva para este aplicativo. O próximo passo mostrará o
          QR Code para conectar o novo número.
        </p>
        <button
          type="button"
          onClick={() => void runAction("create")}
          disabled={busy}
          className="bg-brand-900 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
        >
          {busy ? "Criando conexão..." : "Criar conexão do WhatsApp"}
        </button>
        {error && <ErrorMessage message={error} />}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <StatusBadge state={state} />
        {instance && <span className="text-xs text-gray-500">Instância: {instance}</span>}
      </div>

      {state === "open" ? (
        <div className="text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg p-3">
          ✓ WhatsApp conectado. As automações já podem usar este número.
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <p className="text-sm font-medium mb-1">Conecte o novo número</p>
          <p className="text-xs text-gray-600 mb-4">
            No celular, abra WhatsApp → Aparelhos conectados → Conectar aparelho e leia o
            código abaixo.
          </p>

          {qrCode ? (
            <img
              src={qrCode}
              alt="QR Code para conectar o WhatsApp"
              className="w-64 h-64 max-w-full bg-white border border-gray-200 rounded-lg p-2"
            />
          ) : (
            <button
              type="button"
              onClick={() => void runAction("connect")}
              disabled={busy}
              className="bg-brand-900 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {busy ? "Gerando QR Code..." : "Gerar QR Code"}
            </button>
          )}

          {pairingCode && (
            <p className="text-sm mt-3">
              Código de pareamento: <strong className="font-mono">{pairingCode}</strong>
            </p>
          )}
          {qrCode && (
            <button
              type="button"
              onClick={() => void runAction("connect")}
              disabled={busy}
              className="mt-3 text-sm underline text-gray-700 disabled:opacity-50"
            >
              Atualizar QR Code
            </button>
          )}
        </div>
      )}

      {error && <ErrorMessage message={error} />}
    </div>
  );
}

function StatusBadge({ state }: { state: ConnectionState }) {
  const styles =
    state === "open"
      ? "bg-green-100 text-green-800"
      : state === "connecting"
        ? "bg-blue-100 text-blue-800"
        : "bg-amber-100 text-amber-800";
  const label =
    state === "open"
      ? "Conectado"
      : state === "connecting"
        ? "Aguardando leitura do QR Code"
        : state === "close"
          ? "Desconectado"
          : "Status indisponível";
  return <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${styles}`}>{label}</span>;
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
      {message}
    </p>
  );
}
