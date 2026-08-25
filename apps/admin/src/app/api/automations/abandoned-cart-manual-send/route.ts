import { NextResponse, type NextRequest } from "next/server";
import { sendManualAbandonedCartMessage } from "@/lib/automations";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null) as {
    storeId?: unknown;
    externalCheckoutId?: unknown;
    stepId?: unknown;
  } | null;
  const storeId = typeof body?.storeId === "string" ? body.storeId : "";
  const externalCheckoutId =
    typeof body?.externalCheckoutId === "string" ? body.externalCheckoutId : "";
  const stepId = typeof body?.stepId === "string" ? body.stepId : "";

  if (!storeId || !externalCheckoutId || !stepId) {
    return NextResponse.json(
      { error: "Escolha o carrinho e a mensagem que deseja enviar" },
      { status: 400 }
    );
  }

  try {
    const result = await sendManualAbandonedCartMessage(createAdminClient(), {
      storeId,
      externalCheckoutId,
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
