import { NextResponse, type NextRequest } from "next/server";
import { sendManualBlackFridayGroupMessage } from "@/lib/automations";
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
    externalOrderId?: unknown;
  } | null;
  const storeId = typeof body?.storeId === "string" ? body.storeId : "";
  const externalOrderId =
    typeof body?.externalOrderId === "string" ? body.externalOrderId : "";
  if (!storeId || !externalOrderId) {
    return NextResponse.json(
      { error: "Escolha o pedido que receberá o convite" },
      { status: 400 }
    );
  }

  try {
    const result = await sendManualBlackFridayGroupMessage(
      createAdminClient(),
      { storeId, externalOrderId }
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          (error as Error).message ||
          "Não foi possível enviar o convite para o grupo",
      },
      { status: 400 }
    );
  }
}
