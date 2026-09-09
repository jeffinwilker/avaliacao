import { NextResponse, type NextRequest } from "next/server";
import { evolutionRequest, isEvolutionServerConfigured } from "@/lib/evolution";
import {
  findEvolutionMessage,
  isEvolutionImageMessage,
} from "@/lib/evolution-chat";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_BASE64_LENGTH = 32_000_000;

export async function GET(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if ((process.env.WHATSAPP_PROVIDER ?? "evolution") !== "evolution") {
    return NextResponse.json(
      { error: "A visualização de imagens está disponível para a Evolution API" },
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
  const messageId = req.nextUrl.searchParams.get("id")?.trim() ?? "";
  if (!isValidRemoteJid(remoteJid) || !isValidMessageId(messageId)) {
    return NextResponse.json({ error: "Imagem inválida" }, { status: 400 });
  }

  const instance = await getInstanceName();
  if (!instance) {
    return NextResponse.json(
      { error: "Conecte o WhatsApp para visualizar as imagens" },
      { status: 409 }
    );
  }

  try {
    const messagesPayload = await evolutionRequest(
      `chat/findMessages/${encodeURIComponent(instance)}`,
      {
        method: "POST",
        body: {
          where: { key: { remoteJid, id: messageId } },
          offset: 100,
          page: 1,
          limit: 100,
        },
      }
    );
    const message = findEvolutionMessage(
      messagesPayload,
      remoteJid,
      messageId
    );
    if (!message || !isEvolutionImageMessage(message)) {
      return NextResponse.json(
        { error: "A imagem não está mais disponível no histórico" },
        { status: 404 }
      );
    }

    const mediaPayload = await evolutionRequest(
      `chat/getBase64FromMediaMessage/${encodeURIComponent(instance)}`,
      {
        method: "POST",
        body: { message, convertToMp4: false },
      }
    );
    const media = decodeImage(mediaPayload);
    if (!media) {
      return NextResponse.json(
        { error: "A Evolution não devolveu o conteúdo desta imagem" },
        { status: 404 }
      );
    }

    const responseBody = media.bytes.buffer.slice(
      media.bytes.byteOffset,
      media.bytes.byteOffset + media.bytes.byteLength
    ) as ArrayBuffer;
    return new NextResponse(responseBody, {
      status: 200,
      headers: {
        "Content-Type": media.mimeType,
        "Content-Length": String(media.bytes.byteLength),
        "Cache-Control": "private, max-age=3600",
        "Content-Disposition": `inline; filename="whatsapp-${safeFileName(messageId)}.${extensionFor(media.mimeType)}"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          (error as Error).message ||
          "Não foi possível carregar a imagem desta mensagem",
      },
      { status: 502 }
    );
  }
}

function decodeImage(
  payload: unknown
): { bytes: Uint8Array; mimeType: string } | null {
  const root = asRecord(payload);
  const data = asRecord(root?.data);
  const raw = firstString(root?.base64, data?.base64);
  const bufferValue = root?.buffer ?? data?.buffer ?? root?.base64;
  const bufferRecord = asRecord(bufferValue);
  let encoded = raw;
  let mimeType = normalizeImageMime(
    firstString(root?.mimetype, root?.mimeType, data?.mimetype, data?.mimeType)
  );

  if (encoded?.startsWith("data:")) {
    const match = encoded.match(/^data:([^;,]+);base64,(.+)$/s);
    if (!match) return null;
    mimeType = normalizeImageMime(match[1]);
    encoded = match[2];
  }

  if (encoded) {
    const compact = encoded.replace(/\s/g, "");
    if (!mimeType || compact.length > MAX_BASE64_LENGTH) return null;
    const bytes = Uint8Array.from(Buffer.from(compact, "base64"));
    return bytes.byteLength ? { bytes, mimeType } : null;
  }

  if (Array.isArray(bufferRecord?.data) && mimeType) {
    const numbers = bufferRecord.data.filter(
      (value): value is number =>
        typeof value === "number" && value >= 0 && value <= 255
    );
    if (!numbers.length || numbers.length > MAX_BASE64_LENGTH) return null;
    return { bytes: Uint8Array.from(numbers), mimeType };
  }

  return null;
}

function normalizeImageMime(value: string | undefined): string | null {
  if (!value) return "image/jpeg";
  const mimeType = value.split(";")[0].trim().toLowerCase();
  return mimeType.startsWith("image/") ? mimeType : null;
}

function extensionFor(mimeType: string): string {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/gif") return "gif";
  return "jpg";
}

function safeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80) || "imagem";
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

function isValidMessageId(value: string): boolean {
  return (
    value.length >= 3 &&
    value.length <= 200 &&
    /^[a-zA-Z0-9_.:@-]+$/.test(value)
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
