import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: products, error } = await admin
    .from("products")
    .select("name, external_product_id, url, image_url, created_at")
    .order("name")
    .limit(50000);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (products ?? []).map((p) => ({
    Nome: p.name,
    "ID Nuvemshop": p.external_product_id,
    URL: p.url ?? "",
    Imagem: p.image_url ?? "",
    "Criado em": p.created_at,
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows, {
    header: ["Nome", "ID Nuvemshop", "URL", "Imagem", "Criado em"],
  });
  ws["!cols"] = [
    { wch: 50 },
    { wch: 15 },
    { wch: 40 },
    { wch: 40 },
    { wch: 22 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, "Produtos");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const blob = new Blob([new Uint8Array(buf)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const filename = `produtos-${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new NextResponse(blob, {
    status: 200,
    headers: {
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
