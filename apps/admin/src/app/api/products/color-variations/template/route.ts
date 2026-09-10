import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: store } = await admin.from("stores").select("id").limit(1).maybeSingle();
  if (!store) {
    return NextResponse.json({ error: "Loja não encontrada" }, { status: 404 });
  }

  const { data: products, error } = await admin
    .from("products")
    .select("name, external_product_id")
    .eq("store_id", store.id)
    .order("name")
    .limit(50000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (products ?? []).map((product) => ({
    Produto: product.name,
    "ID Nuvemshop": product.external_product_id,
    Cor: "",
  }));
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows, {
    header: ["Produto", "ID Nuvemshop", "Cor"],
  });
  worksheet["!cols"] = [{ wch: 54 }, { wch: 18 }, { wch: 24 }];
  XLSX.utils.book_append_sheet(workbook, worksheet, "Cores dos produtos");
  const buffer = XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
  }) as Buffer;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        'attachment; filename="modelo-cores-produtos.xlsx"',
    },
  });
}
