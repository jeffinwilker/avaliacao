import { NextResponse, type NextRequest } from "next/server";
import {
  parsePendingPaymentSequence,
  syncPendingPaymentOrders,
} from "@/lib/automations";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

interface RoutineStepInput {
  id?: unknown;
  delayMinutes?: unknown;
  messageTemplate?: unknown;
  enabled?: unknown;
  attachmentType?: unknown;
  attachmentUrl?: unknown;
  couponEnabled?: unknown;
  couponType?: unknown;
  couponValue?: unknown;
  couponValidHours?: unknown;
  couponMinPrice?: unknown;
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
  const validated = body.steps.flatMap((step, index) => {
    const rawId = typeof step.id === "string" ? step.id : `step-${index + 1}`;
    const id = /^[a-zA-Z0-9_-]{1,80}$/.test(rawId) ? rawId : "";
    const delayMinutes = Number(step.delayMinutes);
    const messageTemplate =
      typeof step.messageTemplate === "string" ? step.messageTemplate.trim() : "";
    const attachmentType =
      step.attachmentType === "product_image" || step.attachmentType === "library"
        ? step.attachmentType
        : "none";
    const attachmentUrl =
      typeof step.attachmentUrl === "string" && /^https:\/\//i.test(step.attachmentUrl)
        ? step.attachmentUrl
        : null;
    const couponEnabled = step.couponEnabled === true;
    const couponType =
      step.couponType === "absolute" || step.couponType === "shipping"
        ? step.couponType
        : "percentage";
    const couponValue = Number(step.couponValue ?? 10);
    const couponValidHours = Number(step.couponValidHours ?? 48);
    const couponMinPrice =
      step.couponMinPrice == null || step.couponMinPrice === ""
        ? null
        : Number(step.couponMinPrice);
    if (
      !id || ids.has(id) ||
      !Number.isInteger(delayMinutes) || delayMinutes < 10 || delayMinutes > 43_200 ||
      delays.has(delayMinutes) || !messageTemplate || messageTemplate.length > 4_000 ||
      (attachmentType === "library" && !attachmentUrl) ||
      (couponEnabled && couponType !== "shipping" && (
        !Number.isFinite(couponValue) || couponValue <= 0 ||
        (couponType === "percentage" && couponValue > 100)
      )) ||
      (couponEnabled && (
        !Number.isInteger(couponValidHours) || couponValidHours < 1 || couponValidHours > 720
      )) ||
      (couponMinPrice != null && (!Number.isFinite(couponMinPrice) || couponMinPrice < 0))
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
      coupon_enabled: couponEnabled,
      coupon_type: couponType,
      coupon_value: couponType === "shipping" ? 0 : couponValue,
      coupon_valid_hours: couponValidHours,
      coupon_min_price: couponMinPrice,
    }];
  }).sort((a, b) => a.delay_minutes - b.delay_minutes);
  if (validated.length !== body.steps.length) {
    return NextResponse.json(
      { error: "Revise os horários, textos, anexos e configurações do cupom." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const [{ data: store }, { data: current }] = await Promise.all([
    admin.from("stores").select("id").eq("id", storeId).maybeSingle(),
    admin
      .from("store_settings")
      .select("pending_payment_enabled, pending_payment_sequence")
      .eq("store_id", storeId)
      .maybeSingle(),
  ]);
  if (!store) {
    return NextResponse.json({ error: "Loja não encontrada" }, { status: 404 });
  }

  const previous = parsePendingPaymentSequence(current?.pending_payment_sequence);
  const previousById = new Map(previous.map((step) => [step.id, step]));
  const routineWasActivated = !current?.pending_payment_enabled && enabled;
  const activatedAt = new Date().toISOString();
  const steps = validated.map((step) => {
    const old = previousById.get(step.id);
    const startsNow =
      enabled && step.enabled && (
        routineWasActivated || !old || old.delay_minutes !== step.delay_minutes ||
        (old.enabled === false && step.enabled)
      );
    return {
      ...step,
      active_since: startsNow ? activatedAt : old?.active_since ?? null,
    };
  });

  const { error } = await admin.from("store_settings").upsert(
    {
      store_id: storeId,
      pending_payment_enabled: enabled,
      pending_payment_sequence: steps,
    },
    { onConflict: "store_id" }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const restartedStepIds = steps
    .filter((step) => step.active_since === activatedAt)
    .map((step) => step.id);
  if (restartedStepIds.length) {
    await admin
      .from("automation_messages")
      .update({ status: "cancelled", error_message: "Rotina atualizada" })
      .eq("store_id", storeId)
      .eq("automation_type", "pending_payment")
      .eq("status", "scheduled")
      .in("routine_step_key", restartedStepIds);
  }

  const sync = await syncPendingPaymentOrders(admin);
  return NextResponse.json({ ok: true, enabled, steps, sync });
}
