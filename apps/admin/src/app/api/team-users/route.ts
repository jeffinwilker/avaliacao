import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

interface CreateUserBody {
  storeId?: unknown;
  name?: unknown;
  email?: unknown;
  password?: unknown;
}

interface DeleteUserBody {
  storeId?: unknown;
  userId?: unknown;
}

export async function POST(req: NextRequest) {
  const auth = await authenticatedUser();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null) as CreateUserBody | null;
  const storeId = typeof body?.storeId === "string" ? body.storeId : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email =
    typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!storeId || name.length < 2 || name.length > 100) {
    return NextResponse.json(
      { error: "Informe o nome da pessoa" },
      { status: 400 }
    );
  }
  if (!isValidEmail(email)) {
    return NextResponse.json(
      { error: "Informe um e-mail válido" },
      { status: 400 }
    );
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "A senha inicial precisa ter pelo menos 8 caracteres" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const missingStoreResponse = await storeMissingResponse(admin, storeId);
  if (missingStoreResponse) return missingStoreResponse;

  const { data: existingMember, error: existingError } = await admin
    .from("store_members")
    .select("id")
    .eq("store_id", storeId)
    .eq("email", email)
    .maybeSingle();
  if (existingError) {
    return migrationError(existingError.message);
  }
  if (existingMember) {
    return NextResponse.json(
      { error: "Esse e-mail já possui acesso à loja" },
      { status: 409 }
    );
  }

  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
    });
  if (createError || !created.user) {
    return NextResponse.json(
      { error: translateCreateUserError(createError?.message) },
      { status: 400 }
    );
  }

  const { data: member, error: memberError } = await admin
    .from("store_members")
    .insert({
      store_id: storeId,
      user_id: created.user.id,
      name,
      email,
      role: "member",
      created_by: auth.id,
    })
    .select("id, user_id, name, email, role, created_at")
    .single();

  if (memberError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return migrationError(memberError.message);
  }

  return NextResponse.json({ ok: true, member }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const auth = await authenticatedUser();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null) as DeleteUserBody | null;
  const storeId = typeof body?.storeId === "string" ? body.storeId : "";
  const userId = typeof body?.userId === "string" ? body.userId : "";
  if (!storeId || !userId) {
    return NextResponse.json(
      { error: "Usuário não informado" },
      { status: 400 }
    );
  }
  if (userId === auth.id) {
    return NextResponse.json(
      { error: "Você não pode remover o próprio acesso" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const missingStoreResponse = await storeMissingResponse(admin, storeId);
  if (missingStoreResponse) return missingStoreResponse;

  const { data: target, error: targetError } = await admin
    .from("store_members")
    .select("user_id, role")
    .eq("store_id", storeId)
    .eq("user_id", userId)
    .maybeSingle();
  if (targetError) return migrationError(targetError.message);
  if (!target) {
    return NextResponse.json(
      { error: "Usuário não encontrado" },
      { status: 404 }
    );
  }
  if (target.role === "owner") {
    return NextResponse.json(
      { error: "O administrador principal não pode ser removido" },
      { status: 400 }
    );
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(target.user_id);
  if (deleteError) {
    return NextResponse.json(
      { error: "Não foi possível remover esse acesso" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}

async function authenticatedUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

async function storeMissingResponse(
  admin: ReturnType<typeof createAdminClient>,
  storeId: string
): Promise<NextResponse | null> {
  const { data, error } = await admin
    .from("stores")
    .select("id")
    .eq("id", storeId)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Loja não encontrada" }, { status: 404 });
  }
  return null;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function translateCreateUserError(message?: string): string {
  const normalized = message?.toLowerCase() || "";
  if (normalized.includes("already") || normalized.includes("registered")) {
    return "Esse e-mail já está cadastrado";
  }
  if (normalized.includes("password")) {
    return "A senha inicial não atende aos requisitos de segurança";
  }
  return "Não foi possível criar o usuário";
}

function migrationError(message: string) {
  const tableMissing =
    message.includes("store_members") &&
    (message.includes("schema cache") || message.includes("does not exist"));
  return NextResponse.json(
    {
      error: tableMissing
        ? "Execute a migration 0014_store_members.sql no Supabase"
        : message,
    },
    { status: 500 }
  );
}
