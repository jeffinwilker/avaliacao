"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ReviewStatus } from "@avaliacoes/shared";

interface Props {
  reviewId: string;
  currentStatus: ReviewStatus;
  currentReply: string | null;
}

export function ReviewActions({ reviewId, currentStatus, currentReply }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [reply, setReply] = useState(currentReply ?? "");
  const [error, setError] = useState<string | null>(null);

  async function moderate(status: ReviewStatus) {
    setError(null);
    const res = await fetch(`/api/reviews/${reviewId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      setError("Falha ao atualizar.");
      return;
    }
    startTransition(() => router.refresh());
  }

  async function sendReply() {
    setError(null);
    const res = await fetch(`/api/reviews/${reviewId}/reply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reply }),
    });
    if (!res.ok) {
      setError("Falha ao enviar resposta.");
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-semibold mb-3">Moderação</h3>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => moderate("approved")}
            disabled={pending || currentStatus === "approved"}
            className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
          >
            ✓ Aprovar
          </button>
          <button
            onClick={() => moderate("rejected")}
            disabled={pending || currentStatus === "rejected"}
            className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
          >
            ✕ Reprovar
          </button>
          {currentStatus !== "pending" && (
            <button
              onClick={() => moderate("pending")}
              disabled={pending}
              className="bg-gray-100 text-gray-800 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-50"
            >
              ↺ Marcar como pendente
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-semibold mb-3">Resposta da loja</h3>
        <textarea
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm min-h-[100px]"
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          placeholder="Agradeça, esclareça, demonstre atenção..."
          maxLength={1000}
        />
        <div className="flex justify-end mt-2">
          <button
            onClick={sendReply}
            disabled={pending || !reply.trim()}
            className="bg-brand-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {currentReply ? "Atualizar resposta" : "Publicar resposta"}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg border border-red-200">
          {error}
        </div>
      )}
    </div>
  );
}
