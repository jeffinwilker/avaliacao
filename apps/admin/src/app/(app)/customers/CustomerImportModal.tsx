"use client";

import { useMemo, useState } from "react";
import * as XLSX from "xlsx";

type FieldKey =
  | "name"
  | "email"
  | "phone"
  | "identification"
  | "birthDate"
  | "acceptsMarketing"
  | "active"
  | "note";

type RawRow = Record<string, unknown>;

interface MappedCustomer {
  rowNumber: number;
  name: string;
  email: string;
  phone: string;
  identification: string;
  birthDate: string;
  acceptsMarketing: boolean;
  active: boolean;
  note: string;
  error: string | null;
}

const FIELD_LABELS: Record<FieldKey, string> = {
  name: "Nome do cliente *",
  email: "E-mail",
  phone: "Telefone/WhatsApp",
  identification: "CPF/CNPJ",
  birthDate: "Data de nascimento",
  acceptsMarketing: "Aceita marketing",
  active: "Cliente ativo",
  note: "Observação",
};

const FIELD_ALIASES: Record<FieldKey, string[]> = {
  name: ["nome", "nome completo", "cliente", "customer", "name"],
  email: ["email", "e mail", "correio", "mail"],
  phone: ["telefone", "celular", "whatsapp", "phone", "fone"],
  identification: ["cpf", "cnpj", "cpf cnpj", "documento", "identificacao"],
  birthDate: ["data de nascimento", "nascimento", "aniversario", "birth date", "birthday"],
  acceptsMarketing: ["aceita marketing", "marketing", "aceita mensagens", "opt in"],
  active: ["ativo", "cliente ativo", "active", "status"],
  note: ["observacao", "observacoes", "nota interna", "note", "comentario"],
};

export function CustomerImportModal({
  storeId,
  onClose,
  onImported,
}: {
  storeId: string;
  onClose: () => void;
  onImported: (inserted: number, updated: number) => void;
}) {
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<RawRow[]>([]);
  const [mapping, setMapping] = useState<Partial<Record<FieldKey, string>>>({});
  const [reading, setReading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mappedRows = useMemo(
    () => rows.map((row, index) => mapCustomer(row, mapping, index + 2)),
    [rows, mapping]
  );
  const validRows = useMemo(
    () => mappedRows.filter((row) => !row.error),
    [mappedRows]
  );

  async function readFile(file: File) {
    setReading(true);
    setError(null);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(new Uint8Array(buffer), { type: "array" });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!firstSheet) throw new Error("O arquivo não possui uma planilha");
      const parsed = XLSX.utils.sheet_to_json<RawRow>(firstSheet, {
        defval: "",
        raw: false,
      });
      if (!parsed.length) throw new Error("A planilha está vazia");
      if (parsed.length > 10_000) {
        throw new Error("Importe no máximo 10.000 clientes por arquivo");
      }
      const foundHeaders = Array.from(
        new Set(parsed.flatMap((row) => Object.keys(row)))
      );
      if (!foundHeaders.length) throw new Error("Não encontramos o cabeçalho da planilha");
      setFileName(file.name);
      setHeaders(foundHeaders);
      setRows(parsed);
      setMapping(guessMapping(foundHeaders));
    } catch (readError) {
      setFileName("");
      setHeaders([]);
      setRows([]);
      setMapping({});
      setError((readError as Error).message || "Não foi possível ler o arquivo");
    } finally {
      setReading(false);
    }
  }

  async function importCustomers() {
    if (importing || !validRows.length) return;
    setImporting(true);
    setError(null);
    const response = await fetch("/api/customers/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        storeId,
        customers: validRows.map((row) => importPayload(row, mapping)),
      }),
    });
    const result = await response.json().catch(() => ({}));
    setImporting(false);
    if (!response.ok) {
      setError(result.error || "Não foi possível importar os clientes");
      return;
    }
    onImported(Number(result.inserted) || 0, Number(result.updated) || 0);
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Importar clientes"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !importing) onClose();
      }}
    >
      <div className="max-h-[calc(100vh-32px)] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-200 px-6 py-5">
          <div>
            <h2 className="text-lg font-semibold text-gray-950">Importar clientes em massa</h2>
            <p className="mt-1 text-sm text-gray-500">
              Use Excel ou CSV e confirme manualmente a coluna correspondente a cada dado.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/api/customers/import/template"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Baixar modelo ideal
            </a>
            <button type="button" onClick={onClose} disabled={importing} className="grid h-9 w-9 place-items-center rounded-lg text-xl text-gray-500 hover:bg-gray-100 disabled:opacity-50" aria-label="Fechar">×</button>
          </div>
        </div>

        <div className="space-y-5 p-6">
          {!rows.length ? (
            <label className="block cursor-pointer rounded-2xl border-2 border-dashed border-gray-300 p-12 text-center transition hover:border-zinc-600 hover:bg-gray-50">
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                disabled={reading}
                onChange={(event) => event.target.files?.[0] && readFile(event.target.files[0])}
              />
              <div className="text-3xl">📄</div>
              <div className="mt-3 font-semibold text-gray-900">
                {reading ? "Lendo arquivo..." : "Clique para escolher o arquivo"}
              </div>
              <div className="mt-1 text-sm text-gray-500">CSV, XLS ou XLSX · até 10.000 clientes</div>
            </label>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                <span><strong>{fileName}</strong> · {rows.length} linha(s) encontrada(s)</span>
                <button type="button" onClick={() => { setRows([]); setHeaders([]); setMapping({}); setFileName(""); setError(null); }} className="font-semibold underline">Escolher outro arquivo</button>
              </div>

              <section className="rounded-xl border border-gray-200 p-5">
                <h3 className="font-semibold text-gray-950">1. Relacione as colunas</h3>
                <p className="mt-1 text-sm text-gray-500">A seleção automática é apenas uma sugestão. Ajuste qualquer campo que estiver diferente.</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {(Object.keys(FIELD_LABELS) as FieldKey[]).map((field) => (
                    <label key={field} className="text-xs font-semibold text-gray-600">
                      {FIELD_LABELS[field]}
                      <select
                        value={mapping[field] ?? ""}
                        onChange={(event) => setMapping((current) => ({ ...current, [field]: event.target.value }))}
                        className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-normal text-gray-900"
                      >
                        <option value="">Não importar</option>
                        {headers.map((header) => <option key={header} value={header}>{header}</option>)}
                      </select>
                    </label>
                  ))}
                </div>
                <p className="mt-3 text-xs text-gray-500">O nome é obrigatório. Cada cliente também precisa ter pelo menos e-mail ou telefone.</p>
              </section>

              <section className="overflow-hidden rounded-xl border border-gray-200">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-5 py-3">
                  <div><h3 className="font-semibold text-gray-950">2. Confira a prévia</h3><p className="mt-0.5 text-xs text-gray-500">Mostrando as primeiras 10 linhas.</p></div>
                  <div className="flex gap-2 text-xs font-semibold"><span className="rounded-full bg-green-100 px-2.5 py-1 text-green-800">{validRows.length} prontas</span><span className="rounded-full bg-red-100 px-2.5 py-1 text-red-700">{mappedRows.length - validRows.length} com erro</span></div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr><th className="px-3 py-2 text-left">Linha</th><th className="px-3 py-2 text-left">Nome</th><th className="px-3 py-2 text-left">E-mail</th><th className="px-3 py-2 text-left">Telefone</th><th className="px-3 py-2 text-left">Nascimento</th><th className="px-3 py-2 text-left">Situação</th></tr></thead>
                    <tbody className="divide-y divide-gray-100">
                      {mappedRows.slice(0, 10).map((row) => (
                        <tr key={row.rowNumber} className={row.error ? "bg-red-50/60" : ""}>
                          <td className="px-3 py-2 text-gray-500">{row.rowNumber}</td><td className="px-3 py-2 font-medium">{row.name || "—"}</td><td className="px-3 py-2">{row.email || "—"}</td><td className="px-3 py-2">{row.phone || "—"}</td><td className="px-3 py-2">{row.birthDate || "—"}</td><td className={`px-3 py-2 text-xs font-medium ${row.error ? "text-red-700" : "text-green-700"}`}>{row.error || "Pronta"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}

          {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-gray-200 px-6 py-4">
          <button type="button" onClick={onClose} disabled={importing} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">Cancelar</button>
          <button type="button" onClick={importCustomers} disabled={importing || validRows.length === 0 || !mapping.name || (!mapping.email && !mapping.phone)} className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50">
            {importing ? "Importando..." : `Importar ${validRows.length} cliente(s)`}
          </button>
        </div>
      </div>
    </div>
  );
}

function guessMapping(headers: string[]): Partial<Record<FieldKey, string>> {
  const result: Partial<Record<FieldKey, string>> = {};
  for (const field of Object.keys(FIELD_ALIASES) as FieldKey[]) {
    const match = headers.find((header) => {
      const normalized = normalizeHeader(header);
      return FIELD_ALIASES[field].some((alias) => normalized === normalizeHeader(alias));
    });
    if (match) result[field] = match;
  }
  return result;
}

function importPayload(
  row: MappedCustomer,
  mapping: Partial<Record<FieldKey, string>>
): Record<string, string | boolean> {
  const payload: Record<string, string | boolean> = { name: row.name };
  for (const field of Object.keys(FIELD_LABELS) as FieldKey[]) {
    if (field !== "name" && mapping[field]) payload[field] = row[field];
  }
  return payload;
}

function mapCustomer(row: RawRow, mapping: Partial<Record<FieldKey, string>>, rowNumber: number): MappedCustomer {
  const value = (field: FieldKey) => mapping[field] ? cellText(row[mapping[field]!]) : "";
  const name = value("name");
  const email = value("email").toLowerCase();
  const phone = value("phone");
  const rawBirthDate = value("birthDate");
  const birthDate = normalizeDate(rawBirthDate);
  let error: string | null = null;
  if (name.length < 2) error = "Nome ausente";
  else if (!email && !phone) error = "Sem e-mail ou telefone";
  else if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) error = "E-mail inválido";
  else if (rawBirthDate && !birthDate) error = "Data inválida";
  return {
    rowNumber, name, email, phone,
    identification: value("identification"), birthDate,
    acceptsMarketing: parseBoolean(value("acceptsMarketing"), true),
    active: parseBoolean(value("active"), true), note: value("note"), error,
  };
}

function normalizeHeader(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function cellText(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function parseBoolean(value: string, fallback: boolean): boolean {
  if (!value) return fallback;
  const normalized = normalizeHeader(value);
  if (["sim", "s", "yes", "true", "1", "ativo", "aceita"].includes(normalized)) return true;
  if (["nao", "n", "no", "false", "0", "inativo", "recusa"].includes(normalized)) return false;
  return fallback;
}

function normalizeDate(value: string): string {
  if (!value) return "";
  const iso = value.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const br = value.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (br) {
    const year = Number(br[3]) < 100 ? 1900 + Number(br[3]) : Number(br[3]);
    return validDate(year, Number(br[2]), Number(br[1]));
  }
  if (/^\d+(?:\.\d+)?$/.test(value)) {
    const parsed = XLSX.SSF.parse_date_code(Number(value));
    if (parsed) return validDate(parsed.y, parsed.m, parsed.d);
  }
  return "";
}

function validDate(year: number, month: number, day: number): string {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day || year < 1900 || date > new Date()) return "";
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}
