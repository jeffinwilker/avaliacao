"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DuplicateButton({ kitId }: { kitId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function duplicate() {
    setLoading(true);
    const res = await fetch(`/api/kits/${kitId}/duplicate`, { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok || json.error) {
      alert(json.error ?? "Falha ao duplicar");
      return;
    }
    // vai direto pra edição da cópia
    if (json.id) router.push(`/kits/${json.id}`);
    router.refresh();
  }

  return (
    <button
      onClick={duplicate}
      disabled={loading}
      className="text-gray-600 hover:text-gray-900 hover:underline disabled:opacity-50"
    >
      {loading ? "Duplicando..." : "Duplicar"}
    </button>
  );
}
