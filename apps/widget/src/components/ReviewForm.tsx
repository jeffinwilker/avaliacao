import { useState } from "react";
import { Stars } from "./Stars";
import { MediaUpload } from "./MediaUpload";
import { submitReview } from "../lib/api";

interface ReviewFormProps {
  apiKey: string;
  externalProductId: string;
  token?: string;
  maxMedia: number;
  onClose: () => void;
  onSubmitted: () => void;
}

export function ReviewForm({
  apiKey,
  externalProductId,
  token,
  maxMedia,
  onClose,
  onSubmitted,
}: ReviewFormProps) {
  const [rating, setRating] = useState(0);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState("");
  const [comment, setComment] = useState("");
  const [media, setMedia] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (rating < 1) {
      setError("Escolha uma nota de 1 a 5 estrelas.");
      return;
    }
    if (!name.trim()) {
      setError("Informe seu nome.");
      return;
    }

    setSubmitting(true);
    const res = await submitReview({
      apiKey,
      externalProductId,
      customerName: name.trim(),
      customerEmail: email.trim() || undefined,
      rating,
      title: title.trim() || undefined,
      comment: comment.trim() || undefined,
      media,
      token,
    });
    setSubmitting(false);

    if (!res.ok) {
      setError(res.error ?? "Não foi possível enviar a avaliação.");
      return;
    }

    setSuccess(true);
    setTimeout(() => {
      onSubmitted();
    }, 2200);
  }

  if (success) {
    return (
      <div className="av-form">
        <div className="av-success">
          <strong>Obrigado pela sua avaliação! 🎉</strong>
          <div style={{ marginTop: 6, fontSize: 13 }}>
            Vamos publicá-la em breve após uma revisão rápida.
          </div>
        </div>
      </div>
    );
  }

  return (
    <form className="av-form" onSubmit={handleSubmit}>
      <h3>Escrever avaliação</h3>

      {error && <div className="av-error">{error}</div>}

      <div className="av-field">
        <label className="av-label">Sua nota *</label>
        <Stars value={rating} size="lg" interactive onChange={setRating} />
      </div>

      <div className="av-form-row">
        <div className="av-field">
          <label className="av-label" htmlFor="av-name">Seu nome *</label>
          <input
            id="av-name"
            className="av-input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            required
          />
        </div>
        <div className="av-field">
          <label className="av-label" htmlFor="av-email">E-mail (opcional)</label>
          <input
            id="av-email"
            className="av-input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={120}
          />
        </div>
      </div>

      <div className="av-field">
        <label className="av-label" htmlFor="av-title">Título (opcional)</label>
        <input
          id="av-title"
          className="av-input"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          placeholder="Ex: Adorei!"
        />
      </div>

      <div className="av-field">
        <label className="av-label" htmlFor="av-comment">Conte sua experiência</label>
        <textarea
          id="av-comment"
          className="av-textarea"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={1500}
          placeholder="O que você achou do produto?"
        />
      </div>

      {maxMedia > 0 && (
        <div className="av-field">
          <label className="av-label">Fotos e vídeos (opcional)</label>
          <MediaUpload files={media} onChange={setMedia} max={maxMedia} />
        </div>
      )}

      <div className="av-form-actions">
        <button
          type="button"
          className="av-btn av-btn-ghost"
          onClick={onClose}
          disabled={submitting}
        >
          Cancelar
        </button>
        <button type="submit" className="av-btn" disabled={submitting}>
          {submitting ? "Enviando..." : "Enviar avaliação"}
        </button>
      </div>
    </form>
  );
}
