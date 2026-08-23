import { NextResponse } from "next/server";
import { syncAbandonedCarts } from "@/lib/automations";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sync = await syncAbandonedCarts(createAdminClient());
  return NextResponse.json({ ok: true, sync });
}
