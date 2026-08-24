import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

interface PostSaleRoutineBody {
  storeId?: unknown;
  reviewEnabled?: unknown;
  reviewDelayDays?: unknown;
  reviewTemplate?: unknown;
  postPurchaseEnabled?: unknown;
  postPurchaseDelayHours?: unknown;
  postPurchaseTemplate?: unknown;
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as PostSaleRoutineBody | null;
  const storeId = typeof body?.storeId === "string" ? body.storeId : "";
  const reviewEnabled = body?.reviewEnabled === true;
  const reviewDelayDays = Number(body?.reviewDelayDays);
  const reviewTemplate =
    typeof body?.reviewTemplate === "string" ? body.reviewTemplate.trim() : "";
  const postPurchaseEnabled = body?.postPurchaseEnabled === true;
  const postPurchaseDelayHours = Number(body?.postPurchaseDelayHours);
  const postPurchaseTemplate =
    typeof body?.postPurchaseTemplate === "string"
      ? body.postPurchaseTemplate.trim()
      : "";

  if (!storeId) {
    return NextResponse.json({ error: "Loja não informada" }, { status: 400 });
  }
  if (
    !Number.isInteger(reviewDelayDays) ||
    reviewDelayDays < 1 ||
    reviewDelayDays > 90
  ) {
    return NextResponse.json(
      { error: "O pedido de avaliação deve ser enviado entre 1 e 90 dias" },
      { status: 400 }
    );
  }
  if (
    !Number.isInteger(postPurchaseDelayHours) ||
    postPurchaseDelayHours < 0 ||
    postPurchaseDelayHours > 720
  ) {
    return NextResponse.json(
      { error: "A mensagem após a compra deve ser enviada entre 0 e 720 horas" },
      { status: 400 }
    );
  }
  if (!reviewTemplate || reviewTemplate.length > 4000) {
    return NextResponse.json(
      { error: "Escreva a mensagem do pedido de avaliação (até 4000 caracteres)" },
      { status: 400 }
    );
  }
  if (reviewEnabled && !reviewTemplate.includes("{{link}}")) {
    return NextResponse.json(
      { error: "A mensagem do pedido de avaliação precisa conter {{link}}" },
      { status: 400 }
    );
  }
  if (!postPurchaseTemplate || postPurchaseTemplate.length > 4000) {
    return NextResponse.json(
      { error: "Escreva a mensagem após a compra (até 4000 caracteres)" },
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
      whatsapp_enabled: reviewEnabled,
      request_delay_days: reviewDelayDays,
      whatsapp_template: reviewTemplate,
      post_purchase_enabled: postPurchaseEnabled,
      post_purchase_delay_hours: postPurchaseDelayHours,
      post_purchase_whatsapp_template: postPurchaseTemplate,
    },
    { onConflict: "store_id" }
  );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const cancellations: Array<PromiseLike<unknown>> = [];
  if (!postPurchaseEnabled) {
    cancellations.push(
      admin
        .from("automation_messages")
        .update({ status: "cancelled", error_message: "Automação desativada" })
        .eq("store_id", storeId)
        .eq("automation_type", "post_purchase")
        .eq("status", "scheduled")
    );
  }
  if (!reviewEnabled) {
    cancellations.push(
      admin
        .from("review_requests")
        .update({ status: "cancelled", error_message: "Automação desativada" })
        .eq("store_id", storeId)
        .eq("channel", "whatsapp")
        .eq("status", "scheduled")
    );
  }
  await Promise.all(cancellations);

  return NextResponse.json({ ok: true });
}
