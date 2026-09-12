import { NextResponse, type NextRequest } from "next/server";
import { sendManualPendingPaymentMessage } from "@/lib/automations";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null) as {
    storeId?: unknown;
    externalOrderId?: unknown;
    stepId?: unknown;
  } | null;
  const storeId = typeof body?.storeId === "string" ? body.storeId : "";
  const externalOrderId =
    typeof body?.externalOrderId === "string" ? body.externalOrderId : "";
  const stepId = typeof body?.stepId === "string" ? body.stepId : "";
  if (!storeId || !externalOrderId || !stepId) {
    return NextResponse.json(
      { error: "Escolha o pedido e a mensagem que deseja enviar" },
      { status: 400 }
    );
  }
  try {
    const result = await sendManualPendingPaymentMessage(createAdminClient(), {
      storeId,
      externalOrderId,
      stepId,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Não foi possível enviar a mensagem" },
      { status: 400 }
    );
  }
}
