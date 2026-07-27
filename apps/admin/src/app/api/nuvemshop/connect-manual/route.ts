import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { external_store_id, access_token, name, domain } = body;

  if (!external_store_id || !access_token || !name) {
    return NextResponse.json(
      { error: "external_store_id, access_token e name são obrigatórios." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data: store, error } = await admin
    .from("stores")
    .upsert(
      {
        external_store_id: String(external_store_id),
        access_token,
        name,
        domain: domain || null,
        platform: "nuvemshop",
      },
      { onConflict: "platform,external_store_id" }
    )
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // garante registro de settings default
  await admin.from("store_settings").upsert(
    { store_id: store.id },
    { onConflict: "store_id" }
  );

  return NextResponse.json({ ok: true, store_id: store.id });
}
