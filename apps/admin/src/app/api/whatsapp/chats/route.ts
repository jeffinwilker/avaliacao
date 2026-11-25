import { NextResponse } from "next/server";
import { evolutionRequest, isEvolutionServerConfigured } from "@/lib/evolution";
import { normalizeEvolutionChats } from "@/lib/evolution-chat";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
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

  const instance = await getInstanceName();
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
    return NextResponse.json(
      { chats: normalizeEvolutionChats(payload), refreshedAt: new Date().toISOString() },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Não foi possível carregar as conversas" },
      { status: 502 }
    );
  }
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
