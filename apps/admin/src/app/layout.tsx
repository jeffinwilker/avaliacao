import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Avaliações — Painel",
  description: "Sistema de avaliações da sua loja",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className="bg-gray-50 text-gray-900">{children}</body>
    </html>
  );
}
