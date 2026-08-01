"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  computeKitPrices,
  discountPercent,
  type KitDiscountType,
  type CreateKitPayload,
} from "@avaliacoes/shared";
import clsx from "clsx";

const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

interface CatalogProduct {
  id: string;
  name: string;
  external_product_id: string;
  image_url?: string | null;
  price?: number | null;
  stock?: number | null;
}

interface SelectedItem {
  productId: string;
  quantity: number;
  // dados denormalizados pra render
  name: string;
  imageUrl: string | null;
  price: number;
}

interface Props {
  mode: "new" | "edit";
  kitId?: string;
  initial?: {
    name: string;
    description: string;
    imageUrl: string;
    discountType: KitDiscountType;
    discountValue: number;
    active: boolean;
    items: SelectedItem[];
  };
}

export function KitForm({ mode, kitId, initial }: Props) {
  const router = useRouter();

  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? "");
  const [discountType, setDiscountType] = useState<KitDiscountType>(
    initial?.discountType ?? "percent"
  );
  const [discountValue, setDiscountValue] = useState<number>(
    initial?.discountValue ?? 10
  );
  const [active, setActive] = useState(initial?.active ?? true);
  const [items, setItems] = useState<SelectedItem[]>(initial?.items ?? []);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Catálogo de produtos (para o multi-select)
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  useEffect(() => {
    fetch("/api/products/list")
      .then((r) => r.json())
      .then((j) => setCatalog(j.products ?? []))
      .catch(() => {});
  }, []);

  // Cálculo de preços em tempo real
  const priced = useMemo(
    () =>
      items.map((i) => ({
        price: i.price,
        quantity: i.quantity,
      })),
    [items]
  );
  const { original, final } = computeKitPrices(priced, discountType, discountValue);
  const pct = discountPercent(original, final);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Informe o nome do kit");
      return;
    }
    if (items.length === 0) {
      setError("Adicione pelo menos 1 produto");
      return;
    }

    setSaving(true);
    const payload: CreateKitPayload = {
      name: name.trim(),
      description: description.trim() || undefined,
      imageUrl: imageUrl.trim() || undefined,
      discountType,
      discountValue: Number(discountValue) || 0,
      active,
      items: items.map((i, idx) => ({
        productId: i.productId,
        quantity: i.quantity,
        ordering: idx,
      })),
    };

    const url = mode === "new" ? "/api/kits" : `/api/kits/${kitId}`;
    const method = mode === "new" ? "POST" : "PUT";

    const res = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "Falha ao salvar");
      return;
    }
    router.push("/kits");
    router.refresh();
  }

  async function del() {
    if (!confirm("Excluir este kit? Ação não pode ser desfeita.")) return;
    const res = await fetch(`/api/kits/${kitId}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/kits");
      router.refresh();
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 text-sm">
          {error}
        </div>
      )}

      <Section title="Informações">
        <Field label="Nome do kit *">
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            required
          />
        </Field>
        <Field label="Descrição">
          <textarea
            className="input min-h-[80px]"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={2000}
            placeholder="Aparece na página do kit na loja."
          />
        </Field>
        <Field label="URL da imagem do kit" hint="Opcional. Ex: uma foto promocional.">
          <input
            className="input"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://..."
          />
        </Field>
      </Section>

      <Section title="Produtos incluídos">
        <ProductPicker
          catalog={catalog}
          selected={items}
          onChange={setItems}
        />
      </Section>

      <Section title="Desconto">
        <Field label="Tipo de desconto">
          <div className="flex gap-4 flex-wrap">
            <RadioOpt
              label="Percentual"
              hint="Ex: 10% sobre a soma"
              checked={discountType === "percent"}
              onChange={() => setDiscountType("percent")}
            />
            <RadioOpt
              label="Valor fixo"
              hint="Ex: R$ 15 de desconto"
              checked={discountType === "fixed"}
              onChange={() => setDiscountType("fixed")}
            />
            <RadioOpt
              label="Preço total"
              hint="Você define o preço final"
              checked={discountType === "total"}
              onChange={() => setDiscountType("total")}
            />
          </div>
        </Field>
        <Field
          label={
            discountType === "percent"
              ? "Percentual (0-100)"
              : discountType === "fixed"
              ? "Valor em R$"
              : "Preço total do kit em R$"
          }
        >
          <input
            className="input w-40"
            type="number"
            min={0}
            step={discountType === "percent" ? 1 : 0.01}
            value={discountValue}
            onChange={(e) => setDiscountValue(Number(e.target.value) || 0)}
          />
        </Field>
      </Section>

      <Section title="Preview de preço">
        <PricePreview original={original} final={final} pct={pct} />
      </Section>

      <Section title="Publicação">
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          Kit ativo (aparece na loja)
        </label>
      </Section>

      <div className="sticky bottom-0 bg-gray-50 py-4 -mx-8 px-8 border-t border-gray-200 flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="bg-brand-900 text-white px-5 py-2.5 rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Salvando..." : mode === "new" ? "Criar kit" : "Salvar alterações"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/kits")}
          className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-white"
        >
          Cancelar
        </button>
        {mode === "edit" && (
          <button
            type="button"
            onClick={del}
            className="ml-auto text-red-700 text-sm hover:underline"
          >
            Excluir kit
          </button>
        )}
      </div>

      <style jsx global>{`
        .input {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          font-size: 14px;
        }
        .input:focus {
          outline: none;
          border-color: #111827;
        }
      `}</style>
    </form>
  );
}

// ==================== ProductPicker ====================

function ProductPicker({
  catalog,
  selected,
  onChange,
}: {
  catalog: CatalogProduct[];
  selected: SelectedItem[];
  onChange: (items: SelectedItem[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedIds = new Set(selected.map((s) => s.productId));

  const suggestions = useMemo(() => {
    if (!query.trim()) return catalog.slice(0, 8);
    const q = query.toLowerCase();
    return catalog
      .filter((p) => !selectedIds.has(p.id) && p.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [catalog, query, selectedIds]);

  function add(p: CatalogProduct) {
    onChange([
      ...selected,
      {
        productId: p.id,
        quantity: 1,
        name: p.name,
        imageUrl: p.image_url ?? null,
        price: Number(p.price ?? 0),
      },
    ]);
    setQuery("");
    inputRef.current?.focus();
  }

  function remove(idx: number) {
    onChange(selected.filter((_, i) => i !== idx));
  }

  function setQty(idx: number, qty: number) {
    onChange(
      selected.map((s, i) => (i === idx ? { ...s, quantity: Math.max(1, qty) } : s))
    );
  }

  const anyMissingPrice = selected.some((s) => !s.price);

  return (
    <div>
      <div className="relative">
        <input
          ref={inputRef}
          className="input"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          placeholder="Buscar produto pra adicionar ao kit..."
        />
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-64 overflow-y-auto">
            {suggestions.map((p) => (
              <button
                key={p.id}
                type="button"
                onMouseDown={() => add(p)}
                className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm flex items-center gap-2 border-b border-gray-100 last:border-b-0"
              >
                {p.image_url ? (
                  <img
                    src={p.image_url}
                    alt=""
                    className="w-8 h-8 rounded object-cover"
                  />
                ) : (
                  <div className="w-8 h-8 rounded bg-gray-100" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="truncate">{p.name}</div>
                  {p.price != null && (
                    <div className="text-xs text-gray-500">
                      {BRL.format(Number(p.price))}
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {anyMissingPrice && (
        <div className="text-xs text-amber-700 mt-2">
          Alguns produtos estão sem preço no sistema. Sincronize os produtos em{" "}
          <a href="/integration" className="underline">Integração</a>.
        </div>
      )}

      <div className="mt-4 space-y-2">
        {selected.length === 0 ? (
          <div className="text-sm text-gray-500 border border-dashed border-gray-300 rounded-lg px-4 py-6 text-center">
            Nenhum produto adicionado.
          </div>
        ) : (
          selected.map((item, idx) => (
            <div
              key={item.productId}
              className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg px-3 py-2"
            >
              {item.imageUrl ? (
                <img
                  src={item.imageUrl}
                  alt=""
                  className="w-10 h-10 rounded object-cover"
                />
              ) : (
                <div className="w-10 h-10 rounded bg-gray-100" />
              )}
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{item.name}</div>
                <div className="text-xs text-gray-500">
                  {item.price ? BRL.format(item.price) : "sem preço"}
                </div>
              </div>
              <label className="text-xs text-gray-600">Qtd</label>
              <input
                type="number"
                min={1}
                value={item.quantity}
                onChange={(e) => setQty(idx, Number(e.target.value) || 1)}
                className="w-16 border border-gray-300 rounded px-2 py-1 text-sm"
              />
              <button
                type="button"
                onClick={() => remove(idx)}
                className="text-red-600 hover:text-red-700 text-sm"
              >
                Remover
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ==================== PricePreview ====================

function PricePreview({
  original,
  final,
  pct,
}: {
  original: number;
  final: number;
  pct: number;
}) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 grid grid-cols-3 gap-4">
      <div>
        <div className="text-xs text-gray-500 mb-1">Soma dos itens</div>
        <div className="text-lg font-semibold">
          {original > 0 ? BRL.format(original) : "—"}
        </div>
      </div>
      <div>
        <div className="text-xs text-gray-500 mb-1">Preço final do kit</div>
        <div className="text-lg font-bold text-green-700">
          {final > 0 ? BRL.format(final) : "—"}
        </div>
      </div>
      <div>
        <div className="text-xs text-gray-500 mb-1">Desconto</div>
        <div
          className={clsx(
            "text-lg font-semibold",
            pct > 0 ? "text-green-700" : "text-gray-500"
          )}
        >
          {pct > 0 ? `−${pct}%` : "—"}
        </div>
      </div>
    </div>
  );
}

// ==================== micro components ====================

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="font-semibold mb-4">{title}</h2>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
    </div>
  );
}

function RadioOpt({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label
      className={clsx(
        "flex-1 min-w-[140px] border rounded-lg p-3 cursor-pointer",
        checked
          ? "border-brand-900 bg-gray-50"
          : "border-gray-200 hover:bg-gray-50"
      )}
    >
      <div className="flex items-center gap-2">
        <input
          type="radio"
          checked={checked}
          onChange={onChange}
          className="accent-black"
        />
        <span className="font-medium text-sm">{label}</span>
      </div>
      <div className="text-xs text-gray-500 mt-1 ml-6">{hint}</div>
    </label>
  );
}
