"use client";

import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import clsx from "clsx";
import { isSummarizedSkuSheet } from "@/lib/product-import-format";

export interface ColorProductOption {
  externalProductId: string;
  name: string;
  imageUrl: string | null;
}

type FieldKey = "productName" | "externalProductId" | "sku" | "color" | "newSku" | "variantId" | "variation";
type RawRow = Record<string, unknown>;
type PreviewStatus = "ready" | "unchanged" | "review" | "blocked" | "duplicate";

interface PreviewCandidate {
  externalProductId: string;
  name: string;
  imageUrl: string | null;
  score: number;
}

interface PreviewRow {
  rowNumber: number;
  productName: string;
  externalProductId: string;
  sku: string;
  color: string;
  newSku: string;
  variantId: string;
  variation: string;
  variantExternalId: string | null;
  variantLabel: string;
  currentSku: string;
  variantOptions: Array<{ id: string; label: string; sku: string }>;
  productExternalId: string | null;
  matchedProductName: string | null;
  productImageUrl: string | null;
  matchMethod: "override" | "id" | "sku" | "name" | "similar" | null;
  matchScore: number;
  status: PreviewStatus;
  message: string;
  currentColors: string[];
  candidates: PreviewCandidate[];
}

interface PreviewSummary {
  total: number;
  ready: number;
  unchanged: number;
  review: number;
  blocked: number;
  duplicate: number;
}

interface SyncResult {
  summary: {
    updated: number;
    unchanged: number;
    skipped: number;
    errors: number;
  };
  results: Array<{
    rowNumber: number;
    productName: string | null;
    color: string;
    status: "updated" | "unchanged" | "skipped" | "error";
    message: string;
  }>;
}

const FIELD_LABELS: Record<FieldKey, string> = {
  productName: "Nome do produto",
  externalProductId: "ID do produto na Nuvemshop",
  sku: "SKU atual (identificação)",
  color: "Cor",
  newSku: "Novo SKU",
  variantId: "ID da variação",
  variation: "Variação (opções ou tamanho)",
};

const FIELD_ALIASES: Record<FieldKey, string[]> = {
  productName: ["produto", "nome do produto", "product", "product name", "nome"],
  externalProductId: [
    "id nuvemshop",
    "id do produto",
    "product id",
    "nuvemshop id",
  ],
  sku: ["sku atual", "sku", "codigo", "codigo do produto", "referencia", "ref"],
  color: ["cor", "color", "colour", "nome da cor", "cor do produto"],
  newSku: ["novo sku", "sku novo", "novo codigo", "new sku"],
  variantId: ["id da variacao", "id variacao", "variant id", "id variante"],
  variation: ["variacao", "opcoes", "tamanho", "variation", "size"],
};

const PAGE_SIZE = 50;

export function ColorVariationImporter({
  storeId,
  products,
  canSync,
}: {
  storeId: string;
  products: ColorProductOption[];
  canSync: boolean;
}) {
  const [fileName, setFileName] = useState("");
  const [rawRows, setRawRows] = useState<RawRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Partial<Record<FieldKey, string>>>({});
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [summary, setSummary] = useState<PreviewSummary | null>(null);
  const [overrides, setOverrides] = useState<Record<number, string>>({});
  const [variantOverrides, setVariantOverrides] = useState<Record<number, string>>({});
  const [filter, setFilter] = useState<"all" | "ready" | "attention">("all");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ done: 0, total: 0 });
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SyncResult | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const filteredRows = useMemo(() => {
    if (filter === "ready") {
      return previewRows.filter((row) => row.status === "ready");
    }
    if (filter === "attention") {
      return previewRows.filter(
        (row) => row.status === "review" || row.status === "blocked"
      );
    }
    return previewRows;
  }, [filter, previewRows]);
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const visibleRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const canAnalyze =
    Boolean(mapping.color || mapping.newSku) &&
    Boolean(mapping.productName || mapping.externalProductId || mapping.sku || mapping.variantId) &&
    rawRows.length > 0;

  async function handleFile(file: File) {
    setError(null);
    setResult(null);
    try {
      const workbook = XLSX.read(new Uint8Array(await file.arrayBuffer()), {
        type: "array",
      });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!worksheet) throw new Error("A planilha não possui uma aba válida.");
      const parsed = XLSX.utils
        .sheet_to_json<RawRow>(worksheet, { defval: "", raw: false })
        .filter((row) => Object.values(row).some((value) => String(value).trim()));
      if (parsed.length === 0) throw new Error("A planilha está vazia.");
      if (parsed.length > 5000) {
        throw new Error("Use uma planilha com no máximo 5.000 linhas por vez.");
      }
      const detectedHeaders = Object.keys(parsed[0]);
      setFileName(file.name);
      setRawRows(parsed);
      setHeaders(detectedHeaders);
      const detectedMapping = guessMapping(detectedHeaders);
      if (isSummarizedSkuSheet(detectedHeaders, parsed.map((row) => cell(row, detectedMapping.productName)))) {
        detectedMapping.newSku = detectedMapping.sku;
        delete detectedMapping.sku;
      }
      setMapping(detectedMapping);
      setPreviewRows([]);
      setSummary(null);
      setOverrides({});
      setVariantOverrides({});
      setDirty(false);
      setPage(1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível ler a planilha.");
      resetFile(false);
    }
  }

  async function analyze() {
    if (!canAnalyze || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/products/color-variations/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ storeId, rows: buildRequestRows() }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "Não foi possível analisar a planilha.");
      setPreviewRows(json.rows ?? []);
      setSummary(json.summary ?? null);
      setDirty(false);
      setFilter("all");
      setPage(1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível analisar.");
    } finally {
      setLoading(false);
    }
  }

  async function synchronize() {
    if (!summary?.ready || syncing || dirty) return;
    const confirmed = window.confirm(
      `Sincronizar ${summary.ready} linha${summary.ready === 1 ? "" : "s"} de cores e SKUs na Nuvemshop?`
    );
    if (!confirmed) return;

    setSyncing(true);
    setSyncProgress({ done: 0, total: summary.ready });
    setError(null);
    setResult(null);
    const combined: SyncResult = {
      summary: { updated: 0, unchanged: 0, skipped: 0, errors: 0 },
      results: [],
    };
    try {
      const rows = previewRows.filter((row) => row.status === "ready").map((row) => ({
        rowNumber: row.rowNumber,
        productName: row.productName,
        externalProductId: row.productExternalId ?? row.externalProductId,
        overrideExternalProductId: row.productExternalId ?? "",
        sku: row.sku,
        color: row.color,
        newSku: row.newSku,
        variantId: row.variantExternalId ?? row.variantId,
        variation: row.variation,
      }));
      for (let start = 0; start < rows.length; start += 20) {
        const batch = rows.slice(start, start + 20);
        const response = await fetch("/api/products/color-variations/sync", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ storeId, rows: batch }),
        });
        const json = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(json.error || "Não foi possível sincronizar os dados.");
        }
        const batchResult = json as SyncResult;
        combined.results.push(...batchResult.results);
        combined.summary.updated += batchResult.summary.updated;
        combined.summary.unchanged += batchResult.summary.unchanged;
        combined.summary.skipped += batchResult.summary.skipped;
        combined.summary.errors += batchResult.summary.errors;
        setSyncProgress({
          done: Math.min(start + batch.length, rows.length),
          total: rows.length,
        });
      }
      setResult(combined);
    } catch (caught) {
      if (combined.results.length > 0) setResult(combined);
      const reason = caught instanceof Error ? caught.message : "Não foi possível sincronizar.";
      setError(
        combined.results.length > 0
          ? `A sincronização parou após ${combined.results.length} linha${combined.results.length === 1 ? "" : "s"}. ${reason}`
          : reason
      );
    } finally {
      setSyncing(false);
      setDirty(true);
    }
  }

  function buildRequestRows() {
    return rawRows.map((row, index) => ({
      rowNumber: index + 2,
      productName: cell(row, mapping.productName),
      externalProductId: cell(row, mapping.externalProductId),
      sku: cell(row, mapping.sku),
      color: cell(row, mapping.color),
      newSku: cell(row, mapping.newSku),
      variantId: variantOverrides[index + 2] ?? cell(row, mapping.variantId),
      variation: cell(row, mapping.variation),
      overrideExternalProductId: overrides[index + 2] ?? "",
    }));
  }

  function changeMapping(field: FieldKey, value: string) {
    setMapping((current) => ({ ...current, [field]: value }));
    setPreviewRows([]);
    setSummary(null);
    setResult(null);
    setDirty(false);
  }

  function chooseProduct(rowNumber: number, externalProductId: string) {
    setOverrides((current) => ({ ...current, [rowNumber]: externalProductId }));
    setVariantOverrides((current) => ({ ...current, [rowNumber]: "" }));
    setDirty(true);
    setResult(null);
  }

  function resetFile(clearError = true) {
    setFileName("");
    setRawRows([]);
    setHeaders([]);
    setMapping({});
    setPreviewRows([]);
    setSummary(null);
    setOverrides({});
    setVariantOverrides({});
    setDirty(false);
    setResult(null);
    if (clearError) setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  if (!canSync) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        Conecte sua Nuvemshop em Integração para importar cores e SKUs.
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        Sincronize os produtos da Nuvemshop antes de enviar a planilha.
      </div>
    );
  }

  return (
    <fieldset disabled={loading || syncing} className="min-w-0 space-y-5">
      <section className="border-y border-gray-200 bg-white px-4 py-5 sm:rounded-lg sm:border sm:p-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-gray-900">1. Escolha a planilha</h2>
            <p className="mt-1 text-sm text-gray-500">
              Excel ou CSV · Cor e Novo SKU opcionais · Até 5.000 linhas
            </p>
          </div>
          {fileName && (
            <button
              type="button"
              onClick={() => resetFile()}
              className="text-sm font-medium text-gray-600 hover:text-gray-950 hover:underline"
            >
              Trocar arquivo
            </button>
          )}
        </div>

        <label className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-5 hover:border-gray-500 hover:bg-white">
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-gray-900">
              {fileName || "Selecionar arquivo"}
            </div>
            <div className="mt-1 text-xs text-gray-500">
              {rawRows.length > 0
                ? `${rawRows.length} linha${rawRows.length === 1 ? "" : "s"} encontrada${rawRows.length === 1 ? "" : "s"}`
                : "XLSX, XLS ou CSV, até 5.000 linhas"}
            </div>
          </div>
          <span className="shrink-0 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-semibold text-white">
            Procurar
          </span>
        </label>
      </section>

      {rawRows.length > 0 && (
        <section className="border-y border-gray-200 bg-white px-4 py-5 sm:rounded-lg sm:border sm:p-6">
          <h2 className="font-semibold text-gray-900">2. Confira as colunas</h2>
          <p className="mt-1 text-sm text-gray-500">
            O sistema tentou reconhecer os títulos. Ajuste somente se alguma coluna estiver errada.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {(Object.keys(FIELD_LABELS) as FieldKey[]).map((field) => (
              <label key={field} className="text-xs font-medium text-gray-600">
                {FIELD_LABELS[field]}
                <select
                  aria-label={FIELD_LABELS[field]}
                  value={mapping[field] ?? ""}
                  onChange={(event) => changeMapping(field, event.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-normal text-gray-900"
                >
                  <option value="">Não usar</option>
                  {headers.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          {!canAnalyze && (
            <p className="mt-3 text-xs text-amber-700">
              Selecione Cor ou Novo SKU e uma identificação do produto ou da variação.
            </p>
          )}
          <button
            type="button"
            onClick={() => void analyze()}
            disabled={!canAnalyze || loading}
            className="mt-5 rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Analisando produtos..." : previewRows.length ? "Atualizar prévia" : "Analisar planilha"}
          </button>
        </section>
      )}

      {summary && (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Stat label="Linhas" value={summary.total} />
            <Stat label="Prontas" value={summary.ready} tone="green" />
            <Stat label="Sem alterações" value={summary.unchanged} />
            <Stat label="Precisam de revisão" value={summary.review} tone="amber" />
            <Stat label="Bloqueadas" value={summary.blocked} tone="red" />
          </section>

          {dirty && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <span>Você trocou um produto. Atualize a prévia antes de sincronizar.</span>
              <button
                type="button"
                onClick={() => void analyze()}
                disabled={loading}
                className="rounded-lg bg-amber-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              >
                Atualizar prévia
              </button>
            </div>
          )}

          <section className="overflow-hidden border-y border-gray-200 bg-white sm:rounded-lg sm:border">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-4 sm:px-5">
              <div>
                <h2 className="font-semibold text-gray-900">3. Revise os produtos</h2>
                <p className="mt-1 text-xs text-gray-500">Nenhuma alteração é feita nesta etapa.</p>
              </div>
              <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
                {(["all", "ready", "attention"] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => {
                      setFilter(item);
                      setPage(1);
                    }}
                    className={clsx(
                      "rounded-md px-3 py-1.5 text-xs font-medium",
                      filter === item
                        ? "bg-white text-gray-950 shadow-sm"
                        : "text-gray-500 hover:text-gray-900"
                    )}
                  >
                    {item === "all" ? "Todas" : item === "ready" ? "Prontas" : "Com atenção"}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1260px] table-fixed text-left text-sm">
                <colgroup>
                  <col className="w-14" />
                  <col className="w-56" />
                  <col className="w-72" />
                  <col className="w-28" />
                  <col className="w-72" />
                  <col className="w-72" />
                </colgroup>
                <thead className="bg-gray-50 text-xs text-gray-500">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Linha</th>
                    <th className="px-4 py-2.5 font-medium">Na planilha</th>
                    <th className="px-4 py-2.5 font-medium">Produto encontrado</th>
                    <th className="px-4 py-2.5 font-medium">Cor</th>
                    <th className="px-4 py-2.5 font-medium">Variação / SKU</th>
                    <th className="px-4 py-2.5 font-medium">Situação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {visibleRows.map((row) => (
                    <tr key={row.rowNumber} className="align-top">
                      <td className="px-4 py-3 text-xs text-gray-500">{row.rowNumber}</td>
                      <td className="max-w-64 px-4 py-3">
                        <div className="truncate font-medium text-gray-800">
                          {row.productName || row.sku || row.externalProductId || "Sem identificação"}
                        </div>
                        {(row.sku || row.externalProductId) && (
                          <div className="mt-1 truncate text-xs text-gray-500">
                            {[row.sku && `SKU ${row.sku}`, row.externalProductId && `ID ${row.externalProductId}`]
                              .filter(Boolean)
                              .join(" / ")}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <ProductPicker
                          row={row}
                          products={products}
                          selectedId={overrides[row.rowNumber] ?? row.productExternalId ?? ""}
                          onSelect={(id) => chooseProduct(row.rowNumber, id)}
                        />
                      </td>
                      <td className="break-words px-4 py-3 font-semibold text-gray-900">{row.color || "-"}</td>
                      <td className="min-w-60 max-w-80 px-4 py-3">
                        {row.newSku ? (
                          <>
                            <select
                              aria-label={`Variação da linha ${row.rowNumber}`}
                              value={variantOverrides[row.rowNumber] ?? row.variantExternalId ?? ""}
                              disabled={Boolean(overrides[row.rowNumber] && overrides[row.rowNumber] !== row.productExternalId)}
                              onChange={(event) => {
                                setVariantOverrides((current) => ({ ...current, [row.rowNumber]: event.target.value }));
                                setDirty(true);
                                setResult(null);
                              }}
                              className="w-full max-w-72 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs"
                            >
                              <option value="">Escolha uma variação</option>
                              {row.variantOptions.map((option) => (
                                <option key={option.id} value={option.id}>
                                  {option.label} (ID {option.id})
                                </option>
                              ))}
                            </select>
                            <div className="mt-2 break-all text-xs text-gray-500">Atual: {row.currentSku || "Sem SKU"}</div>
                            <div className="mt-1 break-all text-xs font-semibold text-gray-900">Novo: {row.newSku}</div>
                          </>
                        ) : <span className="text-xs text-gray-500">Sem alteração de SKU</span>}
                      </td>
                      <td className="max-w-80 px-4 py-3">
                        <StatusBadge status={row.status} />
                        <div className="mt-1.5 text-xs leading-5 text-gray-600">{row.message}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filteredRows.length === 0 && (
              <div className="p-10 text-center text-sm text-gray-500">
                Nenhuma linha neste filtro.
              </div>
            )}

            {filteredRows.length > PAGE_SIZE && (
              <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3 text-sm text-gray-600 sm:px-5">
                <span>
                  {(page - 1) * PAGE_SIZE + 1} a {Math.min(page * PAGE_SIZE, filteredRows.length)} de {filteredRows.length}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    disabled={page === 1}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs disabled:opacity-40"
                  >
                    Anterior
                  </button>
                  <span className="text-xs">{page} / {totalPages}</span>
                  <button
                    type="button"
                    onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                    disabled={page === totalPages}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs disabled:opacity-40"
                  >
                    Próxima
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className="border-y border-gray-200 bg-white px-4 py-5 sm:rounded-lg sm:border sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="font-semibold text-gray-900">4. Sincronize com a Nuvemshop</h2>
                <p className="mt-1 text-sm text-gray-500">
                  {summary.ready} linha{summary.ready === 1 ? "" : "s"} pronta{summary.ready === 1 ? "" : "s"} para sincronizar.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void synchronize()}
                disabled={syncing || dirty || summary.ready === 0}
                className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {syncing
                  ? `Sincronizando ${syncProgress.done} de ${syncProgress.total}...`
                  : `Sincronizar ${summary.ready} linha${summary.ready === 1 ? "" : "s"}`}
              </button>
            </div>
          </section>
        </>
      )}

      {result && <SyncFeedback result={result} onReset={() => resetFile()} />}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
    </fieldset>
  );
}

function ProductPicker({
  row,
  products,
  selectedId,
  onSelect,
}: {
  row: PreviewRow;
  products: ColorProductOption[];
  selectedId: string;
  onSelect: (externalProductId: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [search, setSearch] = useState("");
  const selected = products.find((product) => product.externalProductId === selectedId);
  const matches = useMemo(() => {
    const query = normalizeText(search);
    if (!query) {
      const candidateIds = new Set(row.candidates.map((item) => item.externalProductId));
      return products.filter((product) => candidateIds.has(product.externalProductId)).slice(0, 20);
    }
    return products
      .filter(
        (product) =>
          normalizeText(product.name).includes(query) ||
          product.externalProductId.includes(search.trim())
      )
      .slice(0, 30);
  }, [products, row.candidates, search]);

  if (editing) {
    return (
      <div className="w-72 space-y-2">
        <input
          autoFocus
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar nome ou ID"
          className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs"
        />
        <select
          value=""
          onChange={(event) => {
            if (!event.target.value) return;
            onSelect(event.target.value);
            setEditing(false);
            setSearch("");
          }}
          className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs"
        >
          <option value="">Escolha um produto</option>
          {matches.map((product) => (
            <option key={product.externalProductId} value={product.externalProductId}>
              {product.name} (ID {product.externalProductId})
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setSearch("");
          }}
          className="text-xs text-gray-500 hover:underline"
        >
          Fechar
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-w-60 items-center gap-2">
      {(selected?.imageUrl || row.productImageUrl) && (
        <img
          src={selected?.imageUrl ?? row.productImageUrl ?? ""}
          alt=""
          className="h-9 w-9 shrink-0 rounded object-cover"
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-gray-800">
          {selected?.name ?? row.matchedProductName ?? "Não encontrado"}
        </div>
        {(selectedId || row.productExternalId) && (
          <div className="mt-0.5 text-xs text-gray-500">
            ID {selectedId || row.productExternalId}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="shrink-0 text-xs font-medium text-gray-600 hover:text-gray-950 hover:underline"
      >
        Trocar
      </button>
    </div>
  );
}

function StatusBadge({ status }: { status: PreviewStatus }) {
  const styles: Record<PreviewStatus, string> = {
    ready: "bg-green-50 text-green-700",
    unchanged: "bg-gray-100 text-gray-600",
    review: "bg-amber-50 text-amber-800",
    blocked: "bg-red-50 text-red-700",
    duplicate: "bg-gray-100 text-gray-500",
  };
  const labels: Record<PreviewStatus, string> = {
    ready: "Pronto",
    unchanged: "Ignorado",
    review: "Revisar produto",
    blocked: "Bloqueado",
    duplicate: "Repetido",
  };
  return (
    <span className={clsx("inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold", styles[status])}>
      {labels[status]}
    </span>
  );
}

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "green" | "amber" | "red";
}) {
  const styles = {
    neutral: "border-gray-200 bg-white text-gray-900",
    green: "border-green-200 bg-green-50 text-green-900",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    red: "border-red-200 bg-red-50 text-red-900",
  };
  return (
    <div className={clsx("rounded-lg border p-4", styles[tone])}>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}

function SyncFeedback({
  result,
  onReset,
}: {
  result: SyncResult;
  onReset: () => void;
}) {
  const failed = result.results.filter((item) => item.status === "error" || item.status === "skipped");
  return (
    <section
      className={clsx(
        "rounded-lg border p-5",
        failed.length ? "border-amber-200 bg-amber-50" : "border-green-200 bg-green-50"
      )}
    >
      <h2 className="font-semibold text-gray-950">
        {failed.length ? "Sincronização concluída com pendências" : "Sincronização concluída"}
      </h2>
      <p className="mt-1 text-sm text-gray-700">
        {result.summary.updated} linha{result.summary.updated === 1 ? "" : "s"} atualizada{result.summary.updated === 1 ? "" : "s"}
        {result.summary.errors > 0 ? ` e ${result.summary.errors} com erro.` : "."}
        {result.summary.skipped > 0 ? ` ${result.summary.skipped} não sincronizada(s).` : ""}
        {result.summary.unchanged > 0 ? ` ${result.summary.unchanged} sem alterações.` : ""}
      </p>
      {failed.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm text-red-700">
          {failed.slice(0, 10).map((item) => (
            <li key={`${item.rowNumber}-${item.productName}`}>
              Linha {item.rowNumber}, {item.productName ?? "produto"}: {item.message}
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={onReset}
        className="mt-4 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
      >
        Importar outra planilha
      </button>
    </section>
  );
}

function guessMapping(headers: string[]): Partial<Record<FieldKey, string>> {
  const normalized = headers.map((header) => ({ raw: header, value: normalizeText(header) }));
  const result: Partial<Record<FieldKey, string>> = {};
  for (const [field, aliases] of Object.entries(FIELD_ALIASES) as Array<[FieldKey, string[]]>) {
    const exact = normalized.find((header) =>
      aliases.some((alias) => header.value === normalizeText(alias))
    );
    if (exact) result[field] = exact.raw;
  }
  return result;
}

function cell(row: RawRow, header: string | undefined): string {
  if (!header) return "";
  const value = row[header];
  return value == null ? "" : String(value).trim();
}

function normalizeText(value: string): string {
  return value
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
