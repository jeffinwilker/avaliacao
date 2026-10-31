import { NextResponse, type NextRequest } from "next/server";
import { evolutionRequest, isEvolutionServerConfigured } from "@/lib/evolution";
import { normalizeEvolutionMessages } from "@/lib/evolution-chat";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const MAX_TEXT_LENGTH = 4_000;
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export async function GET(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if ((process.env.WHATSAPP_PROVIDER ?? "evolution") !== "evolution") {
    return NextResponse.json(
      { error: "A visualização de conversas está disponível para a Evolution API" },
      { status: 409 }
    );
  }
  if (!isEvolutionServerConfigured()) {
    return NextResponse.json(
      { error: "O servidor do WhatsApp ainda não está configurado" },
      { status: 503 }
    );
  }

  const remoteJid = req.nextUrl.searchParams.get("jid")?.trim() ?? "";
  if (!isValidRemoteJid(remoteJid)) {
    return NextResponse.json({ error: "Conversa inválida" }, { status: 400 });
  }
  const instance = await getInstanceName();
  if (!instance) {
    return NextResponse.json(
      { error: "Conecte o WhatsApp nas Configurações para visualizar as mensagens" },
      { status: 409 }
    );
  }

  try {
    const payload = await evolutionRequest(
      `chat/findMessages/${encodeURIComponent(instance)}`,
      {
        method: "POST",
        body: {
          where: { key: { remoteJid } },
          offset: 100,
          page: 1,
          limit: 100,
        },
      }
    );
    const messages = normalizeEvolutionMessages(payload, remoteJid).map(
      (message) => ({
        ...message,
        mediaUrl: message.mediaKind
          ? `/api/whatsapp/media?jid=${encodeURIComponent(remoteJid)}&id=${encodeURIComponent(message.id)}`
          : null,
      })
    );
    return NextResponse.json(
      {
        messages,
        refreshedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Não foi possível carregar as mensagens" },
      { status: 502 }
    );
  }
}

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if ((process.env.WHATSAPP_PROVIDER ?? "evolution") !== "evolution") {
    return NextResponse.json(
      { error: "O envio pelo chat está disponível para a Evolution API" },
      { status: 409 }
    );
  }
  if (!isEvolutionServerConfigured()) {
    return NextResponse.json(
      { error: "O servidor do WhatsApp ainda não está configurado" },
      { status: 503 }
    );
  }

  const instance = await getInstanceName();
  if (!instance) {
    return NextResponse.json(
      { error: "Conecte o WhatsApp nas Configurações antes de enviar mensagens" },
      { status: 409 }
    );
  }

  try {
    const formData = await req.formData();
    const remoteJid = String(formData.get("jid") ?? "").trim();
    const text = String(formData.get("text") ?? "").trim();
    const imageValue = formData.get("image");
    const image = imageValue instanceof File && imageValue.size > 0
      ? imageValue
      : null;

    if (!isValidRemoteJid(remoteJid)) {
      return NextResponse.json({ error: "Conversa inválida" }, { status: 400 });
    }
    if (!text && !image) {
      return NextResponse.json(
        { error: "Digite uma mensagem ou escolha uma imagem" },
        { status: 400 }
      );
    }
    if (text.length > MAX_TEXT_LENGTH) {
      return NextResponse.json(
        { error: `A mensagem pode ter no máximo ${MAX_TEXT_LENGTH} caracteres` },
        { status: 400 }
      );
    }
    if (image && !ALLOWED_IMAGE_TYPES.has(image.type)) {
      return NextResponse.json(
        { error: "Envie uma imagem JPG, PNG ou WEBP" },
        { status: 400 }
      );
    }
    if (image && image.size > MAX_IMAGE_SIZE) {
      return NextResponse.json(
        { error: "A imagem pode ter no máximo 10 MB" },
        { status: 400 }
      );
    }

    const recipient = evolutionRecipient(remoteJid);
    let payload: unknown;
    if (image) {
      const bytes = Buffer.from(await image.arrayBuffer());
      payload = await evolutionRequest(
        `message/sendMedia/${encodeURIComponent(instance)}`,
        {
          method: "POST",
          body: {
            number: recipient,
            mediatype: "image",
            mimetype: image.type,
            media: `data:${image.type};base64,${bytes.toString("base64")}`,
            caption: text,
            fileName: safeFileName(image.name, image.type),
          },
        }
      );
    } else {
      payload = await evolutionRequest(
        `message/sendText/${encodeURIComponent(instance)}`,
        {
          method: "POST",
          body: { number: recipient, text },
        }
      );
    }

    const normalized = normalizeEvolutionMessages([payload], remoteJid)[0];
    const fallbackTimestamp = new Date().toISOString();
    return NextResponse.json(
      {
        message: normalized
          ? { ...normalized, mediaUrl: null }
          : {
              id: outgoingMessageId(payload) || `sent:${Date.now()}`,
              fromMe: true,
              text: text || "Imagem",
              type: image ? "imageMessage" : "conversation",
              mediaKind: image ? "image" : null,
              mediaUrl: null,
              sentAt: fallbackTimestamp,
              status: outgoingMessageStatus(payload) || "PENDING",
            },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Não foi possível enviar a mensagem" },
      { status: 502 }
    );
  }
}

function isValidRemoteJid(value: string): boolean {
  return (
    value.length >= 8 &&
    value.length <= 150 &&
    /^[a-zA-Z0-9_.:@-]+$/.test(value) &&
    (value.endsWith("@s.whatsapp.net") ||
      value.endsWith("@c.us") ||
      value.endsWith("@lid"))
  );
}

async function isAuthenticated(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return Boolean(user);
}

async function getInstanceName(): Promise<string | null> {
  const admin = createAdminClient();
  const { data: settings } = await admin
    .from("store_settings")
    .select("whatsapp_instance")
    .not("whatsapp_instance", "is", null)
    .limit(1)
    .maybeSingle();
  return settings?.whatsapp_instance ?? null;
}

function safeFileName(value: string, mimeType: string): string {
  const extension = mimeType === "image/png"
    ? ".png"
    : mimeType === "image/webp"
      ? ".webp"
      : ".jpg";
  const base = value
    .replace(/\.[^.]+$/, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${base || "imagem"}${extension}`;
}

function evolutionRecipient(remoteJid: string): string {
  return remoteJid.endsWith("@c.us")
    ? remoteJid.replace(/@c\.us$/, "@s.whatsapp.net")
    : remoteJid;
}

function outgoingMessageId(payload: unknown): string | null {
  const root = asRecord(payload);
  const key = asRecord(root?.key);
  return firstString(key?.id, root?.id) ?? null;
}

function outgoingMessageStatus(payload: unknown): string | null {
  const root = asRecord(payload);
  return firstString(root?.status) ?? null;
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
