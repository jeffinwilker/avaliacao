import { NextResponse } from "next/server";
import {
  NUVEMSHOP_AUTOMATION_WEBHOOK_EVENTS,
  registerAutomationWebhooks,
} from "@/lib/nuvemshop-webhooks";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl?.startsWith("https://")) {
    return NextResponse.json(
      { error: "NEXT_PUBLIC_APP_URL precisa usar HTTPS para registrar webhooks" },
      { status: 400 }
    );
  }

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

  const webhookUrl = `${appUrl.replace(/\/$/, "")}/api/nuvemshop/webhook`;
  const results = await registerAutomationWebhooks({
    storeId: store.external_store_id,
    token: store.access_token,
    webhookUrl,
  });
  const failures = results.flatMap((result, index) =>
    result.status === "rejected"
      ? [{
          event: NUVEMSHOP_AUTOMATION_WEBHOOK_EVENTS[index],
          error: result.reason instanceof Error
            ? result.reason.message
            : String(result.reason),
        }]
      : []
  );

  return NextResponse.json({
    ok: failures.length === 0,
    events: NUVEMSHOP_AUTOMATION_WEBHOOK_EVENTS,
    failures,
    url: webhookUrl,
  }, { status: failures.length ? 400 : 200 });
}
