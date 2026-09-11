import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncKitToNuvemshop } from "@/lib/kit-sync";
import { importNativeKit } from "@/lib/native-kit-import";

// POST /api/kits/[id]/sync — re-sincroniza o kit com a Nuvemshop manualmente
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const admin = createAdminClient();
  const { data: kit } = await admin
    .from("kits")
    .select("source, nuvemshop_product_id")
    .eq("id", id)
    .maybeSingle();
  if (!kit) {
    return NextResponse.json({ error: "Kit não encontrado" }, { status: 404 });
  }
  if (kit.source === "nuvemshop_native") {
    if (!kit.nuvemshop_product_id) {
      return NextResponse.json(
        { error: "Kit nativo sem vínculo com a Nuvemshop" },
        { status: 400 }
      );
    }
    try {
      await importNativeKit(admin, String(kit.nuvemshop_product_id));
      return NextResponse.json({ ok: true });
    } catch (error) {
      return NextResponse.json(
        { error: (error as Error).message },
        { status: 400 }
      );
    }
  }
  // Re-sync manual força a atualização da galeria também
  const result = await syncKitToNuvemshop(admin, id, { syncImages: true });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
