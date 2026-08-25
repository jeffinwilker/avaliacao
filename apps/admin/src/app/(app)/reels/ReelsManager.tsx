"use client";

import { useMemo, useRef, useState } from "react";

export interface ReelProductOption {
  id: string;
  externalProductId: string;
  name: string;
  imageUrl: string | null;
  url: string | null;
}

export interface ProductReelView {
  id: string;
  productId: string;
  productExternalId: string;
  productName: string;
  productImageUrl: string | null;
  productUrl: string | null;
  title: string;
  videoUrl: string;
  storageProvider: "supabase" | "r2";
  storagePath: string | null;
  thumbnailUrl: string | null;
  active: boolean;
  ordering: number;
  createdAt: string;
}

type Feedback = { type: "ok" | "error"; text: string } | null;

export function ReelsManager({
  storeId,
  products,
  initialReels,
  available,
  unavailableMessage,
}: {
  storeId: string;
  products: ReelProductOption[];
  initialReels: ProductReelView[];
  available: boolean;
  unavailableMessage: string | null;
}) {
  const [reels, setReels] = useState(initialReels);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [ordering, setOrdering] = useState(0);
  const [active, setActive] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [productSearch, setProductSearch] = useState("");
  const [listSearch, setListSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const productById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products]
  );

  const filteredProducts = useMemo(() => {
    const search = productSearch.trim().toLocaleLowerCase("pt-BR");
    if (!search) return products.slice(0, 80);
    return products
      .filter((product) =>
        product.name.toLocaleLowerCase("pt-BR").includes(search)
      )
      .slice(0, 80);
  }, [productSearch, products]);

  const filteredReels = useMemo(() => {
    const search = listSearch.trim().toLocaleLowerCase("pt-BR");
    const ordered = [...reels].sort((a, b) => {
      if (a.ordering !== b.ordering) return a.ordering - b.ordering;
      return a.productName.localeCompare(b.productName, "pt-BR");
    });
    if (!search) return ordered;
    return ordered.filter(
      (reel) =>
        reel.title.toLocaleLowerCase("pt-BR").includes(search) ||
        reel.productName.toLocaleLowerCase("pt-BR").includes(search)
    );
  }, [listSearch, reels]);

  const editing = editingId
    ? reels.find((reel) => reel.id === editingId) ?? null
    : null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setFeedback(null);

    const selectedProduct = productById.get(productId);
    if (!selectedProduct) {
      setFeedback({ type: "error", text: "Escolha um produto válido." });
      return;
    }
    if (!editing && !file) {
      setFeedback({ type: "error", text: "Envie um vídeo para criar o reel." });
      return;
    }

    setSaving(true);
    try {
      let videoUrl = editing?.videoUrl ?? "";
      let storageProvider = editing?.storageProvider ?? "supabase";
      let storagePath = editing?.storagePath ?? null;
      if (file) {
        const uploaded = await uploadVideo(file);
        videoUrl = uploaded.url;
        storageProvider = uploaded.provider;
        storagePath = uploaded.path;
      }

      const payload = {
        storeId,
        productId,
        title: title.trim(),
        videoUrl,
        storageProvider,
        storagePath,
        thumbnailUrl: editing?.thumbnailUrl ?? null,
        active,
        ordering,
      };

      const res = await fetch(editing ? `/api/reels/${editing.id}` : "/api/reels", {
        method: editing ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || "Não foi possível salvar o reel");
      }

      const saved = normalizeReel(json.reel, selectedProduct);
      setReels((current) =>
        editing
          ? current.map((reel) => (reel.id === saved.id ? saved : reel))
          : [saved, ...current]
      );
      resetForm();
      setFeedback({
        type: "ok",
        text: editing ? "Reel atualizado com sucesso." : "Reel criado com sucesso.",
      });
    } catch (error) {
      setFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Não foi possível salvar.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function uploadVideo(
    video: File
  ): Promise<{ url: string; path: string; provider: "supabase" | "r2" }> {
    const form = new FormData();
    form.append("storeId", storeId);
    form.append("file", video, video.name);
    const res = await fetch("/api/reels/upload-video", {
      method: "POST",
      body: form,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json.error || "Não foi possível enviar o vídeo");
    }
    return {
      url: json.url,
      path: json.path,
      provider: json.provider === "r2" ? "r2" : "supabase",
    };
  }

  async function removeReel(reel: ProductReelView) {
    if (!window.confirm(`Remover o reel "${reel.title}"?`)) return;
    setDeletingId(reel.id);
    setFeedback(null);
    const res = await fetch(`/api/reels/${reel.id}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ storeId }),
    });
    const json = await res.json().catch(() => ({}));
    setDeletingId(null);
    if (!res.ok) {
      setFeedback({
        type: "error",
        text: json.error || "Não foi possível remover o reel.",
      });
      return;
    }
    setReels((current) => current.filter((candidate) => candidate.id !== reel.id));
    if (editingId === reel.id) resetForm();
    setFeedback({ type: "ok", text: "Reel removido." });
  }

  function startEdit(reel: ProductReelView) {
    setEditingId(reel.id);
    setProductId(reel.productId);
    setTitle(reel.title);
    setOrdering(reel.ordering);
    setActive(reel.active);
    setFile(null);
    setFeedback(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetForm() {
    setEditingId(null);
    setProductId(products[0]?.id ?? "");
    setTitle("");
    setOrdering(0);
    setActive(true);
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  if (!available) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        {unavailableMessage}
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        Sincronize seus produtos em Integração antes de cadastrar reels.
      </div>
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(360px,420px)_1fr]">
      <form
        onSubmit={submit}
        className="self-start rounded-xl border border-gray-200 bg-white p-5"
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">{editing ? "Editar reel" : "Novo reel"}</h2>
            <p className="mt-1 text-xs text-gray-500">
              Use MP4 vertical 9:16 para melhor reprodução no celular.
            </p>
          </div>
          {editing && (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancelar
            </button>
          )}
        </div>

        <div className="space-y-4">
          <label className="block text-sm font-medium text-gray-700">
            Buscar produto
            <input
              type="search"
              value={productSearch}
              onChange={(event) => setProductSearch(event.target.value)}
              placeholder="Nome do produto"
              className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-normal outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
            />
          </label>

          <label className="block text-sm font-medium text-gray-700">
            Produto
            <select
              value={productId}
              onChange={(event) => setProductId(event.target.value)}
              className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
            >
              {!filteredProducts.some((product) => product.id === productId) &&
                productById.get(productId) && (
                  <option value={productId}>{productById.get(productId)?.name}</option>
                )}
              {filteredProducts.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-medium text-gray-700">
            Título
            <input
              type="text"
              maxLength={80}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Ex.: Detalhes, Como usar, Por dentro"
              className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-normal outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
            />
          </label>

          <div className="grid grid-cols-[1fr_auto] gap-3">
            <label className="block text-sm font-medium text-gray-700">
              Ordem
              <input
                type="number"
                min={0}
                value={ordering}
                onChange={(event) => setOrdering(Number(event.target.value))}
                className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-normal outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
              />
            </label>
            <label className="mt-7 inline-flex items-center gap-2 text-sm font-medium text-gray-700">
              <input
                type="checkbox"
                checked={active}
                onChange={(event) => setActive(event.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              Ativo
            </label>
          </div>

          <label className="block text-sm font-medium text-gray-700">
            Vídeo
            <input
              ref={fileInputRef}
              type="file"
              accept="video/mp4,video/webm,video/quicktime"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="mt-1.5 block w-full text-sm text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-900 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-zinc-800"
            />
            <span className="mt-1 block text-xs text-gray-500">
              {editing
                ? "Envie um novo arquivo somente se quiser trocar o vídeo."
                : "MP4, WebM ou MOV até 50 MB."}
            </span>
          </label>

          {file && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
              Selecionado: <strong>{file.name}</strong>
            </div>
          )}

          {editing && !file && (
            <video
              src={editing.videoUrl}
              className="aspect-[9/16] max-h-72 w-full rounded-lg bg-black object-contain"
              controls
              preload="metadata"
            />
          )}

          <button
            type="submit"
            disabled={saving || !productId || title.trim().length < 2}
            className="w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving
              ? file
                ? "Enviando vídeo..."
                : "Salvando..."
              : editing
                ? "Salvar alterações"
                : "Criar reel"}
          </button>
        </div>

        {feedback && (
          <div
            className={`mt-4 rounded-lg border px-3 py-2.5 text-sm ${
              feedback.type === "ok"
                ? "border-green-200 bg-green-50 text-green-800"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {feedback.text}
          </div>
        )}
      </form>

      <section className="rounded-xl border border-gray-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 p-5">
          <div>
            <h2 className="font-semibold">Vídeos cadastrados</h2>
            <p className="mt-1 text-xs text-gray-500">
              {reels.length} reel{reels.length !== 1 ? "s" : ""} no painel.
            </p>
          </div>
          <input
            type="search"
            value={listSearch}
            onChange={(event) => setListSearch(event.target.value)}
            placeholder="Buscar por produto ou título"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200 sm:w-72"
          />
        </div>

        {filteredReels.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-500">
            {reels.length === 0
              ? "Nenhum reel cadastrado ainda."
              : "Nenhum reel encontrado nessa busca."}
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {filteredReels.map((reel) => (
              <li key={reel.id} className="flex flex-wrap items-center gap-4 p-4">
                <video
                  src={reel.videoUrl}
                  className="h-24 w-[54px] rounded-lg bg-black object-cover"
                  muted
                  playsInline
                  preload="metadata"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-semibold text-gray-900">
                      {reel.title}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        reel.active
                          ? "bg-green-50 text-green-700"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {reel.active ? "Ativo" : "Inativo"}
                    </span>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
                      Ordem {reel.ordering}
                    </span>
                  </div>
                  <div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-gray-500">
                    {reel.productImageUrl ? (
                      <img
                        src={reel.productImageUrl}
                        alt=""
                        className="h-5 w-5 rounded object-cover"
                      />
                    ) : (
                      <span className="h-5 w-5 rounded bg-gray-100" />
                    )}
                    <span className="truncate">{reel.productName}</span>
                  </div>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => startEdit(reel)}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => removeReel(reel)}
                    disabled={deletingId === reel.id}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    {deletingId === reel.id ? "Removendo..." : "Remover"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function normalizeReel(value: unknown, product: ReelProductOption): ProductReelView {
  const reel = value as Record<string, unknown>;
  return {
    id: String(reel.id),
    productId: String(reel.product_id),
    productExternalId: product.externalProductId,
    productName: product.name,
    productImageUrl: product.imageUrl,
    productUrl: product.url,
    title: String(reel.title ?? ""),
    videoUrl: String(reel.video_url ?? ""),
    storageProvider: reel.storage_provider === "r2" ? "r2" : "supabase",
    storagePath: typeof reel.storage_path === "string" ? reel.storage_path : null,
    thumbnailUrl:
      typeof reel.thumbnail_url === "string" ? reel.thumbnail_url : null,
    active: reel.active === true,
    ordering: Number(reel.ordering ?? 0),
    createdAt:
      typeof reel.created_at === "string"
        ? reel.created_at
        : new Date().toISOString(),
  };
}
