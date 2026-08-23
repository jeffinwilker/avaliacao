// Envio de WhatsApp via Evolution API ou Z-API.
// Configure WHATSAPP_PROVIDER=evolution|zapi nas variáveis de ambiente.

interface SendWhatsAppInput {
  phone: string; // E.164: +5511999998888 (a gente normaliza)
  message: string;
  instance?: string | null;
}

export async function sendWhatsApp({
  phone,
  message,
  instance,
}: SendWhatsAppInput): Promise<void> {
  const provider = process.env.WHATSAPP_PROVIDER ?? "evolution";
  const normalized = normalizePhone(phone);

  if (provider === "evolution") {
    return sendViaEvolution(normalized, message, instance);
  }
  if (provider === "zapi") {
    return sendViaZapi(normalized, message);
  }
  throw new Error(`WhatsApp provider desconhecido: ${provider}`);
}

function normalizePhone(raw: string): string {
  // só dígitos
  let s = raw.replace(/\D/g, "");
  // se não começa com 55 (Brasil), assume Brasil
  if (!s.startsWith("55")) s = "55" + s;
  return s;
}

async function sendViaEvolution(
  phone: string,
  message: string,
  instanceOverride?: string | null
): Promise<void> {
  const url = process.env.WHATSAPP_API_URL;
  const apiKey = process.env.WHATSAPP_API_KEY;
  const instance = instanceOverride || process.env.WHATSAPP_INSTANCE;
  if (!url || !apiKey || !instance) {
    throw new Error("Evolution API não configurada");
  }
  const res = await fetch(`${url}/message/sendText/${instance}`, {
    method: "POST",
    headers: { apikey: apiKey, "content-type": "application/json" },
    body: JSON.stringify({ number: phone, text: message }),
  });
  if (!res.ok) {
    throw new Error(`Evolution error ${res.status}: ${await res.text()}`);
  }
}

async function sendViaZapi(phone: string, message: string): Promise<void> {
  const url = process.env.WHATSAPP_API_URL;
  const token = process.env.WHATSAPP_API_KEY;
  if (!url || !token) throw new Error("Z-API não configurada");
  const res = await fetch(`${url}/send-text`, {
    method: "POST",
    headers: { "client-token": token, "content-type": "application/json" },
    body: JSON.stringify({ phone, message }),
  });
  if (!res.ok) {
    throw new Error(`Z-API error ${res.status}: ${await res.text()}`);
  }
}
