import { NextResponse, type NextRequest } from "next/server";
import {
  parseAbandonedCartSequence,
  syncAbandonedCarts,
} from "@/lib/automations";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

interface RoutineStepInput {
  id?: unknown;
  delayMinutes?: unknown;
  delayHours?: unknown;
  messageTemplate?: unknown;
  enabled?: unknown;
  attachmentType?: unknown;
  attachmentUrl?: unknown;
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null) as {
    storeId?: unknown;
    enabled?: unknown;
    steps?: RoutineStepInput[];
  } | null;
  const storeId = typeof body?.storeId === "string" ? body.storeId : "";
  const enabled = body?.enabled === true;

  if (!storeId) {
    return NextResponse.json({ error: "Loja não informada" }, { status: 400 });
  }
  if (!Array.isArray(body?.steps) || body.steps.length < 1 || body.steps.length > 5) {
    return NextResponse.json(
      { error: "A rotina deve ter entre 1 e 5 mensagens" },
      { status: 400 }
    );
  }

  const ids = new Set<string>();
  const delays = new Set<number>();
  const validatedSteps = body.steps.flatMap((step, index) => {
    const rawId = typeof step.id === "string" ? step.id : `step-${index + 1}`;
    const id = /^[a-zA-Z0-9_-]{1,80}$/.test(rawId) ? rawId : "";
    const delayMinutes =
      step.delayMinutes != null
        ? Number(step.delayMinutes)
        : Number(step.delayHours) * 60;
    const messageTemplate =
      typeof step.messageTemplate === "string" ? step.messageTemplate.trim() : "";
    const attachmentType =
      step.attachmentType === "product_image" || step.attachmentType === "library"
        ? step.attachmentType
        : "none";
    const attachmentUrl =
      typeof step.attachmentUrl === "string" &&
      /^https:\/\//i.test(step.attachmentUrl)
        ? step.attachmentUrl
        : null;

    if (
      !id ||
      ids.has(id) ||
      !Number.isInteger(delayMinutes) ||
      delayMinutes < 10 ||
      delayMinutes > 43_200 ||
      delays.has(delayMinutes) ||
      !messageTemplate ||
      messageTemplate.length > 4000 ||
      (attachmentType === "library" && !attachmentUrl)
    ) {
      return [];
    }
    ids.add(id);
    delays.add(delayMinutes);
    return [{
      id,
      delay_minutes: delayMinutes,
      message_template: messageTemplate,
      enabled: step.enabled !== false,
      attachment_type: attachmentType,
      attachment_url: attachmentType === "library" ? attachmentUrl : null,
    }];
  }).sort((a, b) => a.delay_minutes - b.delay_minutes);

  if (validatedSteps.length !== body.steps.length) {
    return NextResponse.json(
      {
        error:
          "Revise a rotina: os horários devem ser únicos, entre 10 minutos e 30 dias, e todas as mensagens precisam ter texto.",
      },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const [{ data: store }, { data: currentSettings }] = await Promise.all([
    admin.from("stores").select("id").eq("id", storeId).maybeSingle(),
    admin
      .from("store_settings")
      .select(
        `abandoned_cart_enabled, abandoned_cart_delay_hours,
         abandoned_cart_whatsapp_template, abandoned_cart_sequence`
      )
      .eq("store_id", storeId)
      .maybeSingle(),
  ]);
  if (!store) {
    return NextResponse.json({ error: "Loja não encontrada" }, { status: 404 });
  }

  const previousSteps = parseAbandonedCartSequence(
    currentSettings?.abandoned_cart_sequence,
    currentSettings?.abandoned_cart_delay_hours,
    currentSettings?.abandoned_cart_whatsapp_template
  );
  const previousById = new Map(previousSteps.map((step) => [step.id, step]));
  const routineWasActivated = !currentSettings?.abandoned_cart_enabled && enabled;
  const activatedAt = new Date().toISOString();
  const steps = validatedSteps.map((step) => {
    const previous = previousById.get(step.id);
    const timingChanged = previous?.delay_minutes !== step.delay_minutes;
    const stepWasActivated = previous?.enabled === false && step.enabled;
    const startsNow =
      enabled &&
      step.enabled &&
      (routineWasActivated || !previous || timingChanged || stepWasActivated);
    return {
      ...step,
      active_since: startsNow ? activatedAt : previous?.active_since ?? null,
    };
  });

  const firstStep = steps[0];
  const { error } = await admin.from("store_settings").upsert(
    {
      store_id: storeId,
      abandoned_cart_enabled: enabled,
      abandoned_cart_sequence: steps,
      // Campo legado: a sequência em JSON é a fonte de verdade em minutos.
      abandoned_cart_delay_hours: Math.max(
        6,
        Math.min(168, Math.ceil(firstStep.delay_minutes / 60))
      ),
      abandoned_cart_whatsapp_template: firstStep.message_template,
    },
    { onConflict: "store_id" }
  );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const restartedStepIds = steps
    .filter((step) => step.active_since === activatedAt)
    .map((step) => step.id);
  if (restartedStepIds.length) {
    await admin
      .from("automation_messages")
      .update({
        status: "cancelled",
        error_message: "Rotina atualizada",
      })
      .eq("store_id", storeId)
      .eq("automation_type", "abandoned_cart")
      .eq("status", "scheduled")
      .in("routine_step_key", restartedStepIds);
  }

  const sync = await syncAbandonedCarts(admin);
  return NextResponse.json({ ok: true, enabled, steps, sync });
}
