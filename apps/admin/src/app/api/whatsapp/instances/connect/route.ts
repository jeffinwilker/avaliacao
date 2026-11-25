import { NextResponse, type NextRequest } from "next/server";
import {
  evolutionRequest,
  isEvolutionServerConfigured,
  parseEvolutionConnection,
} from "@/lib/evolution";
import { createAdminClient } from "@/lib/supabase/admin";
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
        { error: "Execute a migration 0021 para usar múltiplos telefones" },
        { status: 409 }
      );
    }
    const body = (await req.json().catch(() => null)) as {
      instanceId?: unknown;
    } | null;
    const instanceId =
      typeof body?.instanceId === "string" ? body.instanceId : "";
    const instance = accessibleInstance(context, instanceId);
    const payload = await evolutionRequest(
      `instance/connect/${encodeURIComponent(instance.instanceName)}`
    );
    const connection = parseEvolutionConnection(payload);
    const admin = createAdminClient();
    await admin
      .from("whatsapp_instances")
      .update({ active: true })
      .eq("id", instance.id)
      .eq("store_id", context.storeId);
    return NextResponse.json({
      ok: true,
      instance: {
        id: instance.id,
        label: instance.label,
        sectorName: instance.sectorName,
      },
      ...connection,
    });
  } catch (error) {
    const status = error instanceof WhatsAppAccessError ? error.status : 502;
    return NextResponse.json(
      { error: (error as Error).message || "Não foi possível conectar o telefone" },
      { status }
    );
  }
}
