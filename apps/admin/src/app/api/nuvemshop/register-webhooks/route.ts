import { NextResponse } from "next/server";
import { registerWebhook } from "@/lib/nuvemshop";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const ORDER_EVENTS = [
  "order/created",
  "order/paid",
  "order/fulfilled",
  "order/cancelled",
];

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
  await Promise.all(
    ORDER_EVENTS.map((event) =>
      registerWebhook(store.external_store_id, store.access_token, event, webhookUrl)
    )
  );

  return NextResponse.json({ ok: true, events: ORDER_EVENTS, url: webhookUrl });
}
