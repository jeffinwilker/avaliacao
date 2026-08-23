import { NextResponse } from "next/server";
import {
  sendScheduledAutomationMessages,
  syncAbandonedCarts,
} from "@/lib/automations";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const sync = await syncAbandonedCarts(admin);
  const messages = await sendScheduledAutomationMessages(admin);
  return NextResponse.json({ ok: true, sync, messages });
}
