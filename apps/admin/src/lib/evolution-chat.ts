export interface WhatsAppChatSummary {
  id: string;
  name: string;
  phone: string | null;
  avatarUrl: string | null;
  lastMessage: string;
  lastMessageFromMe: boolean;
  lastMessageAt: string | null;
  unreadCount: number;
}

export interface WhatsAppMessageView {
  id: string;
  fromMe: boolean;
  text: string;
  type: string;
  mediaKind: "image" | "sticker" | null;
  mediaUrl: string | null;
  sentAt: string;
  status: string | null;
}

export function normalizeEvolutionChats(payload: unknown): WhatsAppChatSummary[] {
  const rows = arrayFromPayload(payload, ["chats", "records", "data"]);
  return rows
    .flatMap((value): WhatsAppChatSummary[] => {
      const row = asRecord(value);
      if (!row) return [];
      const lastMessage = asRecord(row.lastMessage);
      const key = asRecord(lastMessage?.key);
      const remoteJid = firstString(row.remoteJid, key?.remoteJid);
      if (!remoteJid || !isDirectConversation(remoteJid)) return [];

      const phone = phoneFromJid(remoteJid);
      const lastMessageFromMe = toBoolean(key?.fromMe);
      return [
        {
          id: remoteJid,
          name:
            meaningfulName(row.pushName) ||
            meaningfulName(row.name) ||
            (!lastMessageFromMe ? meaningfulName(lastMessage?.pushName) : null) ||
            (phone ? formatPhone(phone) : "Contato do WhatsApp"),
          phone: phone ? formatPhone(phone) : null,
          avatarUrl: safeHttpUrl(row.profilePicUrl),
          lastMessage: messageText(lastMessage).slice(0, 240),
          lastMessageFromMe,
          lastMessageAt: toIsoDate(
            firstDefined(
              lastMessage?.messageTimestamp,
              row.updatedAt,
              row.updated_at
            )
          ),
          unreadCount: Math.max(
            0,
            Number(row.unreadCount ?? row.unreadMessages) || 0
          ),
        },
      ];
    })
    .sort(
      (a, b) =>
        dateValue(b.lastMessageAt) - dateValue(a.lastMessageAt)
    );
}

export function normalizeEvolutionMessages(
  payload: unknown,
  remoteJid: string
): WhatsAppMessageView[] {
  const rows = messageRows(payload);
  const seen = new Set<string>();
  return rows
    .flatMap((value, index): WhatsAppMessageView[] => {
      const row = asRecord(value);
      if (!row) return [];
      const key = asRecord(row.key);
      const messageJid = firstString(key?.remoteJid, key?.remoteJidAlt);
      if (messageJid && messageJid !== remoteJid) return [];

      const sentAt = toIsoDate(
        firstDefined(row.messageTimestamp, row.timestamp, row.createdAt)
      );
      if (!sentAt) return [];
      const id =
        firstString(key?.id, row.id) || `${remoteJid}:${sentAt}:${index}`;
      if (seen.has(id)) return [];
      seen.add(id);

      return [
        {
          id,
          fromMe: toBoolean(key?.fromMe),
          text: messageText(row).slice(0, 4_000),
          type: messageType(row),
          mediaKind: imageMediaKind(row),
          mediaUrl: null,
          sentAt,
          status: messageStatus(row),
        },
      ];
    })
    .sort((a, b) => dateValue(a.sentAt) - dateValue(b.sentAt));
}

export function findEvolutionMessage(
  payload: unknown,
  remoteJid: string,
  messageId: string
): Record<string, unknown> | null {
  for (const value of messageRows(payload)) {
    const row = asRecord(value);
    const key = asRecord(row?.key);
    const rowId = firstString(key?.id, row?.id);
    const rowJid = firstString(key?.remoteJid, key?.remoteJidAlt);
    if (row && rowId === messageId && (!rowJid || rowJid === remoteJid)) {
      return row;
    }
  }
  return null;
}

export function isEvolutionImageMessage(
  value: Record<string, unknown>
): boolean {
  return imageMediaKind(value) !== null;
}

function messageRows(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const root = asRecord(payload);
  const messages = asRecord(root?.messages);
  const data = asRecord(root?.data);
  const dataMessages = asRecord(data?.messages);
  for (const candidate of [
    messages?.records,
    root?.messages,
    root?.records,
    dataMessages?.records,
    data?.records,
    root?.data,
  ]) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

function arrayFromPayload(payload: unknown, keys: string[]): unknown[] {
  if (Array.isArray(payload)) return payload;
  const root = asRecord(payload);
  for (const key of keys) {
    const value = root?.[key];
    if (Array.isArray(value)) return value;
    const nested = asRecord(value);
    if (Array.isArray(nested?.records)) return nested.records;
  }
  return [];
}

function messageText(value: Record<string, unknown> | null): string {
  if (!value) return "Mensagem";
  if (typeof value.message === "string") return value.message;
  const message = unwrapMessage(asRecord(value.message));
  if (!message) return messageTypeLabel(value.messageType);

  const extended = asRecord(message.extendedTextMessage);
  const image = asRecord(message.imageMessage);
  const video = asRecord(message.videoMessage);
  const document = asRecord(message.documentMessage);
  const documentCaption = asRecord(message.documentWithCaptionMessage);
  const buttons = asRecord(message.buttonsResponseMessage);
  const list = asRecord(message.listResponseMessage);
  const template = asRecord(message.templateButtonReplyMessage);
  const interactive = asRecord(message.interactiveResponseMessage);
  const interactiveBody = asRecord(interactive?.body);

  const text = firstString(
    message.conversation,
    extended?.text,
    image?.caption,
    video?.caption,
    document?.caption,
    documentCaption?.caption,
    buttons?.selectedDisplayText,
    list?.title,
    template?.selectedDisplayText,
    interactiveBody?.text
  );
  if (text) return text;

  if (message.imageMessage) return "Imagem";
  if (message.videoMessage || message.ptvMessage) return "Vídeo";
  if (message.audioMessage) return "Áudio";
  if (message.stickerMessage) return "Figurinha";
  if (message.documentMessage || message.documentWithCaptionMessage) {
    return firstString(document?.fileName, document?.name) || "Documento";
  }
  if (message.contactMessage || message.contactsArrayMessage) return "Contato";
  if (message.locationMessage || message.liveLocationMessage) return "Localização";
  if (message.reactionMessage) return "Reação";
  return messageTypeLabel(value.messageType);
}

function messageType(value: Record<string, unknown>): string {
  const explicit = firstString(value.messageType);
  if (explicit) return explicit;
  const message = asRecord(value.message);
  return message ? Object.keys(message)[0] || "message" : "message";
}

function imageMediaKind(
  value: Record<string, unknown>
): "image" | "sticker" | null {
  const explicit = firstString(value.messageType)?.toLowerCase() ?? "";
  if (explicit.includes("image")) return "image";
  if (explicit.includes("sticker")) return "sticker";

  const message = unwrapMessage(asRecord(value.message));
  if (message?.imageMessage) return "image";
  if (message?.stickerMessage) return "sticker";
  return null;
}

function unwrapMessage(
  initial: Record<string, unknown> | null
): Record<string, unknown> | null {
  let message = initial;
  for (let depth = 0; message && depth < 5; depth += 1) {
    const wrapper =
      asRecord(message.ephemeralMessage) ??
      asRecord(message.viewOnceMessage) ??
      asRecord(message.viewOnceMessageV2) ??
      asRecord(message.viewOnceMessageV2Extension) ??
      asRecord(message.documentWithCaptionMessage);
    const nested = asRecord(wrapper?.message);
    if (!nested) return message;
    message = nested;
  }
  return message;
}

function messageTypeLabel(value: unknown): string {
  const type = typeof value === "string" ? value.toLowerCase() : "";
  if (type.includes("image")) return "Imagem";
  if (type.includes("video") || type.includes("ptv")) return "Vídeo";
  if (type.includes("audio")) return "Áudio";
  if (type.includes("sticker")) return "Figurinha";
  if (type.includes("document")) return "Documento";
  if (type.includes("contact")) return "Contato";
  if (type.includes("location")) return "Localização";
  return "Mensagem";
}

function messageStatus(value: Record<string, unknown>): string | null {
  const updates = Array.isArray(value.MessageUpdate)
    ? value.MessageUpdate
    : Array.isArray(value.messageUpdate)
      ? value.messageUpdate
      : [];
  const latest = asRecord(updates.at(-1));
  return firstString(latest?.status, value.status) ?? null;
}

function meaningfulName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  if (!name || name.toLowerCase() === "você" || /^\d{8,}$/.test(name)) {
    return null;
  }
  return name.slice(0, 100);
}

function isDirectConversation(remoteJid: string): boolean {
  const jid = remoteJid.toLowerCase();
  return (
    !jid.endsWith("@g.us") &&
    !jid.includes("broadcast") &&
    !jid.includes("newsletter") &&
    (jid.endsWith("@s.whatsapp.net") ||
      jid.endsWith("@c.us") ||
      jid.endsWith("@lid"))
  );
}

function phoneFromJid(remoteJid: string): string | null {
  if (remoteJid.toLowerCase().endsWith("@lid")) return null;
  const phone = remoteJid.split("@")[0].split(":")[0].replace(/\D/g, "");
  return phone.length >= 8 ? phone : null;
}

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length >= 12) {
    const area = digits.slice(2, 4);
    const number = digits.slice(4);
    const splitAt = number.length === 9 ? 5 : 4;
    return `+55 (${area}) ${number.slice(0, splitAt)}-${number.slice(splitAt)}`;
  }
  return `+${digits}`;
}

function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? value : null;
  } catch {
    return null;
  }
}

function toBoolean(value: unknown): boolean {
  return value === true || value === "true" || value === 1;
}

function toIsoDate(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const milliseconds = value > 10_000_000_000 ? value : value * 1_000;
    return new Date(milliseconds).toISOString();
  }
  if (typeof value !== "string" || !value) return null;
  if (/^\d+$/.test(value)) return toIsoDate(Number(value));
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function dateValue(value: string | null): number {
  return value ? new Date(value).getTime() || 0 : 0;
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

function firstDefined(...values: unknown[]): unknown {
  return values.find((value) => value !== undefined && value !== null);
}
