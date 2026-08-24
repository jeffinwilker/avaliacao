// Envio de WhatsApp via Evolution API ou Z-API.
// Configure WHATSAPP_PROVIDER=evolution|zapi nas variáveis de ambiente.

interface SendWhatsAppInput {
  phone: string; // E.164: +5511999998888 (a gente normaliza)
  message: string;
  instance?: string | null;
  mediaUrl?: string | null;
}

export async function sendWhatsApp({
  phone,
  message,
  instance,
  mediaUrl,
}: SendWhatsAppInput): Promise<void> {
  const provider = process.env.WHATSAPP_PROVIDER ?? "evolution";
  const normalized = normalizePhone(phone);

  if (provider === "evolution") {
    return sendViaEvolution(normalized, message, instance, mediaUrl);
  }
  if (provider === "zapi") {
    return sendViaZapi(normalized, message, mediaUrl);
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
  instanceOverride?: string | null,
  mediaUrl?: string | null
): Promise<void> {
  const url = process.env.WHATSAPP_API_URL;
  const apiKey = process.env.WHATSAPP_API_KEY;
  const instance = instanceOverride || process.env.WHATSAPP_INSTANCE;
  if (!url || !apiKey || !instance) {
    throw new Error("Evolution API não configurada");
  }
  const endpoint = mediaUrl ? "sendMedia" : "sendText";
  const fileName = mediaUrl ? fileNameFromUrl(mediaUrl) : null;
  const body = mediaUrl
    ? {
        number: phone,
        mediatype: "image",
        mimetype: inferImageMimeType(mediaUrl),
        media: mediaUrl,
        caption: message,
        fileName,
      }
    : { number: phone, text: message };
  const res = await fetch(`${url.replace(/\/$/, "")}/message/${endpoint}/${instance}`, {
    method: "POST",
    headers: { apikey: apiKey, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Evolution error ${res.status}: ${await res.text()}`);
  }
}

async function sendViaZapi(
  phone: string,
  message: string,
  mediaUrl?: string | null
): Promise<void> {
  const url = process.env.WHATSAPP_API_URL;
  const token = process.env.WHATSAPP_API_KEY;
  if (!url || !token) throw new Error("Z-API não configurada");
  const res = await fetch(`${url.replace(/\/$/, "")}/${mediaUrl ? "send-image" : "send-text"}`, {
    method: "POST",
    headers: { "client-token": token, "content-type": "application/json" },
    body: JSON.stringify(
      mediaUrl
        ? { phone, image: mediaUrl, caption: message }
        : { phone, message }
    ),
  });
  if (!res.ok) {
    throw new Error(`Z-API error ${res.status}: ${await res.text()}`);
  }
}

function inferImageMimeType(value: string): string {
  const clean = value.split("?")[0].toLowerCase();
  if (clean.endsWith(".png")) return "image/png";
  if (clean.endsWith(".webp")) return "image/webp";
  if (clean.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}

function fileNameFromUrl(value: string): string {
  try {
    return decodeURIComponent(new URL(value).pathname.split("/").pop() || "imagem.jpg");
  } catch {
    return "imagem.jpg";
  }
}
