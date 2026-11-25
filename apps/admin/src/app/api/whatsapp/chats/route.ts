import { NextResponse } from "next/server";
import { evolutionRequest, isEvolutionServerConfigured } from "@/lib/evolution";
import {
  normalizeEvolutionChats,
  type WhatsAppChatSummary,
} from "@/lib/evolution-chat";
import { createAdminClient } from "@/lib/supabase/admin";
import { instanceStatus } from "@/lib/whatsapp-instances";
import {
  getWhatsAppAccessContext,
  WhatsAppAccessError,
  type WhatsAppAccessibleInstance,
} from "@/lib/whatsapp-routing";

export async function GET() {
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

  try {
    const context = await getWhatsAppAccessContext();
    if (!context.routingAvailable) return legacyChats(context.legacyInstance);
    if (!context.instances.length) {
      return NextResponse.json(
        {
          chats: [],
          instances: [],
          error: "Seu usuário não possui acesso a nenhum setor do WhatsApp",
        },
        { status: 403 }
      );
    }

    const statuses = await Promise.all(
      context.instances.map((instance) => instanceStatus(instance))
    );
    const statusById = new Map(statuses.map((item) => [item.id, item]));
    const fetched = await Promise.all(
      context.instances.map(async (instance) => {
        if (!instance.active) return { instance, chats: [] as WhatsAppChatSummary[] };
        try {
          const payload = await evolutionRequest(
            `chat/findChats/${encodeURIComponent(instance.instanceName)}`,
            { method: "POST", body: { take: 200, skip: 0 } }
          );
          return { instance, chats: normalizeEvolutionChats(payload) };
        } catch {
          return { instance, chats: [] as WhatsAppChatSummary[] };
        }
      })
    );

    const admin = createAdminClient();
    await refreshConversationCache(admin, context.storeId, fetched);
    const instanceIds = context.instances.map((instance) => instance.id);
    const { data: rows, error } = await admin
      .from("whatsapp_conversations")
      .select(
        `id, remote_jid, current_instance_id, contact_name, phone, avatar_url,
         last_message, last_message_from_me, last_message_at, unread_count`
      )
      .eq("store_id", context.storeId)
      .in("current_instance_id", instanceIds)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(500);
    if (error) throw error;

    const instanceById = new Map(
      context.instances.map((instance) => [instance.id, instance])
    );
    const chats: WhatsAppChatSummary[] = (rows ?? []).flatMap((row) => {
      const instance = instanceById.get(String(row.current_instance_id));
      if (!instance) return [];
      const status = statusById.get(instance.id);
      return [
        {
          id: String(row.id),
          remoteJid: String(row.remote_jid),
          name: String(row.contact_name || "Contato do WhatsApp"),
          phone: typeof row.phone === "string" ? row.phone : null,
          avatarUrl:
            typeof row.avatar_url === "string" ? row.avatar_url : null,
          lastMessage: String(row.last_message || "Sem prévia"),
          lastMessageFromMe: row.last_message_from_me === true,
          lastMessageAt:
            typeof row.last_message_at === "string" ? row.last_message_at : null,
          unreadCount: Math.max(0, Number(row.unread_count) || 0),
          instanceId: instance.id,
          instanceName: instance.instanceName,
          instanceLabel: instance.label,
          sectorId: instance.sectorId,
          sectorName: instance.sectorName,
          connectionState: status?.state ?? "unknown",
          available: instance.active && status?.state === "open",
        },
      ];
    });

    return NextResponse.json(
      {
        chats,
        instances: statuses.map(publicInstanceStatus),
        routingAvailable: true,
        refreshedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const status = error instanceof WhatsAppAccessError ? error.status : 502;
    return NextResponse.json(
      { error: (error as Error).message || "Não foi possível carregar as conversas" },
      { status }
    );
  }
}

async function legacyChats(instance: string | null) {
  if (!instance) {
    return NextResponse.json(
      { error: "Conecte o WhatsApp nas Configurações para visualizar as conversas" },
      { status: 409 }
    );
  }
  try {
    const payload = await evolutionRequest(
      `chat/findChats/${encodeURIComponent(instance)}`,
      { method: "POST", body: { take: 200, skip: 0 } }
    );
    const chats = normalizeEvolutionChats(payload).map((chat) => ({
      ...chat,
      remoteJid: chat.id,
      instanceName: instance,
      instanceLabel: "WhatsApp principal",
      sectorName: "Geral",
      connectionState: "open" as const,
      available: true,
    }));
    return NextResponse.json(
      { chats, instances: [], routingAvailable: false },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Não foi possível carregar as conversas" },
      { status: 502 }
    );
  }
}

async function refreshConversationCache(
  admin: ReturnType<typeof createAdminClient>,
  storeId: string,
  sources: Array<{
    instance: WhatsAppAccessibleInstance;
    chats: WhatsAppChatSummary[];
  }>
) {
  const remoteJids = Array.from(
    new Set(sources.flatMap((source) => source.chats.map((chat) => chat.id)))
  );
  if (!remoteJids.length) return;

  const { data: existing, error: existingError } = await admin
    .from("whatsapp_conversations")
    .select("id, remote_jid, current_instance_id")
    .eq("store_id", storeId)
    .in("remote_jid", remoteJids);
  if (existingError) throw existingError;
  const existingByJid = new Map(
    (existing ?? []).map((row) => [String(row.remote_jid), row])
  );
  const candidates = new Map<
    string,
    Array<{ instance: WhatsAppAccessibleInstance; chat: WhatsAppChatSummary }>
  >();
  for (const source of sources) {
    for (const chat of source.chats) {
      const list = candidates.get(chat.id) ?? [];
      list.push({ instance: source.instance, chat });
      candidates.set(chat.id, list);
    }
  }

  const rows = Array.from(candidates.entries()).flatMap(([remoteJid, list]) => {
    const current = existingByJid.get(remoteJid);
    const selected = current
      ? list.find(
          (item) => item.instance.id === String(current.current_instance_id)
        )
      : list.sort(
          (a, b) => dateValue(b.chat.lastMessageAt) - dateValue(a.chat.lastMessageAt)
        )[0];
    if (!selected) return [];
    return [
      {
        ...(current ? { id: current.id } : {}),
        store_id: storeId,
        remote_jid: remoteJid,
        current_instance_id: selected.instance.id,
        contact_name: selected.chat.name,
        phone: selected.chat.phone,
        avatar_url: selected.chat.avatarUrl,
        last_message: selected.chat.lastMessage,
        last_message_from_me: selected.chat.lastMessageFromMe,
        last_message_at: selected.chat.lastMessageAt,
        unread_count: selected.chat.unreadCount,
      },
    ];
  });
  if (!rows.length) return;
  const { error } = await admin
    .from("whatsapp_conversations")
    .upsert(rows, { onConflict: "store_id,remote_jid" });
  if (error) throw error;
}

function publicInstanceStatus(
  instance: Awaited<ReturnType<typeof instanceStatus>>
) {
  return {
    id: instance.id,
    label: instance.label,
    phoneNumber: instance.phoneNumber,
    sectorId: instance.sectorId,
    sectorName: instance.sectorName,
    state: instance.state,
    active: instance.active,
    available: instance.active && instance.state === "open",
    error: instance.error,
  };
}

function dateValue(value: string | null): number {
  return value ? new Date(value).getTime() || 0 : 0;
}
