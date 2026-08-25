import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { uploadReelVideo } from "@/lib/reel-storage";

const MAX_BYTES = 50 * 1024 * 1024; // 50 MB
const ALLOWED = new Set(["video/mp4", "video/webm", "video/quicktime"]);

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  const storeId = String(form.get("storeId") ?? "");
  if (!storeId) {
    return NextResponse.json({ error: "Loja não informada" }, { status: 400 });
  }
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "Arquivo ausente" }, { status: 400 });
  }
  if (file.size === 0 || file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Vídeo deve ter até 50 MB" },
      { status: 400 }
    );
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json(
      { error: "Formato inválido. Use MP4, WebM ou MOV" },
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

  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    const uploaded = await uploadReelVideo(admin, {
      storeId,
      fileName: file.name,
      mimeType: file.type,
      buffer,
    });
    return NextResponse.json(uploaded);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível enviar o vídeo" },
      { status: 500 }
    );
  }
}
