import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { fetchAllProducts } from "@/lib/nuvemshop";
import { productName, variantName } from "@/lib/product-color-import";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: store, error } = await admin.from("stores")
    .select("external_store_id, access_token, platform").limit(1).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!store?.access_token || store.platform !== "nuvemshop") {
    return NextResponse.json({ error: "Conecte a Nuvemshop antes de baixar o modelo." }, { status: 400 });
  }

  try {
    const products = await fetchAllProducts(store.external_store_id, store.access_token);
    const rows = products.flatMap((product) => (product.variants ?? []).map((variant) => ({
      Produto: productName(product),
      "ID Nuvemshop": String(product.id),
      "ID da variação": String(variant.id),
      "Variação": variantName(product, variant),
      "SKU atual": variant.sku ?? "",
      "Novo SKU": "",
      Cor: "",
    })));
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(rows, {
      header: ["Produto", "ID Nuvemshop", "ID da variação", "Variação", "SKU atual", "Novo SKU", "Cor"],
    });
    worksheet["!cols"] = [54, 18, 18, 40, 24, 24, 24].map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(workbook, worksheet, "Cores e SKUs");
    const buffer = XLSX.write(workbook, {
      type: "buffer",
      bookType: "xlsx",
    }) as Buffer;

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="modelo-cores-skus.xlsx"',
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Não foi possível buscar as variações na Nuvemshop. Tente novamente." }, { status: 502 });
  }
}
