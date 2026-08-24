interface EvolutionRequestOptions {
  method?: "GET" | "POST" | "DELETE";
  body?: unknown;
}

export type EvolutionConnectionState =
  | "open"
  | "close"
  | "connecting"
  | "unknown";

export interface EvolutionConnectionData {
  state: EvolutionConnectionState;
  qrCode: string | null;
  pairingCode: string | null;
}

export function isEvolutionServerConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_API_URL && process.env.WHATSAPP_API_KEY);
}

export async function evolutionRequest(
  path: string,
  options: EvolutionRequestOptions = {}
): Promise<unknown> {
  const url = process.env.WHATSAPP_API_URL?.replace(/\/+$/, "");
  const apiKey = process.env.WHATSAPP_API_KEY;

  if (!url || !apiKey) {
    throw new Error("Servidor Evolution não configurado");
  }

  const response = await fetch(`${url}/${path.replace(/^\/+/, "")}`, {
    method: options.method ?? "GET",
    headers: {
      apikey: apiKey,
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
  });
  const text = await response.text();
  let payload: unknown = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    throw new Error(extractEvolutionError(payload, response.status));
  }

  return payload;
}

export function parseEvolutionConnection(
  payload: unknown
): EvolutionConnectionData {
  const record = asRecord(payload);
  const instance = asRecord(record?.instance);
  const qrcode = asRecord(record?.qrcode) ?? asRecord(instance?.qrcode);
  const rawState = firstString(
    instance?.state,
    instance?.status,
    instance?.connectionStatus,
    record?.state,
    record?.status,
    record?.connectionStatus
  )?.toLowerCase();
  const state: EvolutionConnectionState =
    rawState === "open" || rawState === "connected"
      ? "open"
      : rawState === "close" || rawState === "closed" || rawState === "disconnected"
        ? "close"
        : rawState === "connecting"
          ? "connecting"
          : "unknown";
  const rawQr = firstString(
    record?.base64,
    qrcode?.base64,
    qrcode?.base64Qr,
    instance?.base64
  );
  const qrCode = rawQr
    ? rawQr.startsWith("data:image")
      ? rawQr
      : `data:image/png;base64,${rawQr}`
    : null;

  return {
    state,
    qrCode,
    pairingCode:
      firstString(record?.pairingCode, qrcode?.pairingCode, instance?.pairingCode) ??
      null,
  };
}

export function evolutionInstanceExists(payload: unknown, instanceName: string): boolean {
  const record = asRecord(payload);
  const instances = Array.isArray(payload)
    ? payload
    : Array.isArray(record?.instances)
      ? record.instances
      : [];

  return instances.some((value) => {
    const item = asRecord(value);
    const nested = asRecord(item?.instance);
    const name = firstString(
      item?.name,
      item?.instanceName,
      nested?.name,
      nested?.instanceName
    );
    return name === instanceName;
  });
}

function extractEvolutionError(payload: unknown, status: number): string {
  const record = asRecord(payload);
  const response = asRecord(record?.response);
  const message =
    messageFrom(response?.message) ??
    messageFrom(record?.message) ??
    messageFrom(record?.error) ??
    messageFrom(payload);
  return message
    ? `Evolution API: ${message}`
    : `Evolution API respondeu com erro ${status}`;
}

function messageFrom(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) return value;
  if (Array.isArray(value)) {
    const messages = value.flatMap((item) => messageFrom(item) ?? []);
    return messages.length ? messages.join("; ") : undefined;
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function firstString(...values: unknown[]): string | undefined {
  return values.find(
    (value): value is string => typeof value === "string" && value.length > 0
  );
}
