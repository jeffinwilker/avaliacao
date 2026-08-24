import { NextResponse } from "next/server";
import {
  checkAbandonedCheckoutAccess,
  checkCouponAccess,
} from "@/lib/nuvemshop";
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

  let readOrders = true;
  let coupons = true;
  let ordersError: string | null = null;
  let couponsError: string | null = null;

  try {
    await checkAbandonedCheckoutAccess(store.external_store_id, store.access_token);
  } catch (error) {
    readOrders = false;
    ordersError = (error as Error).message;
  }
  try {
    await checkCouponAccess(store.external_store_id, store.access_token);
  } catch (error) {
    coupons = false;
    couponsError = (error as Error).message;
  }

  return NextResponse.json({
    ok: readOrders && coupons,
    read_orders: readOrders,
    coupons,
    orders_error: ordersError,
    coupons_error: couponsError,
  });
}
