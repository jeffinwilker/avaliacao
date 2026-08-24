"use client";

import { usePathname } from "next/navigation";
import { AppIcon } from "@/components/AppIcon";

const sectionTitles = [
  { path: "/account/password", title: "Definir nova senha", group: "Conta" },
  { path: "/automations/orders", title: "Pedidos e envios", group: "Automações" },
  { path: "/automations", title: "Rotinas", group: "Automações" },
  { path: "/reviews", title: "Avaliações", group: "Gestão" },
  { path: "/kits", title: "Kits de produtos", group: "Gestão" },
  { path: "/products", title: "Produtos", group: "Gestão" },
  { path: "/import", title: "Importar avaliações", group: "Gestão" },
  { path: "/preview", title: "Preview do widget", group: "Loja" },
  { path: "/settings", title: "Configurações", group: "Loja" },
  { path: "/integration", title: "Integração", group: "Loja" },
  { path: "/dashboard", title: "Visão geral", group: "Painel" },
];

export function Topbar({
  userEmail,
  onOpenMenu,
}: {
  userEmail: string | null;
  onOpenMenu: () => void;
}) {
  const pathname = usePathname();
  const section =
    sectionTitles.find((item) => pathname.startsWith(item.path)) ??
    sectionTitles[sectionTitles.length - 1];
  const initial = (userEmail?.trim()[0] || "U").toUpperCase();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[#e6e5e2] bg-white/90 px-4 backdrop-blur-md sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onOpenMenu}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-700 lg:hidden"
          aria-label="Abrir menu"
        >
          <AppIcon name="menu" size={19} />
        </button>
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <span className="hidden text-zinc-400 sm:inline">{section.group}</span>
          <AppIcon
            name="chevron-right"
            size={14}
            className="hidden text-zinc-300 sm:block"
          />
          <span className="truncate font-medium text-zinc-800">{section.title}</span>
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white py-1.5 pl-1.5 pr-3 shadow-sm">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-zinc-900 text-xs font-semibold text-white">
          {initial}
        </span>
        <span className="hidden max-w-44 truncate text-xs font-medium text-zinc-600 sm:block">
          {userEmail || "Conta da loja"}
        </span>
      </div>
    </header>
  );
}
