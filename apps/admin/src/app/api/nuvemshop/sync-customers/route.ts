import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { customerMigrationError, upsertNuvemshopCustomer } from "@/lib/customers";
import { fetchAllCustomers } from "@/lib/nuvemshop";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: store } = await admin
    .from("stores")
    .select("id, external_store_id, access_token")
    .eq("platform", "nuvemshop")
    .not("access_token", "is", null)
    .maybeSingle();

  if (!store?.access_token) {
    return NextResponse.json({ error: "Loja não conectada" }, { status: 400 });
  }

  try {
    const customers = await fetchAllCustomers(
      store.external_store_id,
      store.access_token
    );
    let inserted = 0;
    let updated = 0;

    for (const customer of customers) {
      const result = await upsertNuvemshopCustomer(admin, store.id, customer);
      if (result === "inserted") inserted++;
      else updated++;
    }

    return NextResponse.json({
      ok: true,
      count: customers.length,
      inserted,
      updated,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: customerMigrationError(message) },
      { status: 500 }
    );
  }
}
