"use client";

import { useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";

export function AppShell({
  userEmail,
  children,
}: {
  userEmail: string | null;
  children: React.ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#f7f7f5] lg:flex">
      <Sidebar
        userEmail={userEmail}
        mobileOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
      />
      {menuOpen && (
        <button
          type="button"
          aria-label="Fechar menu"
          className="fixed inset-0 z-40 bg-black/25 backdrop-blur-[1px] lg:hidden"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <div className="min-w-0 flex-1">
        <Topbar userEmail={userEmail} onOpenMenu={() => setMenuOpen(true)} />
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}

