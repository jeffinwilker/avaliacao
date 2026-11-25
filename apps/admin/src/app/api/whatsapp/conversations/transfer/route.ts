import { NextResponse, type NextRequest } from "next/server";
import { evolutionRequest, isEvolutionServerConfigured } from "@/lib/evolution";
import { createAdminClient } from "@/lib/supabase/admin";
import { instanceStatus } from "@/lib/whatsapp-instances";
import {
  accessibleInstance,
  getWhatsAppAccessContext,
  WhatsAppAccessError,
} from "@/lib/whatsapp-routing";

export async function POST(req: NextRequest) {
  if (!isEvolutionServerConfigured()) {
    return NextResponse.json(
      { error: "O servidor do WhatsApp ainda não está configurado" },
      { status: 503 }
    );
  }
  try {
    const context = await getWhatsAppAccessContext();
    if (!context.routingAvailable) {
      return NextResponse.json(
        { error: "Execute a migration 0021 para transferir conversas" },
        { status: 409 }
      );
    }
    const body = (await req.json().catch(() => null)) as {
      conversationId?: unknown;
      targetInstanceId?: unknown;
    } | null;
    const conversationId =
      typeof body?.conversationId === "string" ? body.conversationId : "";
    const targetInstanceId =
      typeof body?.targetInstanceId === "string" ? body.targetInstanceId : "";
    if (!isUuid(conversationId) || !isUuid(targetInstanceId)) {
      return NextResponse.json(
        { error: "Escolha a conversa e o telefone de destino" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    const { data: conversation, error: conversationError } = await admin
      .from("whatsapp_conversations")
      .select("id, remote_jid, current_instance_id, contact_name")
      .eq("id", conversationId)
      .eq("store_id", context.storeId)
      .maybeSingle();
    if (conversationError) throw conversationError;
    if (!conversation) {
      return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
    }

    const source = accessibleInstance(
      context,
      String(conversation.current_instance_id)
    );
    const target = accessibleInstance(context, targetInstanceId, {
      requireActive: true,
    });
    if (source.id === target.id) {
      return NextResponse.json(
        { error: "Escolha outro telefone para a transferência" },
        { status: 400 }
      );
    }
    const targetStatus = await instanceStatus(target);
    if (targetStatus.state !== "open") {
      return NextResponse.json(
        { error: "O telefone de destino precisa estar conectado" },
        { status: 409 }
      );
    }

    const description = `Conversa transferida de ${source.label} (${source.sectorName}) para ${target.label} (${target.sectorName}) por ${context.userName}.`;
    const notice = customerNotice(
      String(conversation.contact_name || "Cliente"),
      context.storeName,
      target.sectorName
    );
    const { data: event, error: eventError } = await admin
      .from("whatsapp_conversation_events")
      .insert({
        store_id: context.storeId,
        conversation_id: conversationId,
        event_type: "transfer",
        from_instance_id: source.id,
        to_instance_id: target.id,
        created_by: context.userId,
        actor_name: context.userName,
        description,
        customer_notice: notice,
        status: "pending",
      })
      .select("id, created_at")
      .single();
    if (eventError) throw eventError;

    try {
      await evolutionRequest(
        `message/sendText/${encodeURIComponent(target.instanceName)}`,
        {
          method: "POST",
          body: {
            number: evolutionRecipient(String(conversation.remote_jid)),
            text: notice,
          },
        }
      );
      const completedAt = new Date().toISOString();
      const { data: updated, error: updateError } = await admin
        .from("whatsapp_conversations")
        .update({
          current_instance_id: target.id,
          last_message: notice,
          last_message_from_me: true,
          last_message_at: completedAt,
          unread_count: 0,
        })
        .eq("id", conversationId)
        .eq("store_id", context.storeId)
        .eq("current_instance_id", source.id)
        .select("id")
        .maybeSingle();
      if (updateError) throw updateError;
      if (!updated) throw new Error("A conversa foi alterada por outro usuário");

      await admin
        .from("whatsapp_conversation_events")
        .update({ status: "completed", completed_at: completedAt, error_message: null })
        .eq("id", event.id);
      return NextResponse.json({
        ok: true,
        event: {
          id: event.id,
          description,
          createdAt: event.created_at,
        },
        instance: {
          id: target.id,
          label: target.label,
          sectorId: target.sectorId,
          sectorName: target.sectorName,
        },
        notice,
      });
    } catch (error) {
      await admin
        .from("whatsapp_conversation_events")
        .update({
          status: "failed",
          error_message: (error as Error).message.slice(0, 1000),
        })
        .eq("id", event.id);
      throw error;
    }
  } catch (error) {
    const status = error instanceof WhatsAppAccessError ? error.status : 502;
    return NextResponse.json(
      { error: (error as Error).message || "Não foi possível transferir a conversa" },
      { status }
    );
  }
}

function customerNotice(name: string, storeName: string, sectorName: string) {
  const firstName = name.trim().split(/\s+/)[0] || "cliente";
  return `Olá, ${firstName}! 👋\n\nNosso atendimento da *${storeName}* continuará por este número, agora com o setor *${sectorName}*.\n\nPode continuar a conversa normalmente por aqui.`;
}

function evolutionRecipient(remoteJid: string): string {
  return remoteJid.endsWith("@c.us")
    ? remoteJid.replace(/@c\.us$/, "@s.whatsapp.net")
    : remoteJid;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}
