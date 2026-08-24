import { NextResponse, type NextRequest } from "next/server";
import {
  AUTOMATION_STORAGE_BUCKET,
  type AutomationMediaAsset,
} from "@avaliacoes/shared";
import {
  displayFileName,
  inferImageMimeType,
} from "@/lib/automation-media";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  const storeId = form.get("storeId");
  if (!file || typeof file === "string" || typeof storeId !== "string") {
    return NextResponse.json({ error: "Arquivo ou loja ausente" }, { status: 400 });
  }
  if (file.size === 0 || file.size > MAX_BYTES) {
    return NextResponse.json({ error: "A imagem deve ter até 8 MB" }, { status: 400 });
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json(
      { error: "Use uma imagem JPG, PNG, WEBP ou GIF" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data: store } = await admin
    .from("stores")
    .select("id")
    .eq("id", storeId)
    .maybeSingle();
  if (!store) {
    return NextResponse.json({ error: "Loja não encontrada" }, { status: 404 });
  }

  const safeName = file.name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "imagem.jpg";
  const fileName = `${crypto.randomUUID()}--${safeName}`;
  const path = `${storeId}/${fileName}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await admin.storage
    .from(AUTOMATION_STORAGE_BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data } = admin.storage
    .from(AUTOMATION_STORAGE_BUCKET)
    .getPublicUrl(path);
  const asset: AutomationMediaAsset = {
    name: displayFileName(fileName),
    url: data.publicUrl,
    path,
    mimeType: file.type || inferImageMimeType(fileName),
  };
  return NextResponse.json({ asset });
}
