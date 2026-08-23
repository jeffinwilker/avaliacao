import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  if (!body.store_id) {
    return NextResponse.json({ error: "store_id required" }, { status: 400 });
  }

  if (
    body.abandoned_cart_delay_hours != null &&
    (body.abandoned_cart_delay_hours < 6 || body.abandoned_cart_delay_hours > 168)
  ) {
    return NextResponse.json(
      { error: "O atraso do carrinho deve ficar entre 6 e 168 horas" },
      { status: 400 }
    );
  }
  if (
    body.post_purchase_delay_hours != null &&
    (body.post_purchase_delay_hours < 0 || body.post_purchase_delay_hours > 720)
  ) {
    return NextResponse.json(
      { error: "O atraso do pós-venda deve ficar entre 0 e 720 horas" },
      { status: 400 }
    );
  }

  const update = {
    store_id: body.store_id,
    auto_publish: body.auto_publish,
    request_delay_days: body.request_delay_days,
    email_enabled: body.email_enabled,
    whatsapp_enabled: body.whatsapp_enabled,
    email_subject: body.email_subject,
    email_template: body.email_template,
    whatsapp_template: body.whatsapp_template,
    abandoned_cart_enabled: body.abandoned_cart_enabled,
    abandoned_cart_delay_hours: body.abandoned_cart_delay_hours,
    abandoned_cart_whatsapp_template: body.abandoned_cart_whatsapp_template,
    post_purchase_enabled: body.post_purchase_enabled,
    post_purchase_delay_hours: body.post_purchase_delay_hours,
    post_purchase_whatsapp_template: body.post_purchase_whatsapp_template,
    brand_color: body.brand_color,
    allow_media: body.allow_media,
    max_media_per_review: body.max_media_per_review,
  };

  const admin = createAdminClient();
  const { error } = await admin
    .from("store_settings")
    .upsert(update, { onConflict: "store_id" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const cancellations: Array<PromiseLike<unknown>> = [];
  if (body.abandoned_cart_enabled === false) {
    cancellations.push(
      admin
        .from("automation_messages")
        .update({ status: "cancelled", error_message: "Automação desativada" })
        .eq("store_id", body.store_id)
        .eq("automation_type", "abandoned_cart")
        .eq("status", "scheduled")
    );
  }
  if (body.post_purchase_enabled === false) {
    cancellations.push(
      admin
        .from("automation_messages")
        .update({ status: "cancelled", error_message: "Automação desativada" })
        .eq("store_id", body.store_id)
        .eq("automation_type", "post_purchase")
        .eq("status", "scheduled")
    );
  }
  await Promise.all(cancellations);

  return NextResponse.json({ ok: true });
}
