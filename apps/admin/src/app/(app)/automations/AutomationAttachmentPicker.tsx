"use client";

import { useRef, useState } from "react";
import type {
  AutomationAttachmentType,
  AutomationMediaAsset,
} from "@avaliacoes/shared";

interface AutomationAttachmentPickerProps {
  storeId: string;
  attachmentType: AutomationAttachmentType;
  attachmentUrl: string | null;
  assets: AutomationMediaAsset[];
  onChange: (
    attachmentType: AutomationAttachmentType,
    attachmentUrl: string | null
  ) => void;
  onAssetUploaded: (asset: AutomationMediaAsset) => void;
}

export function AutomationAttachmentPicker({
  storeId,
  attachmentType,
  attachmentUrl,
  assets,
  onChange,
  onAssetUploaded,
}: AutomationAttachmentPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    const form = new FormData();
    form.append("storeId", storeId);
    form.append("file", file);
    const response = await fetch("/api/automations/upload-media", {
      method: "POST",
      body: form,
    });
    const result = await response.json().catch(() => ({}));
    setUploading(false);
    if (!response.ok || !result.asset) {
      setError(result.error || "Não foi possível enviar a imagem");
      return;
    }
    const asset = result.asset as AutomationMediaAsset;
    onAssetUploaded(asset);
    onChange("library", asset.url);
  }

  return (
    <div className="mt-4 border-t border-gray-200 pt-4">
      <div className="mb-3 text-sm font-semibold text-gray-800">
        Anexo da mensagem
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <AttachmentOption
          label="Sem anexo"
          selected={attachmentType === "none"}
          onSelect={() => onChange("none", null)}
        />
        <AttachmentOption
          label="Imagem do produto"
          selected={attachmentType === "product_image"}
          onSelect={() => onChange("product_image", null)}
        />
        <AttachmentOption
          label="Biblioteca de anexos"
          selected={attachmentType === "library"}
          onSelect={() => onChange("library", attachmentUrl || assets[0]?.url || null)}
        />
      </div>

      {attachmentType === "product_image" && (
        <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          Será usada automaticamente a primeira imagem do produto daquele carrinho ou pedido.
        </div>
      )}

      {attachmentType === "library" && (
        <div className="mt-3 rounded-xl border border-gray-200 bg-white p-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-medium">Escolha uma imagem</div>
              <div className="text-xs text-gray-500">JPG, PNG, WEBP ou GIF, até 8 MB.</div>
            </div>
            <>
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void upload(file);
                  event.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={uploading}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium hover:bg-gray-50 disabled:opacity-50"
              >
                {uploading ? "Enviando..." : "+ Enviar imagem"}
              </button>
            </>
          </div>

          {assets.length > 0 ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {assets.map((asset) => {
                const selected = attachmentUrl === asset.url;
                return (
                  <button
                    type="button"
                    key={asset.path}
                    onClick={() => onChange("library", asset.url)}
                    className={`overflow-hidden rounded-lg border-2 bg-gray-50 text-left transition ${
                      selected
                        ? "border-brand-900 ring-2 ring-brand-900/15"
                        : "border-transparent hover:border-gray-300"
                    }`}
                    title={asset.name}
                  >
                    <img
                      src={asset.url}
                      alt={asset.name}
                      className="aspect-square w-full object-cover"
                    />
                    <div className="truncate px-1.5 py-1 text-[10px] text-gray-600">
                      {asset.name}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="w-full rounded-lg border border-dashed border-gray-300 px-4 py-6 text-sm text-gray-500 hover:bg-gray-50"
            >
              Sua biblioteca está vazia. Envie a primeira imagem.
            </button>
          )}
          {error && <div className="mt-2 text-xs text-red-600">{error}</div>}
        </div>
      )}
    </div>
  );
}

function AttachmentOption({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition ${
        selected
          ? "border-brand-900 bg-brand-50 text-brand-900"
          : "border-gray-200 bg-white text-gray-700 hover:border-gray-400"
      }`}
      role="radio"
      aria-checked={selected}
    >
      <span>{label}</span>
      <span
        className={`grid h-4 w-4 place-items-center rounded-full border ${
          selected ? "border-brand-900" : "border-gray-400"
        }`}
      >
        {selected && <span className="h-2 w-2 rounded-full bg-brand-900" />}
      </span>
    </button>
  );
}
