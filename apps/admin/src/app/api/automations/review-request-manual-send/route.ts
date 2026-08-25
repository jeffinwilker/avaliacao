import { NextResponse, type NextRequest } from "next/server";
import { sendReviewRequestNow } from "@/lib/review-requests";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    storeId?: unknown;
    orderId?: unknown;
    productId?: unknown;
  } | null;
  const storeId = typeof body?.storeId === "string" ? body.storeId : "";
  const orderId = typeof body?.orderId === "string" ? body.orderId : "";
  const productId = typeof body?.productId === "string" ? body.productId : "";
  if (!storeId || !orderId || !productId) {
    return NextResponse.json(
      { error: "Escolha o pedido e o produto que deseja avaliar" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select(
      `id, customer_phone, status, shipping_status, fulfillment_status,
       tracking_status, delivered_at`
    )
    .eq("id", orderId)
    .eq("store_id", storeId)
    .maybeSingle();
  if (!order) {
    return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
  }
  if (!isDelivered(order)) {
    return NextResponse.json(
      { error: "O pedido de avaliação só pode ser enviado após a entrega" },
      { status: 400 }
    );
  }
  if (!order.customer_phone) {
    return NextResponse.json(
      { error: "Esse cliente não possui telefone para WhatsApp" },
      { status: 400 }
    );
  }

  const { data: item } = await admin
    .from("order_items")
    .select("id")
    .eq("order_id", orderId)
    .eq("product_id", productId)
    .maybeSingle();
  if (!item) {
    return NextResponse.json(
      { error: "Esse produto não pertence ao pedido informado" },
      { status: 400 }
    );
  }

  const { data: existingRows } = await admin
    .from("review_requests")
    .select("id, status")
    .eq("store_id", storeId)
    .eq("order_id", orderId)
    .eq("product_id", productId)
    .eq("channel", "whatsapp")
    .order("created_at", { ascending: false })
    .limit(1);
  const existing = existingRows?.[0] ?? null;
  if (existing?.status === "completed") {
    return NextResponse.json(
      { error: "O cliente já enviou a avaliação deste produto" },
      { status: 409 }
    );
  }

  let requestId = existing?.id ?? null;
  if (requestId) {
    const { error } = await admin
      .from("review_requests")
      .update({
        status: "scheduled",
        scheduled_for: new Date().toISOString(),
        sent_at: null,
        attempts: 0,
        error_message: null,
      })
      .eq("id", requestId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
  } else {
    const { data: created, error } = await admin
      .from("review_requests")
      .insert({
        store_id: storeId,
        order_id: orderId,
        product_id: productId,
        channel: "whatsapp",
        status: "scheduled",
        scheduled_for: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error || !created) {
      return NextResponse.json(
        { error: error?.message || "Não foi possível criar o pedido de avaliação" },
        { status: 400 }
      );
    }
    requestId = created.id;
  }

  try {
    await sendReviewRequestNow(admin, requestId);
    return NextResponse.json({ ok: true, requestId, status: "sent" });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Não foi possível enviar a avaliação" },
      { status: 400 }
    );
  }
}

function isDelivered(order: {
  status: string | null;
  shipping_status: string | null;
  fulfillment_status: string | null;
  tracking_status: string | null;
  delivered_at: string | null;
}): boolean {
  return (
    Boolean(order.delivered_at) ||
    order.status?.toLowerCase() === "delivered" ||
    order.shipping_status?.toLowerCase() === "delivered" ||
    order.fulfillment_status?.toLowerCase() === "delivered" ||
    order.tracking_status?.toLowerCase() === "delivered"
  );
}
