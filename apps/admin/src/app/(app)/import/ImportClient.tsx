"use client";

import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import {
  buildCatalog,
  findMatchesFast,
  normalize,
  similarityPre,
  toBigrammed,
  type CatalogEntry,
  type MatchCandidate,
} from "@/lib/match";
import clsx from "clsx";

interface Product {
  id: string;
  name: string;
  external_product_id: string;
}

interface Row {
  raw: Record<string, unknown>;
  product_name: string;
  customer_name: string;
  customer_email: string;
  rating: number | null;
  title: string;
  comment: string;
  created_at: string;
  verified: boolean;
  product_id: string | null;
  match_score: number;
  candidates: MatchCandidate[]; // pré-calculado uma vez
}

type FieldKey =
  | "product_name"
  | "customer_name"
  | "customer_email"
  | "rating"
  | "title"
  | "comment"
  | "created_at"
  | "verified";

const FIELD_LABELS: Record<FieldKey, string> = {
  product_name: "Nome do produto",
  customer_name: "Nome do cliente",
  customer_email: "E-mail do cliente",
  rating: "Nota (1-5)",
  title: "Título",
  comment: "Comentário",
  created_at: "Data",
  verified: "Compra verificada",
};

const FIELD_ALIASES: Record<FieldKey, string[]> = {
  product_name: ["produto", "product", "item", "titulo", "title", "nome do produto", "sku"],
  customer_name: ["cliente", "customer", "nome", "name", "autor", "author", "user", "usuario"],
  customer_email: ["email", "e mail", "mail"],
  rating: ["nota", "rating", "estrelas", "stars", "score", "avaliacao"],
  title: ["titulo da avaliacao", "review title", "titulo review"],
  comment: ["comentario", "comment", "review", "opiniao", "feedback", "texto", "mensagem"],
  created_at: ["data", "date", "criado em", "created at", "datahora", "data da compra", "data avaliacao"],
  verified: ["verificada", "verified", "comprou", "buyer", "compra verificada"],
};

const AUTO_MATCH_CUTOFF = 0.8;
const PAGE_SIZE = 50;
const PROCESS_CHUNK = 200;

export function ImportClient({ products }: { products: Product[] }) {
  // Pré-computa bigramas dos produtos UMA vez — enorme ganho quando são muitos
  const catalog = useMemo(() => buildCatalog(products), [products]);

  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [mapping, setMapping] = useState<Record<FieldKey, string>>({} as Record<FieldKey, string>);
  const [status, setStatus] = useState<"approved" | "pending">("approved");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ inserted: number; skipped: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<"all" | "unmatched" | "matched">("all");
  const [processing, setProcessing] = useState<{ done: number; total: number } | null>(
    null
  );

  // ----------------------- upload + parse -----------------------

  async function handleFile(file: File) {
    setError(null);
    setResult(null);
    setPage(1);

    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(new Uint8Array(buf), { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: "",
        raw: false,
      });
      if (json.length === 0) {
        setError("Planilha vazia");
        return;
      }
      const hdrs = Object.keys(json[0]);
      const autoMap = guessMapping(hdrs);
      setHeaders(hdrs);
      setMapping(autoMap);

      // processa em chunks pra não travar o browser
      setProcessing({ done: 0, total: json.length });
      const acc: Row[] = [];
      for (let i = 0; i < json.length; i += PROCESS_CHUNK) {
        const slice = json.slice(i, i + PROCESS_CHUNK);
        for (const raw of slice) acc.push(buildRow(raw, autoMap, catalog));
        setProcessing({ done: Math.min(i + PROCESS_CHUNK, json.length), total: json.length });
        // cede o event loop pra o browser respirar
        await new Promise((r) => setTimeout(r, 0));
      }
      setRows(acc);
      setProcessing(null);
    } catch (err) {
      setProcessing(null);
      setError(`Falha ao ler arquivo: ${(err as Error).message}`);
    }
  }

  async function reapplyMapping(newMap: Record<FieldKey, string>) {
    setMapping(newMap);
    if (rows.length === 0) return;
    setProcessing({ done: 0, total: rows.length });
    const acc: Row[] = [];
    for (let i = 0; i < rows.length; i += PROCESS_CHUNK) {
      const slice = rows.slice(i, i + PROCESS_CHUNK);
      for (const r of slice) acc.push(buildRow(r.raw, newMap, catalog));
      setProcessing({ done: Math.min(i + PROCESS_CHUNK, rows.length), total: rows.length });
      await new Promise((r) => setTimeout(r, 0));
    }
    setRows(acc);
    setProcessing(null);
    setPage(1);
  }

  function setRowProduct(idx: number, productId: string) {
    setRows((prev) =>
      prev.map((r, i) =>
        i === idx ? { ...r, product_id: productId || null, match_score: productId ? 1 : 0 } : r
      )
    );
  }

  function bulkAcceptSuggestions() {
    // Aceita o top-1 pra todas as linhas amarelas (score entre 0.5 e 0.8)
    setRows((prev) =>
      prev.map((r) => {
        if (r.product_id) return r;
        const best = r.candidates[0];
        if (best && best.score >= 0.5) {
          return { ...r, product_id: best.id, match_score: best.score };
        }
        return r;
      })
    );
  }

  const stats = useMemo(
    () => ({
      total: rows.length,
      matched: rows.filter((r) => r.product_id).length,
      unmatched: rows.filter((r) => !r.product_id).length,
      valid: rows.filter((r) => r.product_id && r.rating && r.customer_name).length,
    }),
    [rows]
  );

  const filtered = useMemo(() => {
    if (filter === "unmatched") return rows.filter((r) => !r.product_id);
    if (filter === "matched") return rows.filter((r) => r.product_id);
    return rows;
  }, [rows, filter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function doImport() {
    setError(null);
    setImporting(true);
    const payload = rows
      .filter((r) => r.product_id && r.rating && r.customer_name)
      .map((r) => ({
        product_id: r.product_id!,
        customer_name: r.customer_name,
        customer_email: r.customer_email || null,
        rating: r.rating!,
        title: r.title || null,
        comment: r.comment || null,
        created_at: r.created_at || null,
        verified_purchase: r.verified,
      }));

    const res = await fetch("/api/import/reviews", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reviews: payload, status }),
    });

    setImporting(false);
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Falha ao importar");
      return;
    }
    setResult({ inserted: json.inserted, skipped: json.skipped });
  }

  // ------------------------- UI -------------------------

  if (products.length === 0) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
        <strong>Nenhum produto cadastrado.</strong>
        <p className="text-sm text-gray-700 mt-1">
          Sincronize seus produtos primeiro em <a href="/products" className="underline">Produtos</a>.
        </p>
      </div>
    );
  }

  if (processing) {
    const pct = Math.round((processing.done / processing.total) * 100);
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8">
        <div className="mb-3 text-sm text-gray-700">
          Processando <strong>{processing.done}</strong> de{" "}
          <strong>{processing.total}</strong> linhas ({pct}%)
        </div>
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-brand-900 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8">
        <label className="block border-2 border-dashed border-gray-300 rounded-xl p-12 text-center cursor-pointer hover:border-brand-900 hover:bg-gray-50 transition">
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          <div className="text-4xl mb-3">📄</div>
          <div className="font-medium mb-1">Arraste ou clique para escolher o arquivo</div>
          <div className="text-sm text-gray-500">CSV, XLS ou XLSX (planilhas grandes ok)</div>
        </label>
        {error && (
          <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg border border-red-200 mt-4">
            {error}
          </div>
        )}
      </div>
    );
  }

  if (result) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
        <div className="text-4xl mb-3">✓</div>
        <h2 className="text-xl font-bold text-green-900 mb-1">Importação concluída</h2>
        <p className="text-green-800">
          <strong>{result.inserted}</strong> avaliações importadas
          {result.skipped > 0 && (
            <span className="text-amber-700">
              {" "}
              ({result.skipped} ignoradas por dados incompletos)
            </span>
          )}
          .
        </p>
        <div className="flex gap-2 justify-center mt-5">
          <a
            href="/reviews"
            className="bg-brand-900 text-white px-4 py-2 rounded-lg font-medium hover:opacity-90"
          >
            Ver avaliações
          </a>
          <button
            onClick={() => {
              setRows([]);
              setHeaders([]);
              setMapping({} as Record<FieldKey, string>);
              setResult(null);
            }}
            className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg font-medium hover:bg-white"
          >
            Importar outro arquivo
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Mapeamento */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold mb-1">1. Mapeamento de colunas</h2>
        <p className="text-sm text-gray-600 mb-4">
          Detectamos automaticamente. Ajuste se algo ficou errado.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(Object.keys(FIELD_LABELS) as FieldKey[]).map((field) => (
            <div key={field}>
              <label className="text-xs font-medium text-gray-600 block mb-1">
                {FIELD_LABELS[field]}
              </label>
              <select
                value={mapping[field] ?? ""}
                onChange={(e) => reapplyMapping({ ...mapping, [field]: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">— ignorar —</option>
                {headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </section>

      {/* Stats */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Total" value={stats.total} />
        <Stat label="Reconhecidos" value={stats.matched} positive />
        <Stat label="Sem produto" value={stats.unmatched} warn={stats.unmatched > 0} />
        <Stat label="Prontos p/ importar" value={stats.valid} />
      </section>

      {stats.unmatched > 0 && (
        <button
          onClick={bulkAcceptSuggestions}
          className="text-sm text-brand-900 underline"
        >
          Aceitar sugestões automáticas nas linhas 🟡 (não afeta as 🔴)
        </button>
      )}

      {/* Tabela */}
      <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-semibold">2. Revise os matches</h2>
          <div className="flex gap-1">
            {(["all", "unmatched", "matched"] as const).map((f) => (
              <button
                key={f}
                onClick={() => {
                  setFilter(f);
                  setPage(1);
                }}
                className={clsx(
                  "px-3 py-1 rounded-lg text-xs font-medium",
                  filter === f
                    ? "bg-brand-900 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                )}
              >
                {f === "all" ? "Todas" : f === "unmatched" ? "Sem produto" : "Com produto"}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="text-left px-3 py-2 w-12">#</th>
                <th className="text-left px-3 py-2">Produto na planilha</th>
                <th className="text-left px-3 py-2">→ Produto no sistema</th>
                <th className="text-left px-3 py-2">Cliente</th>
                <th className="text-left px-3 py-2 w-20">Nota</th>
                <th className="text-left px-3 py-2 max-w-xs">Comentário</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pageRows.map((row) => {
                const absIdx = rows.indexOf(row);
                return (
                  <tr key={absIdx} className={!row.product_id ? "bg-red-50/50" : ""}>
                    <td className="px-3 py-2 text-gray-500">{absIdx + 1}</td>
                    <td className="px-3 py-2 text-gray-800">
                      <MatchDot score={row.match_score} />{" "}
                      {row.product_name || <em className="text-gray-400">vazio</em>}
                    </td>
                    <td className="px-3 py-2">
                      <ProductPicker
                        row={row}
                        products={products}
                        onChange={(pid) => setRowProduct(absIdx, pid)}
                      />
                    </td>
                    <td className="px-3 py-2">{row.customer_name}</td>
                    <td className="px-3 py-2">
                      {row.rating ? "⭐".repeat(row.rating) : "—"}
                    </td>
                    <td className="px-3 py-2 max-w-xs truncate text-gray-700">
                      {row.comment || row.title || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        <div className="px-5 py-3 border-t border-gray-200 flex items-center justify-between text-sm">
          <div className="text-gray-600">
            Mostrando {(page - 1) * PAGE_SIZE + 1}–
            {Math.min(page * PAGE_SIZE, filtered.length)} de {filtered.length}
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1 border border-gray-300 rounded disabled:opacity-40"
            >
              ‹
            </button>
            <span className="px-3 py-1">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1 border border-gray-300 rounded disabled:opacity-40"
            >
              ›
            </button>
          </div>
        </div>
      </section>

      {/* Ação final */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold mb-3">3. Importar</h2>
        <div className="flex items-center gap-6 mb-4">
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="radio"
              checked={status === "approved"}
              onChange={() => setStatus("approved")}
            />
            Publicar já (aprovadas)
          </label>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="radio"
              checked={status === "pending"}
              onChange={() => setStatus("pending")}
            />
            Importar como pendentes
          </label>
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg border border-red-200 mb-3">
            {error}
          </div>
        )}

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={doImport}
            disabled={importing || stats.valid === 0}
            className="bg-brand-900 text-white px-5 py-2.5 rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
          >
            {importing ? "Importando..." : `Importar ${stats.valid} avaliações`}
          </button>
          <button
            onClick={() => {
              setRows([]);
              setHeaders([]);
              setMapping({} as Record<FieldKey, string>);
            }}
            className="text-sm text-gray-600 hover:underline"
          >
            Cancelar e escolher outro arquivo
          </button>
        </div>
      </section>
    </div>
  );
}

// ==================== ProductPicker ====================
// Dropdown com os top candidatos + botão pra buscar entre todos.
// Evita renderizar 500+ options por linha.

function ProductPicker({
  row,
  products,
  onChange,
}: {
  row: Row;
  products: Product[];
  onChange: (id: string) => void;
}) {
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");

  const searchResults = useMemo(() => {
    if (!query.trim()) return products.slice(0, 20);
    const q = normalize(query);
    return products
      .map((p) => ({ p, score: similarity(q, p.name) }))
      .filter((r) => r.score > 0.2 || normalize(r.p.name).includes(q))
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
      .map((r) => r.p);
  }, [query, products]);

  if (searching) {
    return (
      <div className="flex gap-1">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar produto..."
          className="border border-gray-300 rounded px-2 py-1 text-sm max-w-[220px]"
        />
        <select
          onChange={(e) => {
            if (e.target.value) {
              onChange(e.target.value);
              setSearching(false);
              setQuery("");
            }
          }}
          className="border border-gray-300 rounded px-2 py-1 text-sm max-w-[220px]"
        >
          <option value="">— escolher —</option>
          {searchResults.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button
          onClick={() => {
            setSearching(false);
            setQuery("");
          }}
          className="text-xs text-gray-500 hover:underline"
        >
          fechar
        </button>
      </div>
    );
  }

  return (
    <div className="flex gap-1 items-center">
      <select
        value={row.product_id ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className={clsx(
          "border rounded px-2 py-1 text-sm max-w-xs",
          row.product_id ? "border-gray-300" : "border-red-300 bg-red-50"
        )}
      >
        <option value="">— escolher —</option>
        {row.candidates.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} ({Math.round(c.score * 100)}%)
          </option>
        ))}
        {row.product_id &&
          !row.candidates.some((c) => c.id === row.product_id) && (
            <option value={row.product_id}>
              {products.find((p) => p.id === row.product_id)?.name}
            </option>
          )}
      </select>
      <button
        onClick={() => setSearching(true)}
        className="text-xs text-gray-500 hover:text-brand-900"
        title="Buscar outro produto"
      >
        🔍
      </button>
    </div>
  );
}

// ==================== helpers ====================

function guessMapping(headers: string[]): Record<FieldKey, string> {
  const normalized = headers.map((h) => ({ raw: h, norm: normalize(h) }));
  const out = {} as Record<FieldKey, string>;
  for (const [field, aliases] of Object.entries(FIELD_ALIASES) as [
    FieldKey,
    string[]
  ][]) {
    let best: { raw: string; score: number } | null = null;
    for (const h of normalized) {
      const score = Math.max(
        ...aliases.map((a) =>
          h.norm === a ? 1 : h.norm.includes(a) || a.includes(h.norm) ? 0.7 : 0
        )
      );
      if (score > 0.5 && (!best || score > best.score)) {
        best = { raw: h.raw, score };
      }
    }
    if (best) out[field] = best.raw;
  }
  return out;
}

function buildRow(
  raw: Record<string, unknown>,
  map: Record<FieldKey, string>,
  catalog: CatalogEntry[]
): Row {
  const getStr = (key: FieldKey) => {
    const col = map[key];
    if (!col) return "";
    const v = raw[col];
    return v == null ? "" : String(v).trim();
  };
  const ratingRaw = getStr("rating");
  let rating: number | null = null;
  if (ratingRaw) {
    const n = parseFloat(ratingRaw.replace(",", "."));
    if (Number.isFinite(n)) rating = Math.min(5, Math.max(1, Math.round(n)));
  }
  let createdAt = "";
  const dateRaw = getStr("created_at");
  if (dateRaw) {
    const d = new Date(dateRaw);
    if (!isNaN(d.getTime())) createdAt = d.toISOString();
  }
  const verifiedRaw = getStr("verified").toLowerCase();
  const verified = ["sim", "yes", "true", "1", "verificada", "verified"].includes(verifiedRaw);

  const product_name = getStr("product_name");
  const candidates = product_name
    ? findMatchesFast(product_name, catalog, { top: 5, cutoff: 0.2 })
    : [];
  const best = candidates[0];
  const auto = best && best.score >= AUTO_MATCH_CUTOFF ? best : null;

  return {
    raw,
    product_name,
    customer_name: getStr("customer_name"),
    customer_email: getStr("customer_email"),
    rating,
    title: getStr("title"),
    comment: getStr("comment"),
    created_at: createdAt,
    verified,
    product_id: auto?.id ?? null,
    match_score: auto?.score ?? best?.score ?? 0,
    candidates,
  };
}

// ==================== micro components ====================

function Stat({
  label,
  value,
  positive,
  warn,
}: {
  label: string;
  value: number;
  positive?: boolean;
  warn?: boolean;
}) {
  return (
    <div
      className={clsx(
        "rounded-xl border p-4",
        positive
          ? "border-green-200 bg-green-50"
          : warn
          ? "border-amber-200 bg-amber-50"
          : "border-gray-200 bg-white"
      )}
    >
      <div className="text-xs text-gray-600 mb-1">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}

function MatchDot({ score }: { score: number }) {
  if (score >= AUTO_MATCH_CUTOFF)
    return <span title={`Match ${Math.round(score * 100)}%`}>🟢</span>;
  if (score >= 0.5)
    return <span title={`Match parcial ${Math.round(score * 100)}%`}>🟡</span>;
  return <span title="Sem match automático">🔴</span>;
}
