import { NextResponse, type NextRequest } from "next/server";
import { evolutionRequest, isEvolutionServerConfigured } from "@/lib/evolution";
import {
  normalizeEvolutionMessages,
  type WhatsAppMessageView,
} from "@/lib/evolution-chat";
import { createAdminClient } from "@/lib/supabase/admin";
import { instanceStatus } from "@/lib/whatsapp-instances";
import {
  accessibleInstance,
  getWhatsAppAccessContext,
  WhatsAppAccessError,
  type WhatsAppAccessContext,
  type WhatsAppAccessibleInstance,
} from "@/lib/whatsapp-routing";

const MAX_TEXT_LENGTH = 4_000;
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function GET(req: NextRequest) {
  const providerError = constProviderError();
  if (providerError) return providerError;
  try {
    const context = await getWhatsAppAccessContext();
    if (!context.routingAvailable) {
      return legacyMessages(req, context.legacyInstance);
    }

    const conversationId = req.nextUrl.searchParams.get("conversationId")?.trim() ?? "";
    if (!isUuid(conversationId)) {
      return NextResponse.json({ error: "Conversa inválida" }, { status: 400 });
    }
    const admin = createAdminClient();
    const conversation = await loadConversation(admin, context, conversationId);
    const events = await loadTransferEvents(admin, context, conversationId);
    const instanceIds = Array.from(
      new Set([
        conversation.currentInstanceId,
        ...events.flatMap((event) => [event.fromInstanceId, event.toInstanceId]),
      ].filter((value): value is string => Boolean(value)))
    );
    const sources = await loadHistoryInstances(admin, context.storeId, instanceIds);

    const results = await Promise.all(
      sources.map(async (instance) => {
        try {
          const payload = await evolutionRequest(
            `chat/findMessages/${encodeURIComponent(instance.instanceName)}`,
            {
              method: "POST",
              body: {
                where: { key: { remoteJid: conversation.remoteJid } },
                offset: 100,
                page: 1,
                limit: 100,
              },
            }
          );
          const messages = normalizeEvolutionMessages(
            payload,
            conversation.remoteJid
          ).map((message) => decorateMessage(message, instance, conversationId));
          return { messages, error: null as string | null };
        } catch (error) {
          return { messages: [] as WhatsAppMessageView[], error: (error as Error).message };
        }
      })
    );
    const systemMessages: WhatsAppMessageView[] = events.map((event) => ({
      id: `event:${event.id}`,
      fromMe: false,
      text: event.description,
      type: "system",
      mediaKind: null,
      mediaUrl: null,
      sentAt: event.createdAt,
      status: null,
      kind: "system",
      sourceInstanceId: event.toInstanceId,
      sourceInstanceLabel: null,
      sourceMessageId: null,
    }));
    const messages = [...results.flatMap((result) => result.messages), ...systemMessages]
      .filter(uniqueMessage())
      .sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime());
    const current = accessibleInstance(context, conversation.currentInstanceId);
    const currentStatus = await instanceStatus(current);

    return NextResponse.json(
      {
        messages,
        unavailable: !current.active || currentStatus.state !== "open",
        currentInstance: {
          id: current.id,
          label: current.label,
          sectorName: current.sectorName,
          state: currentStatus.state,
          active: current.active,
          error: currentStatus.error,
        },
        historyWarnings: results.flatMap((result) => result.error ? [result.error] : []),
        refreshedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return accessErrorResponse(error, "Não foi possível carregar as mensagens");
  }
}

export async function POST(req: NextRequest) {
  const providerError = constProviderError();
  if (providerError) return providerError;
  try {
    const context = await getWhatsAppAccessContext();
    const formData = await req.formData();
    const text = String(formData.get("text") ?? "").trim();
    const imageValue = formData.get("image");
    const image = imageValue instanceof File && imageValue.size > 0 ? imageValue : null;
    const validation = validateOutgoing(text, image);
    if (validation) return validation;

    if (!context.routingAvailable) {
      const remoteJid = String(formData.get("jid") ?? "").trim();
      return sendLegacyMessage(context.legacyInstance, remoteJid, text, image);
    }

    const conversationId = String(formData.get("conversationId") ?? "").trim();
    if (!isUuid(conversationId)) {
      return NextResponse.json({ error: "Conversa inválida" }, { status: 400 });
    }
    const admin = createAdminClient();
    const conversation = await loadConversation(admin, context, conversationId);
    const instance = accessibleInstance(context, conversation.currentInstanceId);
    const status = await instanceStatus(instance);
    if (!instance.active || status.state !== "open") {
      return NextResponse.json(
        {
          error: "O telefone desta conversa está desconectado",
          code: "PHONE_UNAVAILABLE",
          instance: {
            id: instance.id,
            label: instance.label,
            sectorName: instance.sectorName,
            state: status.state,
          },
        },
        { status: 409 }
      );
    }

    const payload = await sendEvolutionMessage(
      instance.instanceName,
      conversation.remoteJid,
      text,
      image
    );
    const message = outgoingView(
      payload,
      conversation.remoteJid,
      text,
      image,
      instance
    );
    await admin
      .from("whatsapp_conversations")
      .update({
        last_message: text || "Imagem",
        last_message_from_me: true,
        last_message_at: message.sentAt,
        unread_count: 0,
      })
      .eq("id", conversationId)
      .eq("store_id", context.storeId);

    return NextResponse.json(
      { message },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return accessErrorResponse(error, "Não foi possível enviar a mensagem");
  }
}

function constProviderError(): NextResponse | null {
  if ((process.env.WHATSAPP_PROVIDER ?? "evolution") !== "evolution") {
    return NextResponse.json(
      { error: "O chat está disponível para a Evolution API" },
      { status: 409 }
    );
  }
  if (!isEvolutionServerConfigured()) {
    return NextResponse.json(
      { error: "O servidor do WhatsApp ainda não está configurado" },
      { status: 503 }
    );
  }
  return null;
}

async function loadConversation(
  admin: ReturnType<typeof createAdminClient>,
  context: WhatsAppAccessContext,
  conversationId: string
) {
  const { data, error } = await admin
    .from("whatsapp_conversations")
    .select("id, remote_jid, current_instance_id")
    .eq("id", conversationId)
    .eq("store_id", context.storeId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new WhatsAppAccessError("Conversa não encontrada", 404);
  accessibleInstance(context, String(data.current_instance_id));
  return {
    id: String(data.id),
    remoteJid: String(data.remote_jid),
    currentInstanceId: String(data.current_instance_id),
  };
}

async function loadTransferEvents(
  admin: ReturnType<typeof createAdminClient>,
  context: WhatsAppAccessContext,
  conversationId: string
) {
  const { data, error } = await admin
    .from("whatsapp_conversation_events")
    .select("id, from_instance_id, to_instance_id, description, created_at")
    .eq("store_id", context.storeId)
    .eq("conversation_id", conversationId)
    .eq("status", "completed")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: String(row.id),
    fromInstanceId: row.from_instance_id ? String(row.from_instance_id) : null,
    toInstanceId: row.to_instance_id ? String(row.to_instance_id) : null,
    description: String(row.description),
    createdAt: String(row.created_at),
  }));
}

async function loadHistoryInstances(
  admin: ReturnType<typeof createAdminClient>,
  storeId: string,
  instanceIds: string[]
): Promise<WhatsAppAccessibleInstance[]> {
  if (!instanceIds.length) return [];
  const { data: rows, error } = await admin
    .from("whatsapp_instances")
    .select("id, store_id, sector_id, instance_name, label, phone_number, active")
    .eq("store_id", storeId)
    .in("id", instanceIds);
  if (error) throw error;

  const sectorIds = Array.from(
    new Set(
      (rows ?? [])
        .map((row) => row.sector_id && String(row.sector_id))
        .filter((value): value is string => Boolean(value))
    )
  );
  const sectorNames = new Map<string, string>();
  if (sectorIds.length) {
    const { data: sectors, error: sectorError } = await admin
      .from("whatsapp_sectors")
      .select("id, name")
      .eq("store_id", storeId)
      .in("id", sectorIds);
    if (sectorError) throw sectorError;
    for (const sector of sectors ?? []) {
      sectorNames.set(String(sector.id), String(sector.name));
    }
  }

  return (rows ?? []).map((row) => ({
    id: String(row.id),
    storeId: String(row.store_id),
    sectorId: row.sector_id ? String(row.sector_id) : null,
    sectorName: row.sector_id
      ? sectorNames.get(String(row.sector_id)) ?? "Sem setor"
      : "Sem setor",
    instanceName: String(row.instance_name),
    label: String(row.label),
    phoneNumber: typeof row.phone_number === "string" ? row.phone_number : null,
    active: row.active !== false,
  }));
}

function decorateMessage(
  message: WhatsAppMessageView,
  instance: WhatsAppAccessibleInstance,
  conversationId: string
): WhatsAppMessageView {
  return {
    ...message,
    id: `${instance.id}:${message.id}`,
    kind: "message",
    sourceInstanceId: instance.id,
    sourceInstanceLabel: instance.label,
    sourceMessageId: message.id,
    mediaUrl: message.mediaKind
      ? `/api/whatsapp/media?conversationId=${encodeURIComponent(conversationId)}&instanceId=${encodeURIComponent(instance.id)}&id=${encodeURIComponent(message.id)}`
      : null,
  };
}

function validateOutgoing(text: string, image: File | null): NextResponse | null {
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
  return null;
}

async function sendEvolutionMessage(
  instanceName: string,
  remoteJid: string,
  text: string,
  image: File | null
) {
  if (!isValidRemoteJid(remoteJid)) throw new Error("Conversa inválida");
  const recipient = evolutionRecipient(remoteJid);
  if (image) {
    const bytes = Buffer.from(await image.arrayBuffer());
    return evolutionRequest(`message/sendMedia/${encodeURIComponent(instanceName)}`, {
      method: "POST",
      body: {
        number: recipient,
        mediatype: "image",
        mimetype: image.type,
        media: `data:${image.type};base64,${bytes.toString("base64")}`,
        caption: text,
        fileName: safeFileName(image.name, image.type),
      },
    });
  }
  return evolutionRequest(`message/sendText/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    body: { number: recipient, text },
  });
}

function outgoingView(
  payload: unknown,
  remoteJid: string,
  text: string,
  image: File | null,
  instance?: WhatsAppAccessibleInstance
): WhatsAppMessageView {
  const normalized = normalizeEvolutionMessages([payload], remoteJid)[0];
  const rawId = normalized?.id || outgoingMessageId(payload) || `sent:${Date.now()}`;
  return {
    ...(normalized ?? {
      id: rawId,
      fromMe: true,
      text: text || "Imagem",
      type: image ? "imageMessage" : "conversation",
      mediaKind: image ? "image" as const : null,
      mediaUrl: null,
      sentAt: new Date().toISOString(),
      status: outgoingMessageStatus(payload) || "PENDING",
    }),
    id: instance ? `${instance.id}:${rawId}` : rawId,
    kind: "message",
    sourceInstanceId: instance?.id ?? null,
    sourceInstanceLabel: instance?.label ?? null,
    sourceMessageId: rawId,
    mediaUrl: null,
  };
}

async function legacyMessages(req: NextRequest, instance: string | null) {
  const remoteJid = req.nextUrl.searchParams.get("jid")?.trim() ?? "";
  if (!instance || !isValidRemoteJid(remoteJid)) {
    return NextResponse.json({ error: "Conversa inválida" }, { status: 400 });
  }
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
  const messages = normalizeEvolutionMessages(payload, remoteJid).map((message) => ({
    ...message,
    mediaUrl: message.mediaKind
      ? `/api/whatsapp/media?jid=${encodeURIComponent(remoteJid)}&id=${encodeURIComponent(message.id)}`
      : null,
  }));
  return NextResponse.json({ messages, unavailable: false });
}

async function sendLegacyMessage(
  instance: string | null,
  remoteJid: string,
  text: string,
  image: File | null
) {
  if (!instance) {
    return NextResponse.json({ error: "Conecte o WhatsApp antes de enviar" }, { status: 409 });
  }
  const payload = await sendEvolutionMessage(instance, remoteJid, text, image);
  return NextResponse.json({ message: outgoingView(payload, remoteJid, text, image) });
}

function uniqueMessage() {
  const seen = new Set<string>();
  return (message: WhatsAppMessageView) => {
    if (seen.has(message.id)) return false;
    seen.add(message.id);
    return true;
  };
}

function accessErrorResponse(error: unknown, fallback: string) {
  const status = error instanceof WhatsAppAccessError ? error.status : 502;
  return NextResponse.json(
    { error: (error as Error).message || fallback },
    { status }
  );
}

function isValidRemoteJid(value: string): boolean {
  return value.length >= 8 && value.length <= 150 && /^[a-zA-Z0-9_.:@-]+$/.test(value) &&
    (value.endsWith("@s.whatsapp.net") || value.endsWith("@c.us") || value.endsWith("@lid"));
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function safeFileName(value: string, mimeType: string): string {
  const extension = mimeType === "image/png" ? ".png" : mimeType === "image/webp" ? ".webp" : ".jpg";
  const base = value.replace(/\.[^.]+$/, "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  return `${base || "imagem"}${extension}`;
}

function evolutionRecipient(remoteJid: string): string {
  return remoteJid.endsWith("@c.us") ? remoteJid.replace(/@c\.us$/, "@s.whatsapp.net") : remoteJid;
}

function outgoingMessageId(payload: unknown): string | null {
  const root = asRecord(payload);
  const key = asRecord(root?.key);
  return firstString(key?.id, root?.id) ?? null;
}

function outgoingMessageStatus(payload: unknown): string | null {
  return firstString(asRecord(payload)?.status) ?? null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function firstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === "string" && value.length > 0);
}
