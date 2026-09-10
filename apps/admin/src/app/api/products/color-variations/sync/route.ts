import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  fetchAllProducts,
  setProductColorVariation,
} from "@/lib/nuvemshop";
import {
  buildColorImportPreview,
  type ColorImportInput,
} from "@/lib/product-color-import";

const MAX_SYNC_ROWS = 25;

interface SyncBody {
  storeId?: unknown;
  rows?: unknown;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as SyncBody | null;
  const storeId = typeof body?.storeId === "string" ? body.storeId : "";
  const rows = parseRows(body?.rows);
  if (!storeId) {
    return NextResponse.json({ error: "Loja não informada" }, { status: 400 });
  }
  if (rows.length === 0) {
    return NextResponse.json(
      { error: "Nenhum produto foi selecionado para sincronizar" },
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
      { error: "Conecte a Nuvemshop antes de sincronizar" },
      { status: 400 }
    );
  }

  try {
    const products = await fetchAllProducts(
      store.external_store_id,
      store.access_token
    );
    const preview = buildColorImportPreview(rows, products);
    const productById = new Map(products.map((product) => [String(product.id), product]));
    const results: Array<{
      rowNumber: number;
      productExternalId: string | null;
      productName: string | null;
      color: string;
      status: "updated" | "unchanged" | "skipped" | "error";
      message: string;
    }> = [];

    for (const row of preview) {
      if (row.status === "unchanged") {
        results.push(resultFromRow(row, "unchanged", row.message));
        continue;
      }
      if (row.status !== "ready" || !row.productExternalId) {
        results.push(resultFromRow(row, "skipped", row.message));
        continue;
      }

      const product = productById.get(row.productExternalId);
      if (!product) {
        results.push(resultFromRow(row, "error", "Produto não encontrado na Nuvemshop."));
        continue;
      }

      try {
        await setProductColorVariation(
          store.external_store_id,
          store.access_token,
          product,
          row.color,
          row.colorAttributeIndex
        );
        results.push(resultFromRow(row, "updated", "Cor sincronizada."));
      } catch (caught) {
        results.push(resultFromRow(row, "error", friendlyUpdateError(caught)));
      }
    }

    return NextResponse.json({
      ok: results.every((result) => result.status !== "error"),
      results,
      summary: {
        updated: results.filter((result) => result.status === "updated").length,
        unchanged: results.filter((result) => result.status === "unchanged").length,
        skipped: results.filter((result) => result.status === "skipped").length,
        errors: results.filter((result) => result.status === "error").length,
      },
    });
  } catch (caught) {
    return NextResponse.json(
      { error: friendlyUpdateError(caught) },
      { status: 502 }
    );
  }
}

function parseRows(value: unknown): ColorImportInput[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_SYNC_ROWS).map((raw, index) => {
    const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const explicitId = asString(row.overrideExternalProductId || row.externalProductId);
    return {
      rowNumber: Number(row.rowNumber) || index + 2,
      productName: asString(row.productName),
      externalProductId: explicitId,
      sku: asString(row.sku),
      color: asString(row.color),
      overrideExternalProductId: explicitId,
    };
  });
}

function resultFromRow(
  row: ReturnType<typeof buildColorImportPreview>[number],
  status: "updated" | "unchanged" | "skipped" | "error",
  message: string
) {
  return {
    rowNumber: row.rowNumber,
    productExternalId: row.productExternalId,
    productName: row.matchedProductName,
    color: row.color,
    status,
    message,
  };
}

function asString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function friendlyUpdateError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Falha ao atualizar o produto";
  if (message.includes(" 401 ") || message.includes(" 403 ")) {
    return "A conexão não tem permissão para alterar produtos. Reconecte a loja em Integração.";
  }
  if (message.includes(" 429 ")) {
    return "A Nuvemshop limitou as atualizações por alguns instantes. Tente novamente em um minuto.";
  }
  if (message.includes(" 422 ")) {
    return "A Nuvemshop recusou a combinação de variações deste produto. Revise as variações diretamente na loja.";
  }
  return message;
}
