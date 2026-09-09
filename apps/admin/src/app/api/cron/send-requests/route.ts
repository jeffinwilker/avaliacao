import { NextResponse, type NextRequest } from "next/server";
import {
  sendScheduledAutomationMessages,
  syncAbandonedCarts,
} from "@/lib/automations";
import { sendDueReviewRequests } from "@/lib/review-requests";
import { syncRecentOrders } from "@/lib/order-sync";
import { createAdminClient } from "@/lib/supabase/admin";

// O mesmo cron sincroniza carrinhos, envia recuperações/pós-venda e processa
// as solicitações de avaliação. A fila e os upserts tornam a execução
// idempotente mesmo quando chamada mais de uma vez.
export async function POST(req: NextRequest) {
  if (req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const sync = await syncAbandonedCarts(admin).catch((error) => ({
    stores: 0,
    found: 0,
    eligible: 0,
    queued: 0,
    cancelled: 0,
    errors: [(error as Error).message],
  }));
  const orders = await syncRecentOrders(admin, {
    days: 60,
    maxOrders: 500,
    reviewLookbackDays: 7,
  }).catch((error) => ({
    found: 0,
    synced: 0,
    delivered: 0,
    productsLinked: 0,
    reviewRequestsQueued: 0,
    reviewRequestsReactivated: 0,
    error: (error as Error).message,
  }));
  const automations = await sendScheduledAutomationMessages(admin);
  const reviews = await sendDueReviewRequests(admin);

  return NextResponse.json({ ok: true, sync, orders, automations, reviews });
}
