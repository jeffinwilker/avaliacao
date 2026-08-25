import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  customerMigrationError,
  normalizeCustomerInput,
} from "@/lib/customers";

interface UpdateCustomerBody {
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

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const user = await authenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = (await req.json().catch(() => null)) as UpdateCustomerBody | null;
  const storeId = typeof body?.storeId === "string" ? body.storeId : "";
  if (!storeId) {
    return NextResponse.json({ error: "Loja não informada" }, { status: 400 });
  }

  const normalized = normalizeCustomerInput(body ?? {});
  if (normalized.error || !normalized.value) {
    return NextResponse.json({ error: normalized.error }, { status: 400 });
  }

  const { value } = normalized;
  const admin = createAdminClient();
  const { data: customer, error } = await admin
    .from("customers")
    .update({
      name: value.name,
      email: value.email,
      phone: value.phone,
      identification: value.identification,
      birth_date: value.birthDate,
      accepts_marketing: value.acceptsMarketing,
      active: value.active,
      note: value.note,
    })
    .eq("id", id)
    .eq("store_id", storeId)
    .select(customerSelect())
    .single();

  if (error) {
    return NextResponse.json(
      { error: customerErrorMessage(error.message) },
      { status: error.message.includes("JSON object requested") ? 404 : 500 }
    );
  }

  return NextResponse.json({ ok: true, customer });
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const user = await authenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { storeId?: unknown } | null;
  const storeId = typeof body?.storeId === "string" ? body.storeId : "";
  if (!storeId) {
    return NextResponse.json({ error: "Loja não informada" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("customers")
    .delete()
    .eq("id", id)
    .eq("store_id", storeId);

  if (error) {
    return NextResponse.json(
      { error: customerMigrationError(error.message) },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}

async function authenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

function customerSelect(): string {
  return "id, store_id, external_customer_id, name, email, phone, identification, birth_date, accepts_marketing, active, source, total_spent, total_spent_currency, last_order_id, note, created_at, updated_at";
}

function customerErrorMessage(message: string): string {
  if (message.includes("customers_store_id_email_key")) {
    return "Esse e-mail já está cadastrado";
  }
  if (message.includes("JSON object requested")) {
    return "Cliente não encontrado";
  }
  return customerMigrationError(message);
}
