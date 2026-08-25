"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export function AutomationNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const section = searchParams.get("section") || "orders";
  const tabs = [
    { slug: "abandoned-carts", label: "Carrinho abandonado" },
    { slug: "post-sale", label: section === "orders" ? "Pedidos" : "Pós-venda" },
  ];

  return (
    <nav
      className="inline-flex rounded-xl border border-gray-200 bg-white p-1"
      aria-label="Tipo de automação"
    >
      {tabs.map((tab) => {
        const href = `/automations/${tab.slug}?section=${section}`;
        const active = pathname === `/automations/${tab.slug}`;
        return (
          <Link
            key={tab.slug}
            href={href}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              active
                ? "bg-brand-900 text-white"
                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
