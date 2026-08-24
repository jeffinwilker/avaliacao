"use client";

import { useEffect, useState, type FormEvent } from "react";

interface ReviewInvitationFormProps {
  apiKey: string;
  token: string;
  storeName: string;
  product: {
    externalId: string;
    name: string;
    imageUrl: string | null;
  };
  initialName: string;
  initialEmail: string;
  brandColor: string;
  maxMedia: number;
  preview?: boolean;
}

interface MediaPreview {
  file: File;
  url: string;
}

const MAX_MEDIA_BYTES = 20 * 1024 * 1024;

export function ReviewInvitationForm({
  apiKey,
  token,
  storeName,
  product,
  initialName,
  initialEmail,
  brandColor,
  maxMedia,
  preview = false,
}: ReviewInvitationFormProps) {
  const [rating, setRating] = useState(0);
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [title, setTitle] = useState("");
  const [comment, setComment] = useState("");
  const [media, setMedia] = useState<File[]>([]);
  const [previews, setPreviews] = useState<MediaPreview[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const next = media.map((file) => ({ file, url: URL.createObjectURL(file) }));
    setPreviews(next);
    return () => next.forEach((preview) => URL.revokeObjectURL(preview.url));
  }, [media]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (preview) return;

    if (rating < 1) {
      setError("Escolha uma nota de 1 a 5 estrelas.");
      return;
    }
    if (!name.trim()) {
      setError("Informe seu nome.");
      return;
    }

    const form = new FormData();
    form.append("apiKey", apiKey);
    form.append("externalProductId", product.externalId);
    form.append("token", token);
    form.append("customerName", name.trim());
    form.append("customerEmail", email.trim());
    form.append("rating", String(rating));
    form.append("title", title.trim());
    form.append("comment", comment.trim());
    media.forEach((file) => form.append("media", file));

    setSubmitting(true);
    try {
      const response = await fetch("/api/widget/submit", {
        method: "POST",
        body: form,
      });
      const result = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!response.ok) {
        throw new Error(result?.error || "Não foi possível enviar sua avaliação.");
      }
      setSuccess(true);
    } catch (submissionError) {
      setError((submissionError as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  function handleFiles(files: FileList | null) {
    if (!files) return;
    setError(null);
    const selected = Array.from(files);
    const oversized = selected.find((file) => file.size > MAX_MEDIA_BYTES);
    if (oversized) {
      setError(`O arquivo ${oversized.name} ultrapassa o limite de 20 MB.`);
      return;
    }
    setMedia((current) => [...current, ...selected].slice(0, maxMedia));
  }

  if (success) {
    return (
      <main className="min-h-screen bg-[#f3f2ef] px-4 py-8 sm:py-14">
        <section className="mx-auto max-w-lg overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm">
          <div className="border-b border-zinc-100 px-6 py-5 text-center text-sm font-semibold">
            {storeName}
          </div>
          <div className="px-7 py-12 text-center">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <CheckIcon />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Avaliação enviada!</h1>
            <p className="mt-3 text-sm leading-6 text-zinc-600">
              Obrigado por compartilhar sua experiência. Sua opinião ajuda a loja e outros clientes.
            </p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f3f2ef] px-3 py-4 sm:px-4 sm:py-10">
      <div className="mx-auto max-w-xl">
        <header className="mb-4 px-2 py-3 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
            Compra verificada
          </p>
          <p className="mt-1 text-lg font-bold tracking-tight text-zinc-950">{storeName}</p>
        </header>

        <section className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm">
          <div className="flex items-center gap-4 border-b border-zinc-100 p-5 sm:p-6">
            {product.imageUrl ? (
              <img
                src={product.imageUrl}
                alt={product.name}
                className="h-20 w-20 shrink-0 rounded-2xl border border-zinc-200 object-cover sm:h-24 sm:w-24"
              />
            ) : (
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-400 sm:h-24 sm:w-24">
                <ProductIcon />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs font-medium text-zinc-500">Produto comprado</p>
              <h1 className="mt-1 text-base font-bold leading-snug text-zinc-950 sm:text-lg">
                {product.name}
              </h1>
            </div>
          </div>

          <form className="p-5 sm:p-7" onSubmit={handleSubmit}>
            <div className="text-center">
              <h2 className="text-xl font-bold tracking-tight text-zinc-950 sm:text-2xl">
                Como foi sua experiência?
              </h2>
              <p className="mt-2 text-sm text-zinc-500">Toque nas estrelas para dar sua nota.</p>
              <div className="mt-5 flex justify-center gap-1" role="radiogroup" aria-label="Nota da avaliação">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={rating === value}
                    aria-label={`${value} ${value === 1 ? "estrela" : "estrelas"}`}
                    onClick={() => setRating(value)}
                    className="rounded-lg p-1 text-zinc-200 transition hover:scale-105 focus-visible:ring-2 focus-visible:ring-zinc-500"
                  >
                    <StarIcon active={value <= rating} />
                  </button>
                ))}
              </div>
              {rating > 0 && (
                <p className="mt-2 text-sm font-medium text-zinc-700">
                  {ratingLabel(rating)}
                </p>
              )}
            </div>

            {error && (
              <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
                {error}
              </div>
            )}

            <div className="mt-7 space-y-5">
              <Field label="Seu nome" required>
                <input
                  aria-label="Seu nome"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={80}
                  autoComplete="name"
                  required
                  className="h-12 w-full rounded-xl border border-zinc-300 bg-white px-4 text-base text-zinc-950 placeholder:text-zinc-400 focus:border-zinc-500"
                />
              </Field>

              <Field label="Seu e-mail" hint="Opcional">
                <input
                  aria-label="Seu e-mail"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  maxLength={120}
                  autoComplete="email"
                  className="h-12 w-full rounded-xl border border-zinc-300 bg-white px-4 text-base text-zinc-950 placeholder:text-zinc-400 focus:border-zinc-500"
                />
              </Field>

              <Field label="Resuma sua experiência" hint="Opcional">
                <input
                  aria-label="Resuma sua experiência"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={120}
                  placeholder="Ex.: Amei o produto!"
                  className="h-12 w-full rounded-xl border border-zinc-300 bg-white px-4 text-base text-zinc-950 placeholder:text-zinc-400 focus:border-zinc-500"
                />
              </Field>

              <Field label="Conte um pouco mais" hint="Opcional">
                <textarea
                  aria-label="Conte um pouco mais"
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  maxLength={1500}
                  rows={5}
                  placeholder="O que você achou do produto?"
                  className="w-full resize-y rounded-xl border border-zinc-300 bg-white px-4 py-3 text-base leading-6 text-zinc-950 placeholder:text-zinc-400 focus:border-zinc-500"
                />
              </Field>

              {maxMedia > 0 && (
                <Field label="Adicionar fotos ou vídeos" hint={`Opcional · até ${maxMedia}`}>
                  <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-5 text-center transition hover:bg-zinc-100">
                    <CameraIcon />
                    <span className="mt-2 text-sm font-semibold text-zinc-800">Escolher do celular</span>
                    <span className="mt-1 text-xs text-zinc-500">JPG, PNG, WebP ou vídeo · até 20 MB</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
                      multiple
                      disabled={preview}
                      className="sr-only"
                      onChange={(event) => {
                        handleFiles(event.target.files);
                        event.target.value = "";
                      }}
                    />
                  </label>

                  {previews.length > 0 && (
                    <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {previews.map((preview, index) => (
                        <div key={`${preview.file.name}-${preview.file.lastModified}`} className="group relative aspect-square overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100">
                          {preview.file.type.startsWith("video/") ? (
                            <video src={preview.url} className="h-full w-full object-cover" muted />
                          ) : (
                            <img src={preview.url} alt="Prévia do arquivo" className="h-full w-full object-cover" />
                          )}
                          <button
                            type="button"
                            aria-label={`Remover ${preview.file.name}`}
                            onClick={() => setMedia((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                            className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-zinc-950/75 text-white backdrop-blur"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </Field>
              )}
            </div>

            <button
              type={preview ? "button" : "submit"}
              disabled={submitting}
              className="mt-8 flex min-h-[52px] w-full items-center justify-center rounded-xl px-5 py-3.5 text-base font-bold text-white shadow-sm transition hover:brightness-95 disabled:cursor-wait disabled:opacity-60"
              style={{ backgroundColor: brandColor }}
            >
              {submitting ? "Enviando avaliação..." : "Enviar minha avaliação"}
            </button>
            <p className="mt-4 text-center text-xs leading-5 text-zinc-500">
              Sua avaliação será identificada como uma compra verificada.
            </p>
          </form>
        </section>
      </div>
    </main>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="block">
      <span className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-800">
        {label}
        {required && <span className="text-red-500">*</span>}
        {hint && <span className="font-normal text-zinc-400">{hint}</span>}
      </span>
      {children}
    </div>
  );
}

function ratingLabel(rating: number): string {
  return ["", "Ruim", "Regular", "Bom", "Muito bom", "Excelente!"][rating] ?? "";
}

function StarIcon({ active }: { active: boolean }) {
  return (
    <svg width="43" height="43" viewBox="0 0 24 24" fill={active ? "#f59e0b" : "currentColor"} aria-hidden="true">
      <path d="M12 2.3 15 9l7.3.6-5.5 4.8 1.7 7.1-6.5-4-6.5 4 1.7-7.1-5.5-4.8L9 9l3-6.7Z" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-zinc-500" aria-hidden="true">
      <path d="M4 8.5h3l1.4-2h7.2l1.4 2h3v10H4v-10Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <circle cx="12" cy="13.5" r="3.2" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function ProductIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m4 7 8-4 8 4-8 4-8-4Zm0 0v10l8 4 8-4V7M12 11v10" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m5 12 4 4L19 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
