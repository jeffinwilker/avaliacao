import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { KitForm } from "../KitForm";

export default async function EditKitPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = createAdminClient();

  const { data: kit } = await admin
    .from("kits")
    .select(
      `*,
       items:kit_items (
         id, product_id, quantity, ordering,
         product:products (id, name, image_url, price)
       )`
    )
    .eq("id", id)
    .order("ordering", { referencedTable: "kit_items" })
    .maybeSingle();

  if (!kit) notFound();

  const items = ((kit.items ?? []) as Array<{
    product_id: string;
    quantity: number;
    ordering: number;
    product?: { name?: string; image_url?: string | null; price?: number | null } | null;
  }>)
    .sort((a, b) => a.ordering - b.ordering)
    .map((it) => ({
      productId: it.product_id,
      quantity: it.quantity,
      name: it.product?.name ?? "(produto removido)",
      imageUrl: it.product?.image_url ?? null,
      price: Number(it.product?.price ?? 0),
    }));

  const initial = {
    name: kit.name ?? "",
    description: kit.description ?? "",
    imageUrl: kit.image_url ?? "",
    discountType: kit.discount_type as "percent" | "fixed" | "total",
    discountValue: Number(kit.discount_value ?? 0),
    active: kit.active ?? true,
    items,
  };

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-4 text-sm text-gray-500">
        <Link href="/kits" className="hover:underline">
          ← Voltar para kits
        </Link>
      </div>
      <h1 className="text-2xl font-bold mb-6">Editar kit</h1>
      <KitForm mode="edit" kitId={kit.id} initial={initial} />
    </div>
  );
}
