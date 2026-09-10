import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { fetchAllProducts } from "@/lib/nuvemshop";
import {
  buildColorImportPreview,
  MAX_COLOR_IMPORT_ROWS,
  type ColorImportInput,
} from "@/lib/product-color-import";

interface PreviewBody {
  storeId?: unknown;
  rows?: unknown;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as PreviewBody | null;
  const storeId = typeof body?.storeId === "string" ? body.storeId : "";
  const rows = parseRows(body?.rows);
  if (!storeId) {
    return NextResponse.json({ error: "Loja não informada" }, { status: 400 });
  }
  if (rows.length === 0) {
    return NextResponse.json(
      { error: "A planilha não possui linhas válidas" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data: store, error } = await admin
    .from("stores")
    .select("external_store_id, access_token, platform")
    .eq("id", storeId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!store?.access_token || store.platform !== "nuvemshop") {
    return NextResponse.json(
      { error: "Conecte a Nuvemshop antes de analisar a planilha" },
      { status: 400 }
    );
  }

  try {
    const products = await fetchAllProducts(
      store.external_store_id,
      store.access_token
    );
    const preview = buildColorImportPreview(rows, products);
    return NextResponse.json({
      rows: preview,
      summary: summarize(preview),
      catalogCount: products.length,
    });
  } catch (caught) {
    return NextResponse.json(
      { error: friendlyNuvemshopError(caught) },
      { status: 502 }
    );
  }
}

function parseRows(value: unknown): ColorImportInput[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_COLOR_IMPORT_ROWS).map((raw, index) => {
    const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    return {
      rowNumber: Number(row.rowNumber) || index + 2,
      productName: asString(row.productName),
      externalProductId: asString(row.externalProductId),
      sku: asString(row.sku),
      color: asString(row.color),
      overrideExternalProductId: asString(row.overrideExternalProductId),
    };
  });
}

function summarize(rows: ReturnType<typeof buildColorImportPreview>) {
  return {
    total: rows.length,
    ready: rows.filter((row) => row.status === "ready").length,
    unchanged: rows.filter((row) => row.status === "unchanged").length,
    review: rows.filter((row) => row.status === "review").length,
    blocked: rows.filter((row) => row.status === "blocked").length,
    duplicate: rows.filter((row) => row.status === "duplicate").length,
  };
}

function asString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function friendlyNuvemshopError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Falha ao acessar a Nuvemshop";
  if (message.includes(" 401 ") || message.includes(" 403 ")) {
    return "A conexão não tem acesso aos produtos. Reconecte a loja em Integração.";
  }
  return message;
}
