import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { parsePostSaleSequence } from "@/lib/automations";

interface PostSaleRoutineBody {
  storeId?: unknown;
  reviewEnabled?: unknown;
  reviewDelayMinutes?: unknown;
  reviewDelayDays?: unknown;
  reviewTemplate?: unknown;
  reviewAttachmentType?: unknown;
  reviewAttachmentUrl?: unknown;
  postPurchaseEnabled?: unknown;
  postPurchaseDelayMinutes?: unknown;
  postPurchaseDelayHours?: unknown;
  postPurchaseTemplate?: unknown;
  postPurchaseAttachmentType?: unknown;
  postPurchaseAttachmentUrl?: unknown;
  postSaleSequence?: unknown;
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
  const reviewDelayMinutes = Number(
    body?.reviewDelayMinutes ?? Number(body?.reviewDelayDays) * 1_440
  );
  const reviewTemplate =
    typeof body?.reviewTemplate === "string" ? body.reviewTemplate.trim() : "";
  const reviewAttachment = parseAttachment(
    body?.reviewAttachmentType,
    body?.reviewAttachmentUrl
  );
  const postPurchaseEnabled = body?.postPurchaseEnabled === true;
  const postPurchaseDelayMinutes = Number(
    body?.postPurchaseDelayMinutes ?? Number(body?.postPurchaseDelayHours) * 60
  );
  const postPurchaseTemplate =
    typeof body?.postPurchaseTemplate === "string"
      ? body.postPurchaseTemplate.trim()
      : "";
  const postPurchaseAttachment = parseAttachment(
    body?.postPurchaseAttachmentType,
    body?.postPurchaseAttachmentUrl
  );
  const postSaleSequence = parsePostSaleSequence(body?.postSaleSequence, {
    enabled: postPurchaseEnabled,
    delayMinutes: postPurchaseDelayMinutes,
    messageTemplate: postPurchaseTemplate,
    attachmentType: postPurchaseAttachment.type,
    attachmentUrl: postPurchaseAttachment.url,
  });
  const confirmationStep = postSaleSequence.find(
    (step) => step.id === "order_created"
  )!;

  if (!storeId) {
    return NextResponse.json({ error: "Loja não informada" }, { status: 400 });
  }
  if (
    !Number.isInteger(reviewDelayMinutes) ||
    reviewDelayMinutes < 10 ||
    reviewDelayMinutes > 129_600
  ) {
    return NextResponse.json(
      { error: "O pedido de avaliação deve ser enviado entre 10 minutos e 90 dias" },
      { status: 400 }
    );
  }
  if (postSaleSequence.some(
    (step) =>
      !Number.isInteger(step.delayMinutes) ||
      step.delayMinutes < 0 ||
      step.delayMinutes > 43_200
  )) {
    return NextResponse.json(
      { error: "As mensagens de pós-venda devem ser enviadas entre 0 minutos e 30 dias" },
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
  if (postSaleSequence.some(
    (step) => !step.messageTemplate || step.messageTemplate.length > 4000
  )) {
    return NextResponse.json(
      { error: "Escreva todas as mensagens de pós-venda (até 4000 caracteres)" },
      { status: 400 }
    );
  }
  if (
    !reviewAttachment.valid ||
    postSaleSequence.some(
      (step) => step.attachmentType === "library" && !step.attachmentUrl
    )
  ) {
    return NextResponse.json(
      { error: "Escolha uma imagem válida da biblioteca ou use a imagem do produto" },
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
      review_request_delay_minutes: reviewDelayMinutes,
      request_delay_days: Math.max(
        1,
        Math.min(90, Math.ceil(reviewDelayMinutes / 1_440))
      ),
      whatsapp_template: reviewTemplate,
      whatsapp_attachment_type: reviewAttachment.type,
      whatsapp_attachment_url: reviewAttachment.url,
      post_purchase_enabled: postSaleSequence.some((step) => step.enabled),
      post_purchase_delay_minutes: confirmationStep.delayMinutes,
      post_purchase_delay_hours: Math.max(
        0,
        Math.min(720, Math.ceil(confirmationStep.delayMinutes / 60))
      ),
      post_purchase_whatsapp_template: confirmationStep.messageTemplate,
      post_purchase_attachment_type: confirmationStep.attachmentType,
      post_purchase_attachment_url: confirmationStep.attachmentUrl,
      post_sale_sequence: postSaleSequence.map((step) => ({
        id: step.id,
        delay_minutes: step.delayMinutes,
        message_template: step.messageTemplate,
        enabled: step.enabled,
        attachment_type: step.attachmentType,
        attachment_url: step.attachmentUrl,
      })),
    },
    { onConflict: "store_id" }
  );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const cancellations: Array<PromiseLike<unknown>> = [];
  for (const step of postSaleSequence.filter((item) => !item.enabled)) {
    cancellations.push(
      admin
        .from("automation_messages")
        .update({ status: "cancelled", error_message: "Automação desativada" })
        .eq("store_id", storeId)
        .eq("automation_type", "post_purchase")
        .in("routine_step_key", [
          step.id,
          ...(step.id === "order_created" ? ["default"] : []),
        ])
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

function parseAttachment(typeValue: unknown, urlValue: unknown): {
  type: "none" | "product_image" | "library";
  url: string | null;
  valid: boolean;
} {
  const type =
    typeValue === "product_image" || typeValue === "library"
      ? typeValue
      : "none";
  const url =
    typeof urlValue === "string" && /^https:\/\//i.test(urlValue)
      ? urlValue
      : null;
  return {
    type,
    url: type === "library" ? url : null,
    valid: type !== "library" || Boolean(url),
  };
}
