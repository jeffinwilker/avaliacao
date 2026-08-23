"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import clsx from "clsx";

const items = [
  { href: "/dashboard", label: "Dashboard", icon: "📊" },
  { href: "/reviews", label: "Avaliações", icon: "⭐" },
  { href: "/kits", label: "Kits", icon: "🎁" },
  { href: "/products", label: "Produtos", icon: "🛍️" },
  { href: "/import", label: "Importar", icon: "📥" },
  { href: "/automations", label: "Automações", icon: "📲" },
  { href: "/preview", label: "Preview do widget", icon: "👁️" },
  { href: "/settings", label: "Configurações", icon: "⚙️" },
  { href: "/integration", label: "Integração", icon: "🔌" },
];

export function Sidebar({ userEmail }: { userEmail: string | null }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
      <div className="px-6 py-5 border-b border-gray-200">
        <h1 className="font-bold text-lg">Avaliações</h1>
        <p className="text-xs text-gray-500 mt-0.5">painel da loja</p>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {items.map((it) => {
          const active = pathname.startsWith(it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              className={clsx(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm",
                active
                  ? "bg-brand-900 text-white"
                  : "text-gray-700 hover:bg-gray-100"
              )}
            >
              <span>{it.icon}</span>
              <span>{it.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-gray-200">
        <div className="text-xs text-gray-500 px-3 mb-2 truncate" title={userEmail ?? ""}>
          {userEmail}
        </div>
        <button
          onClick={logout}
          className="w-full text-left text-sm text-gray-700 hover:bg-gray-100 px-3 py-2 rounded-lg"
        >
          Sair
        </button>
      </div>
    </aside>
  );
}
