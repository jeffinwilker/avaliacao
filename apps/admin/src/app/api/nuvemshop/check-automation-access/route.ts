import { NextResponse } from "next/server";
import { checkAbandonedCheckoutAccess } from "@/lib/nuvemshop";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: store } = await admin
    .from("stores")
    .select("external_store_id, access_token")
    .eq("platform", "nuvemshop")
    .limit(1)
    .maybeSingle();

  if (!store?.access_token) {
    return NextResponse.json({ error: "Loja não conectada" }, { status: 400 });
  }

  try {
    await checkAbandonedCheckoutAccess(store.external_store_id, store.access_token);
    return NextResponse.json({ ok: true, read_orders: true });
  } catch (error) {
    const message = (error as Error).message;
    const missingScope = message.includes("403") || message.includes("read_orders");
    return NextResponse.json(
      {
        error: missingScope
          ? "Falta a permissão read_orders. Adicione-a no aplicativo Nuvemshop e reconecte a loja."
          : message,
        read_orders: false,
      },
      { status: missingScope ? 403 : 502 }
    );
  }
}
