import Link from "next/link";
import { KitForm } from "../KitForm";

export default function NewKitPage() {
  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-4 text-sm text-gray-500">
        <Link href="/kits" className="hover:underline">
          ← Voltar para kits
        </Link>
      </div>
      <h1 className="text-2xl font-bold mb-6">Novo kit</h1>
      <KitForm mode="new" />
    </div>
  );
}
