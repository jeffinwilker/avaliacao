import type { SupabaseClient } from "@supabase/supabase-js";
import type { NuvemshopCustomer } from "@/lib/nuvemshop";

export interface CustomerInput {
  name: string;
  email: string | null;
  phone: string | null;
  identification: string | null;
  birthDate: string | null;
  acceptsMarketing: boolean | null;
  active: boolean;
  note: string | null;
}

export interface CustomerValidation {
  value?: CustomerInput;
  error?: string;
}

export function normalizeCustomerInput(body: {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  identification?: unknown;
  birthDate?: unknown;
  acceptsMarketing?: unknown;
  active?: unknown;
  note?: unknown;
}): CustomerValidation {
  const name = text(body.name);
  const email = text(body.email).toLowerCase() || null;
  const phone = text(body.phone) || null;
  const identification = text(body.identification) || null;
  const birthDate = normalizeDate(text(body.birthDate));
  const note = text(body.note) || null;

  if (name.length < 2 || name.length > 120) {
    return { error: "Informe o nome do cliente" };
  }
  if (!email && !phone) {
    return { error: "Informe e-mail ou telefone" };
  }
  if (email && !isValidEmail(email)) {
    return { error: "Informe um e-mail válido" };
  }
  if (text(body.birthDate) && !birthDate) {
    return { error: "Data de nascimento inválida" };
  }

  return {
    value: {
      name,
      email,
      phone,
      identification,
      birthDate,
      acceptsMarketing:
        typeof body.acceptsMarketing === "boolean" ? body.acceptsMarketing : null,
      active: typeof body.active === "boolean" ? body.active : true,
      note,
    },
  };
}

export async function upsertNuvemshopCustomer(
  admin: SupabaseClient,
  storeId: string,
  customer: NuvemshopCustomer
): Promise<"inserted" | "updated"> {
  const email = text(customer.email).toLowerCase() || null;
  const externalCustomerId = String(customer.id);

  let existing: { id: string; birth_date: string | null; note: string | null } | null =
    null;
  const { data: byExternal } = await admin
    .from("customers")
    .select("id, birth_date, note")
    .eq("store_id", storeId)
    .eq("external_customer_id", externalCustomerId)
    .maybeSingle();
  existing = byExternal ?? null;

  if (!existing && email) {
    const { data: byEmail } = await admin
      .from("customers")
      .select("id, birth_date, note")
      .eq("store_id", storeId)
      .eq("email", email)
      .maybeSingle();
    existing = byEmail ?? null;
  }

  const birthDate = extractBirthDate(customer.extra) ?? existing?.birth_date ?? null;
  const row = {
    store_id: storeId,
    external_customer_id: externalCustomerId,
    name: text(customer.name) || email || `Cliente ${customer.id}`,
    email,
    phone: text(customer.phone) || null,
    identification: text(customer.identification) || null,
    birth_date: birthDate,
    accepts_marketing:
      typeof customer.accepts_marketing === "boolean"
        ? customer.accepts_marketing
        : null,
    active: customer.active !== false,
    source: "nuvemshop",
    total_spent: numberOrNull(customer.total_spent),
    total_spent_currency: text(customer.total_spent_currency) || null,
    last_order_id:
      customer.last_order_id != null ? String(customer.last_order_id) : null,
    note: existing?.note ?? null,
    nuvemshop_note: text(customer.note) || null,
    default_address: customer.default_address ?? null,
    billing_address: billingAddress(customer),
    extra: customer.extra ?? {},
    last_synced_at: new Date().toISOString(),
    external_created_at: validTimestamp(customer.created_at),
    external_updated_at: validTimestamp(customer.updated_at),
  };

  if (existing) {
    const { error } = await admin
      .from("customers")
      .update(row)
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
    return "updated";
  }

  const { error } = await admin.from("customers").insert(row);
  if (error) throw new Error(error.message);
  return "inserted";
}

export async function upsertOrderCustomer(
  admin: SupabaseClient,
  input: {
    storeId: string;
    externalCustomerId?: string | number | null;
    name: string;
    email?: string | null;
    phone?: string | null;
  }
): Promise<string | null> {
  const email = text(input.email).toLowerCase() || null;
  const phone = text(input.phone) || null;
  if (!email && !phone) return null;

  const externalCustomerId =
    input.externalCustomerId != null ? String(input.externalCustomerId) : null;
  let existing: { id: string } | null = null;

  if (externalCustomerId) {
    const { data } = await admin
      .from("customers")
      .select("id")
      .eq("store_id", input.storeId)
      .eq("external_customer_id", externalCustomerId)
      .maybeSingle();
    existing = data ?? null;
  }

  if (!existing && email) {
    const { data } = await admin
      .from("customers")
      .select("id")
      .eq("store_id", input.storeId)
      .eq("email", email)
      .maybeSingle();
    existing = data ?? null;
  }

  const row = {
    store_id: input.storeId,
    name: text(input.name) || email || phone || "Cliente",
    email,
    phone,
    active: true,
    last_synced_at: new Date().toISOString(),
  };

  if (existing) {
    const update = {
      ...row,
      ...(externalCustomerId ? { external_customer_id: externalCustomerId } : {}),
    };
    const { error } = await admin
      .from("customers")
      .update(update)
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
    return existing.id;
  }

  const { data, error } = await admin
    .from("customers")
    .insert({
      ...row,
      external_customer_id: externalCustomerId,
      source: "order",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data?.id ?? null;
}

export async function markNuvemshopCustomerInactive(
  admin: SupabaseClient,
  storeId: string,
  externalCustomerId: string | number
) {
  const now = new Date().toISOString();
  const { error } = await admin
    .from("customers")
    .update({
      active: false,
      last_synced_at: now,
      external_updated_at: now,
    })
    .eq("store_id", storeId)
    .eq("external_customer_id", String(externalCustomerId));
  if (error) throw new Error(error.message);
}

export function customerMigrationError(message: string): string {
  const tableMissing =
    message.includes("customers") &&
    (message.includes("schema cache") || message.includes("does not exist"));
  const birthdayMissing =
    message.includes("birthday_collection") ||
    message.includes("customer_birthdate_requests");
  if (birthdayMissing) {
    return "Execute a migration 0017_birthday_collection.sql no Supabase";
  }
  return tableMissing
    ? "Execute a migration 0016_customers.sql no Supabase"
    : message;
}

export function normalizeBirthDateInput(value: unknown): string | null {
  return normalizeDate(text(value));
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function normalizeDate(value: string): string | null {
  if (!value) return null;
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return validDateParts(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const br = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) return validDateParts(Number(br[3]), Number(br[2]), Number(br[1]));
  return null;
}

function validDateParts(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  if (year < 1900 || year > new Date().getFullYear()) return null;
  return `${year.toString().padStart(4, "0")}-${month
    .toString()
    .padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

function extractBirthDate(extra: Record<string, unknown> | null | undefined): string | null {
  if (!extra || typeof extra !== "object") return null;
  const candidates = [
    "birth_date",
    "birthday",
    "date_of_birth",
    "data_nascimento",
    "data_de_nascimento",
    "nascimento",
    "aniversario",
    "aniversário",
  ];
  for (const key of candidates) {
    const value = extra[key];
    if (typeof value !== "string") continue;
    const normalized = normalizeDate(value);
    if (normalized) return normalized;
  }
  return null;
}

function numberOrNull(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function validTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function billingAddress(customer: NuvemshopCustomer): Record<string, unknown> {
  return {
    address: customer.billing_address ?? null,
    number: customer.billing_number ?? null,
    floor: customer.billing_floor ?? null,
    locality: customer.billing_locality ?? null,
    zipcode: customer.billing_zipcode ?? null,
    city: customer.billing_city ?? null,
    province: customer.billing_province ?? null,
    country: customer.billing_country ?? null,
    phone: customer.billing_phone ?? null,
  };
}
