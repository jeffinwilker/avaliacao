import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  customerMigrationError,
  normalizeCustomerInput,
} from "@/lib/customers";

interface CreateCustomerBody {
  storeId?: unknown;
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  identification?: unknown;
  birthDate?: unknown;
  acceptsMarketing?: unknown;
  active?: unknown;
  note?: unknown;
}

export async function POST(req: NextRequest) {
  const user = await authenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as CreateCustomerBody | null;
  const storeId = typeof body?.storeId === "string" ? body.storeId : "";
  if (!storeId) {
    return NextResponse.json({ error: "Loja não informada" }, { status: 400 });
  }

  const normalized = normalizeCustomerInput(body ?? {});
  if (normalized.error || !normalized.value) {
    return NextResponse.json({ error: normalized.error }, { status: 400 });
  }

  const admin = createAdminClient();
  const storeResponse = await missingStoreResponse(admin, storeId);
  if (storeResponse) return storeResponse;

  const { value } = normalized;
  const { data: customer, error } = await admin
    .from("customers")
    .insert({
      store_id: storeId,
      name: value.name,
      email: value.email,
      phone: value.phone,
      identification: value.identification,
      birth_date: value.birthDate,
      accepts_marketing: value.acceptsMarketing,
      active: value.active,
      note: value.note,
      source: "manual",
    })
    .select(customerSelect())
    .single();

  if (error) {
    return NextResponse.json(
      { error: customerErrorMessage(error.message) },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, customer }, { status: 201 });
}

async function authenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

async function missingStoreResponse(
  admin: ReturnType<typeof createAdminClient>,
  storeId: string
): Promise<NextResponse | null> {
  const { data, error } = await admin
    .from("stores")
    .select("id")
    .eq("id", storeId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) {
    return NextResponse.json({ error: "Loja não encontrada" }, { status: 404 });
  }
  return null;
}

function customerSelect(): string {
  return "id, store_id, external_customer_id, name, email, phone, identification, birth_date, accepts_marketing, active, source, total_spent, total_spent_currency, last_order_id, note, created_at, updated_at";
}

function customerErrorMessage(message: string): string {
  if (message.includes("customers_store_id_email_key")) {
    return "Esse e-mail já está cadastrado";
  }
  return customerMigrationError(message);
}
