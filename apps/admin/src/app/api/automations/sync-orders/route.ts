import { NextResponse } from "next/server";
import { syncRecentOrders } from "@/lib/order-sync";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    // A tela atualiza os dados; o worker central é o único responsável por
    // criar convites automáticos, evitando duas filas concorrentes.
    const sync = await syncRecentOrders(createAdminClient(), {
      scheduleReviewRequests: false,
    });
    return NextResponse.json({ ok: true, sync });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Não foi possível atualizar os pedidos" },
      { status: 400 }
    );
  }
}
