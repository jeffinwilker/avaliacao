"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SyncButton({
  kitId,
  label = "Sincronizar",
}: {
  kitId: string;
  label?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function sync() {
    setLoading(true);
    const res = await fetch(`/api/kits/${kitId}/sync`, { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok || json.error) {
      alert(json.error ?? "Falha ao sincronizar");
    }
    router.refresh();
  }

  return (
    <button
      onClick={sync}
      disabled={loading}
      className="text-xs border border-gray-300 rounded px-2 py-1 hover:bg-gray-50 disabled:opacity-50"
    >
      {loading ? "..." : label}
    </button>
  );
}
