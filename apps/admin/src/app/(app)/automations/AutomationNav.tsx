"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/automations/abandoned-carts", label: "Carrinhos abandonados" },
  { href: "/automations/post-sale", label: "Pós-venda" },
];

export function AutomationNav() {
  const pathname = usePathname();

  return (
    <nav className="inline-flex rounded-xl border border-gray-200 bg-white p-1" aria-label="Seções de automação">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
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
