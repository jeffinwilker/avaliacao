import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  customerMigrationError,
  normalizeCustomerInput,
  type CustomerInput,
} from "@/lib/customers";

interface ImportCustomersBody {
  storeId?: unknown;
  customers?: unknown;
}

interface ExistingCustomer {
  id: string;
  email: string | null;
  phone: string | null;
  identification: string | null;
  birth_date: string | null;
  accepts_marketing: boolean | null;
  active: boolean;
  note: string | null;
  source: "manual" | "nuvemshop" | "order";
}

interface NormalizedImportRow {
  value: CustomerInput;
  provided: Set<keyof CustomerInput>;
}

const MAX_CUSTOMERS = 10_000;
const UPSERT_CHUNK_SIZE = 500;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as ImportCustomersBody | null;
  const storeId = typeof body?.storeId === "string" ? body.storeId : "";
  const customers = Array.isArray(body?.customers) ? body.customers : null;
  if (!storeId) {
    return NextResponse.json({ error: "Loja não informada" }, { status: 400 });
  }
  if (!customers?.length) {
    return NextResponse.json({ error: "Nenhum cliente válido para importar" }, { status: 400 });
  }
  if (customers.length > MAX_CUSTOMERS) {
    return NextResponse.json(
      { error: `Importe no máximo ${MAX_CUSTOMERS.toLocaleString("pt-BR")} clientes por arquivo` },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data: store, error: storeError } = await admin
    .from("stores")
    .select("id")
    .eq("id", storeId)
    .maybeSingle();
  if (storeError) {
    return NextResponse.json({ error: storeError.message }, { status: 500 });
  }
  if (!store) {
    return NextResponse.json({ error: "Loja não encontrada" }, { status: 404 });
  }

  const normalizedRows: NormalizedImportRow[] = [];
  let skipped = 0;
  for (const rawCustomer of customers) {
    if (!rawCustomer || typeof rawCustomer !== "object") {
      skipped += 1;
      continue;
    }
    const rawRecord = rawCustomer as Record<string, unknown>;
    const normalized = normalizeCustomerInput(rawRecord);
    if (!normalized.value) {
      skipped += 1;
      continue;
    }
    if (!customerKey(normalized.value.email, normalized.value.phone)) {
      skipped += 1;
      continue;
    }
    normalizedRows.push({
      value: normalized.value,
      provided: new Set(
        (Object.keys(normalized.value) as Array<keyof CustomerInput>).filter(
          (field) => Object.prototype.hasOwnProperty.call(rawRecord, field)
        )
      ),
    });
  }

  if (!normalizedRows.length) {
    return NextResponse.json({ error: "Nenhum cliente válido para importar" }, { status: 400 });
  }

  const currentCustomers: ExistingCustomer[] = [];
  for (let from = 0; ; from += 1_000) {
    const { data, error } = await admin
      .from("customers")
      .select("id, email, phone, identification, birth_date, accepts_marketing, active, note, source")
      .eq("store_id", storeId)
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) {
      return NextResponse.json(
        { error: customerMigrationError(error.message) },
        { status: 500 }
      );
    }
    const page = (data ?? []) as ExistingCustomer[];
    currentCustomers.push(...page);
    if (page.length < 1_000) break;
  }

  const existingByKey = new Map<string, ExistingCustomer>();
  for (const customer of currentCustomers) {
    const emailKey = emailCustomerKey(customer.email);
    const phoneKey = phoneCustomerKey(customer.phone);
    if (emailKey) existingByKey.set(emailKey, customer);
    if (phoneKey) existingByKey.set(phoneKey, customer);
  }

  const existingIds = new Set(currentCustomers.map((customer) => customer.id));
  const sourceById = new Map(
    currentCustomers.map((customer) => [customer.id, customer.source])
  );
  const assignedByKey = new Map(existingByKey);
  const rowsById = new Map<string, {
    id: string;
    store_id: string;
    name: string;
    email: string | null;
    phone: string | null;
    identification: string | null;
    birth_date: string | null;
    accepts_marketing: boolean | null;
    active: boolean;
    note: string | null;
    source: "manual" | "nuvemshop" | "order";
  }>();

  for (const { value, provided } of normalizedRows) {
    const existing =
      (value.email ? assignedByKey.get(emailCustomerKey(value.email)) : undefined) ??
      (value.phone ? assignedByKey.get(phoneCustomerKey(value.phone)) : undefined);
    const id = existing?.id ?? randomUUID();
    if (rowsById.has(id)) skipped += 1;
    const source = existing?.source ?? sourceById.get(id) ?? "manual";
    const row = {
      id,
      store_id: storeId,
      name: value.name,
      email: provided.has("email") ? value.email : existing?.email ?? value.email,
      phone: provided.has("phone") ? value.phone : existing?.phone ?? value.phone,
      identification: provided.has("identification")
        ? value.identification
        : existing?.identification ?? value.identification,
      birth_date: provided.has("birthDate")
        ? value.birthDate
        : existing?.birth_date ?? value.birthDate,
      accepts_marketing: provided.has("acceptsMarketing")
        ? value.acceptsMarketing
        : existing?.accepts_marketing ?? value.acceptsMarketing,
      active: provided.has("active") ? value.active : existing?.active ?? value.active,
      note: provided.has("note") ? value.note : existing?.note ?? value.note,
      source,
    };
    rowsById.set(id, row);
    const reference: ExistingCustomer = {
      id,
      email: row.email,
      phone: row.phone,
      identification: row.identification,
      birth_date: row.birth_date,
      accepts_marketing: row.accepts_marketing,
      active: row.active,
      note: row.note,
      source,
    };
    const emailKey = emailCustomerKey(row.email);
    const phoneKey = phoneCustomerKey(row.phone);
    if (emailKey) assignedByKey.set(emailKey, reference);
    if (phoneKey) assignedByKey.set(phoneKey, reference);
  }

  const rows = Array.from(rowsById.values());
  const inserted = rows.filter((row) => !existingIds.has(row.id)).length;
  const updated = rows.length - inserted;

  for (let index = 0; index < rows.length; index += UPSERT_CHUNK_SIZE) {
    const chunk = rows.slice(index, index + UPSERT_CHUNK_SIZE);
    const { error } = await admin.from("customers").upsert(chunk, { onConflict: "id" });
    if (error) {
      return NextResponse.json(
        { error: importErrorMessage(error.message) },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ ok: true, inserted, updated, skipped });
}

function customerKey(email: string | null, phone: string | null): string {
  return emailCustomerKey(email) || phoneCustomerKey(phone);
}

function emailCustomerKey(email: string | null): string {
  return email ? `email:${email.trim().toLowerCase()}` : "";
}

function phoneCustomerKey(phone: string | null): string {
  const digits = phone?.replace(/\D/g, "") ?? "";
  return digits ? `phone:${digits}` : "";
}

function importErrorMessage(message: string): string {
  if (message.includes("customers_store_id_email_key")) {
    return "Existem e-mails duplicados entre os clientes já cadastrados";
  }
  return customerMigrationError(message);
}
