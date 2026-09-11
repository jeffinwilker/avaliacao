import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { importNativeKit } from "@/lib/native-kit-import";

// POST /api/kits/import-native — espelha um kit criado no painel da Nuvemshop.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { value?: string };
  try {
    const result = await importNativeKit(
      createAdminClient(),
      String(body.value ?? "")
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Falha ao importar o kit nativo." },
      { status: 400 }
    );
  }
}
