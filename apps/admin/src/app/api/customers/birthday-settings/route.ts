import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_BIRTHDAY_COLLECTION_WHATSAPP_TEMPLATE } from "@avaliacoes/shared";
import { customerMigrationError } from "@/lib/customers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

interface BirthdaySettingsBody {
  storeId?: unknown;
  enabled?: unknown;
  delayMinutes?: unknown;
  template?: unknown;
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as BirthdaySettingsBody | null;
  const storeId = typeof body?.storeId === "string" ? body.storeId : "";
  const enabled = body?.enabled === true;
  const delayMinutes = Number(body?.delayMinutes ?? 1440);
  const template =
    typeof body?.template === "string"
      ? body.template.trim()
      : DEFAULT_BIRTHDAY_COLLECTION_WHATSAPP_TEMPLATE;

  if (!storeId) {
    return NextResponse.json({ error: "Loja não informada" }, { status: 400 });
  }
  if (
    !Number.isInteger(delayMinutes) ||
    delayMinutes < 0 ||
    delayMinutes > 43_200
  ) {
    return NextResponse.json(
      { error: "O envio deve ficar entre 0 minutos e 30 dias depois da compra" },
      { status: 400 }
    );
  }
  if (!template || template.length > 4000) {
    return NextResponse.json(
      { error: "Escreva a mensagem de aniversário com até 4000 caracteres" },
      { status: 400 }
    );
  }
  if (enabled && !template.includes("{{link}}")) {
    return NextResponse.json(
      { error: "A mensagem precisa conter {{link}}" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data: store } = await admin
    .from("stores")
    .select("id")
    .eq("id", storeId)
    .maybeSingle();
  if (!store) {
    return NextResponse.json({ error: "Loja não encontrada" }, { status: 404 });
  }

  const { error } = await admin.from("store_settings").upsert(
    {
      store_id: storeId,
      birthday_collection_enabled: enabled,
      birthday_collection_delay_minutes: delayMinutes,
      birthday_collection_whatsapp_template: template,
    },
    { onConflict: "store_id" }
  );
  if (error) {
    return NextResponse.json(
      { error: customerMigrationError(error.message) },
      { status: 500 }
    );
  }

  if (!enabled) {
    await admin
      .from("automation_messages")
      .update({
        status: "cancelled",
        error_message: "Automação desativada",
      })
      .eq("store_id", storeId)
      .eq("automation_type", "birthday_collection")
      .eq("status", "scheduled");
  }

  return NextResponse.json({ ok: true });
}
