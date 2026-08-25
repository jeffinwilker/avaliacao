"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { AppIcon, type AppIconName } from "@/components/AppIcon";

const groups: Array<{
  label: string;
  items: Array<{
    href: string;
    label: string;
    icon: AppIconName;
    exact?: boolean;
    automationSection?: "orders" | "messages" | "routines";
  }>;
}> = [
  {
    label: "Painel",
    items: [{ href: "/dashboard", label: "Visão geral", icon: "dashboard" }],
  },
  {
    label: "Gestão",
    items: [
      { href: "/reviews", label: "Avaliações", icon: "star" },
      { href: "/kits", label: "Kits", icon: "gift" },
      { href: "/products", label: "Produtos", icon: "package" },
      { href: "/reels", label: "Reels", icon: "video" },
      { href: "/import", label: "Importar", icon: "download" },
    ],
  },
  {
    label: "Automações",
    items: [
      {
        href: "/automations/abandoned-carts?section=orders",
        label: "Pedidos e envios",
        icon: "receipt",
        automationSection: "orders",
      },
      {
        href: "/automations/abandoned-carts?section=messages",
        label: "Mensagens",
        icon: "workflow",
        automationSection: "messages",
      },
      {
        href: "/automations/abandoned-carts?section=routines",
        label: "Rotinas",
        icon: "clock",
        automationSection: "routines",
      },
    ],
  },
  {
    label: "Loja",
    items: [
      { href: "/preview", label: "Preview do widget", icon: "eye" },
      { href: "/settings", label: "Configurações", icon: "settings" },
      { href: "/integration", label: "Integração", icon: "plug" },
    ],
  },
];

export function Sidebar({
  userEmail,
  mobileOpen = false,
  onClose,
}: {
  userEmail: string | null;
  mobileOpen?: boolean;
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const automationType = pathname.startsWith("/automations/post-sale")
    ? "post-sale"
    : "abandoned-carts";
  const activeAutomationSection = searchParams.get("section") || "orders";

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <aside
      className={clsx(
        "fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col border-r border-[#dfdedb] bg-[#f1f0ee] transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0",
        mobileOpen ? "translate-x-0" : "-translate-x-full"
      )}
    >
      <div className="flex h-16 items-center gap-3 border-b border-[#dfdedb] px-4">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-zinc-950 text-white shadow-sm">
          <AppIcon name="star" size={18} />
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold tracking-tight text-zinc-950">
            Avaliações
          </h1>
          <p className="truncate text-[11px] text-zinc-500">Avaliações & Kits</p>
        </div>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {groups.map((group) => (
          <div key={group.label}>
            <div className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
              {group.label}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const href = item.automationSection
                  ? `/automations/${automationType}?section=${item.automationSection}`
                  : item.href;
                const active = item.automationSection
                  ? pathname.startsWith("/automations/") &&
                    activeAutomationSection === item.automationSection
                  : item.exact
                    ? pathname === item.href
                    : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={href}
                    onClick={onClose}
                    className={clsx(
                      "group flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition",
                      active
                        ? "border border-zinc-200/80 bg-white text-zinc-950 shadow-sm"
                        : "border border-transparent text-zinc-600 hover:bg-white/70 hover:text-zinc-950"
                    )}
                  >
                    <AppIcon
                      name={item.icon}
                      size={17}
                      className={active ? "text-zinc-950" : "text-zinc-500"}
                    />
                    <span className="flex-1 truncate">{item.label}</span>
                    {active && (
                      <span className="h-1.5 w-1.5 rounded-full bg-zinc-950" />
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-[#dfdedb] p-3">
        <div className="mb-2 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-zinc-100 text-zinc-700">
              <AppIcon name="user" size={15} />
            </span>
            <div className="min-w-0">
              <div className="text-xs font-medium text-zinc-800">Conta da loja</div>
              <div className="truncate text-[11px] text-zinc-500" title={userEmail ?? ""}>
                {userEmail}
              </div>
            </div>
          </div>
        </div>
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-xs font-medium text-zinc-600 hover:bg-white hover:text-zinc-950"
        >
          <AppIcon name="logout" size={16} />
          Sair
        </button>
      </div>
    </aside>
  );
}
