import { NextResponse, type NextRequest } from "next/server";
import { evolutionRequest, isEvolutionServerConfigured } from "@/lib/evolution";
import { normalizeEvolutionMessages } from "@/lib/evolution-chat";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

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
