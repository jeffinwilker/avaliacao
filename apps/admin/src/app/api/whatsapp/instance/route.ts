import { NextResponse, type NextRequest } from "next/server";
import {
  evolutionRequest,
  isEvolutionServerConfigured,
  parseEvolutionConnection,
} from "@/lib/evolution";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isEvolutionServerConfigured()) {
    return NextResponse.json({
      serverConfigured: false,
      instance: null,
      state: "not_configured",
      qrCode: null,
      pairingCode: null,
    });
  }

  const context = await getStoreContext();
  if (!context) {
    return NextResponse.json({ error: "Loja não encontrada" }, { status: 404 });
  }
  if (!context.instance) {
    return NextResponse.json({
      serverConfigured: true,
      instance: null,
      state: "not_created",
      qrCode: null,
      pairingCode: null,
    });
  }

  try {
    const payload = await evolutionRequest(
      `instance/connectionState/${encodeURIComponent(context.instance)}`
    );
    return NextResponse.json({
      serverConfigured: true,
      instance: context.instance,
      ...parseEvolutionConnection(payload),
    });
  } catch (error) {
    return NextResponse.json({
      serverConfigured: true,
      instance: context.instance,
      state: "unknown",
      qrCode: null,
      pairingCode: null,
      error: (error as Error).message,
    });
  }
}

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isEvolutionServerConfigured()) {
    return NextResponse.json(
      { error: "Configure a URL e a chave global da Evolution no servidor" },
      { status: 503 }
    );
  }

  const context = await getStoreContext();
  if (!context) {
    return NextResponse.json({ error: "Loja não encontrada" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as { action?: string };
  const action = body.action ?? "create";

  try {
    if (action === "create") {
      if (context.instance) {
        return connectInstance(context.instance);
      }

      const instance = buildInstanceName(context.externalStoreId, context.storeId);
      const payload = await evolutionRequest("instance/create", {
        method: "POST",
        body: {
          instanceName: instance,
          integration: "WHATSAPP-BAILEYS",
          qrcode: true,
        },
      });

      const admin = createAdminClient();
      const { error } = await admin.from("store_settings").upsert(
        { store_id: context.storeId, whatsapp_instance: instance },
        { onConflict: "store_id" }
      );
      if (error) throw error;

      return NextResponse.json({
        serverConfigured: true,
        instance,
        ...parseEvolutionConnection(payload),
      });
    }

    if (action === "connect") {
      if (!context.instance) {
        return NextResponse.json(
          { error: "Crie a conexão antes de solicitar o QR Code" },
          { status: 400 }
        );
      }
      return connectInstance(context.instance);
    }

    return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 502 }
    );
  }
}

async function connectInstance(instance: string) {
  const payload = await evolutionRequest(
    `instance/connect/${encodeURIComponent(instance)}`
  );
  return NextResponse.json({
    serverConfigured: true,
    instance,
    ...parseEvolutionConnection(payload),
  });
}

async function isAuthenticated(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return Boolean(user);
}

async function getStoreContext(): Promise<{
  storeId: string;
  externalStoreId: string;
  instance: string | null;
} | null> {
  const admin = createAdminClient();
  const { data: store } = await admin
    .from("stores")
    .select("id, external_store_id")
    .limit(1)
    .maybeSingle();
  if (!store) return null;

  const { data: settings } = await admin
    .from("store_settings")
    .select("whatsapp_instance")
    .eq("store_id", store.id)
    .maybeSingle();

  return {
    storeId: store.id,
    externalStoreId: store.external_store_id,
    instance: settings?.whatsapp_instance ?? null,
  };
}

function buildInstanceName(externalStoreId: string, storeId: string): string {
  const suffix = externalStoreId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 40);
  return `avaliacoes-${suffix || storeId.slice(0, 8)}`;
}

