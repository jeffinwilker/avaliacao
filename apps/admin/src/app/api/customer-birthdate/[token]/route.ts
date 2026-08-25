import { NextResponse, type NextRequest } from "next/server";
import {
  customerMigrationError,
  normalizeBirthDateInput,
} from "@/lib/customers";
import { createAdminClient } from "@/lib/supabase/admin";

interface RouteParams {
  params: Promise<{ token: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { token } = await params;
  const body = (await req.json().catch(() => null)) as {
    birthDate?: unknown;
    acceptsMarketing?: unknown;
  } | null;
  const birthDate = normalizeBirthDateInput(body?.birthDate);

  if (!birthDate) {
    return NextResponse.json(
      { error: "Informe uma data de nascimento válida" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data: request, error } = await admin
    .from("customer_birthdate_requests")
    .select("id, store_id, customer_id, status, expires_at")
    .eq("token", token)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: customerMigrationError(error.message) },
      { status: 500 }
    );
  }
  if (!request) {
    return NextResponse.json({ error: "Link inválido" }, { status: 404 });
  }
  if (request.status !== "pending") {
    return NextResponse.json(
      { error: "Este link já foi utilizado" },
      { status: 400 }
    );
  }
  if (request.expires_at && Date.parse(request.expires_at) < Date.now()) {
    await admin
      .from("customer_birthdate_requests")
      .update({ status: "expired" })
      .eq("id", request.id);
    return NextResponse.json(
      { error: "Este link expirou" },
      { status: 400 }
    );
  }

  const { error: updateCustomerError } = await admin
    .from("customers")
    .update({
      birth_date: birthDate,
      accepts_marketing:
        typeof body?.acceptsMarketing === "boolean"
          ? body.acceptsMarketing
          : true,
      active: true,
    })
    .eq("id", request.customer_id)
    .eq("store_id", request.store_id);
  if (updateCustomerError) {
    return NextResponse.json(
      { error: customerMigrationError(updateCustomerError.message) },
      { status: 500 }
    );
  }

  const now = new Date().toISOString();
  await Promise.all([
    admin
      .from("customer_birthdate_requests")
      .update({
        status: "completed",
        completed_at: now,
      })
      .eq("id", request.id),
    admin
      .from("automation_messages")
      .update({
        status: "cancelled",
        error_message: "Aniversário preenchido pelo cliente",
      })
      .eq("store_id", request.store_id)
      .eq("automation_type", "birthday_collection")
      .eq("external_reference", request.customer_id)
      .eq("status", "scheduled"),
  ]);

  return NextResponse.json({ ok: true });
}
