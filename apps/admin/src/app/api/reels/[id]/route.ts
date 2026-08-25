import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { removeReelVideo } from "@/lib/reel-storage";

interface UpdateReelBody {
  storeId?: unknown;
  productId?: unknown;
  title?: unknown;
  videoUrl?: unknown;
  storagePath?: unknown;
  storageProvider?: unknown;
  thumbnailUrl?: unknown;
  active?: unknown;
  ordering?: unknown;
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const user = await authenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = (await req.json().catch(() => null)) as UpdateReelBody | null;
  const storeId = asString(body?.storeId);
  const productId = asString(body?.productId);
  const title = asString(body?.title).trim();
  const videoUrl = asString(body?.videoUrl).trim();
  const storagePath = asString(body?.storagePath).trim();
  const storageProvider = asStorageProvider(body?.storageProvider);
  const thumbnailUrl = asString(body?.thumbnailUrl).trim();

  if (!storeId) return badRequest("Loja não informada");
  if (!productId) return badRequest("Escolha um produto");
  if (title.length < 2 || title.length > 80) {
    return badRequest("Informe um título com até 80 caracteres");
  }
  if (videoUrl && !isHttpUrl(videoUrl)) {
    return badRequest("Envie um vídeo válido antes de salvar");
  }

  const admin = createAdminClient();
  const { data: current, error: currentError } = await admin
    .from("product_reels")
    .select("id, store_id, storage_provider, storage_path")
    .eq("id", id)
    .eq("store_id", storeId)
    .maybeSingle();
  if (currentError) return migrationError(currentError.message);
  if (!current) {
    return NextResponse.json({ error: "Reel não encontrado" }, { status: 404 });
  }

  const productResponse = await productMissingResponse(admin, storeId, productId);
  if (productResponse) return productResponse;

  const update: Record<string, unknown> = {
    product_id: productId,
    title,
    active: typeof body?.active === "boolean" ? body.active : true,
    ordering: safeOrdering(body?.ordering),
  };
  if (videoUrl) update.video_url = videoUrl;
  if (storagePath) {
    update.storage_provider = storageProvider;
    update.storage_path = storagePath;
  }
  update.thumbnail_url = thumbnailUrl || null;

  const { data: reel, error } = await admin
    .from("product_reels")
    .update(update)
    .eq("id", id)
    .eq("store_id", storeId)
    .select("id, store_id, product_id, title, video_url, storage_provider, storage_path, thumbnail_url, active, ordering, created_at, updated_at")
    .single();

  if (error) return migrationError(error.message);

  if (
    storagePath &&
    current.storage_path &&
    current.storage_path !== storagePath
  ) {
    await removeReelVideo(admin, current.storage_provider, current.storage_path);
  }

  return NextResponse.json({ ok: true, reel });
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const user = await authenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { storeId?: unknown } | null;
  const storeId = asString(body?.storeId);
  if (!storeId) return badRequest("Loja não informada");

  const admin = createAdminClient();
  const { data: current, error: currentError } = await admin
    .from("product_reels")
    .select("id, storage_provider, storage_path")
    .eq("id", id)
    .eq("store_id", storeId)
    .maybeSingle();
  if (currentError) return migrationError(currentError.message);
  if (!current) {
    return NextResponse.json({ error: "Reel não encontrado" }, { status: 404 });
  }

  const { error } = await admin
    .from("product_reels")
    .delete()
    .eq("id", id)
    .eq("store_id", storeId);
  if (error) return migrationError(error.message);

  if (current.storage_path) {
    await removeReelVideo(admin, current.storage_provider, current.storage_path);
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

async function productMissingResponse(
  admin: ReturnType<typeof createAdminClient>,
  storeId: string,
  productId: string
): Promise<NextResponse | null> {
  const { data, error } = await admin
    .from("products")
    .select("id")
    .eq("store_id", storeId)
    .eq("id", productId)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 });
  }
  return null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asStorageProvider(value: unknown): "supabase" | "r2" {
  return value === "r2" ? "r2" : "supabase";
}

function safeOrdering(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

function isHttpUrl(value: string): boolean {
  return value.startsWith("http://") || value.startsWith("https://");
}

function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}

function migrationError(message: string) {
  const tableMissing =
    message.includes("product_reels") &&
    (message.includes("schema cache") || message.includes("does not exist"));
  return NextResponse.json(
    {
      error: tableMissing
        ? "Execute a migration 0015_product_reels.sql no Supabase"
        : message,
    },
    { status: 500 }
  );
}
