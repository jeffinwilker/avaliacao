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

  if (kit.source === "nuvemshop_native") {
    return (
      <div className="p-8 max-w-3xl">
        <div className="mb-4 text-sm text-gray-500">
          <Link href="/kits" className="hover:underline">
            ← Voltar para kits
          </Link>
        </div>
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-6">
          <h1 className="text-xl font-bold text-gray-950">{kit.name}</h1>
          <p className="mt-2 text-sm leading-6 text-blue-950">
            Este é um kit nativo. Produtos, quantidades, desconto e estoque são
            editados diretamente no painel da Nuvemshop. Depois, use “Atualizar
            dados” na lista de kits.
          </p>
          {kit.nuvemshop_url && (
            <a
              href={kit.nuvemshop_url}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800"
            >
              Ver kit na loja ↗
            </a>
          )}
        </div>
      </div>
    );
  }

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

  const galleryImages: string[] =
    Array.isArray(kit.images) && kit.images.length > 0
      ? (kit.images as string[])
      : kit.image_url
      ? [kit.image_url]
      : [];

  const initial = {
    name: kit.name ?? "",
    description: kit.description ?? "",
    images: galleryImages,
    discountType: kit.discount_type as "percent" | "fixed" | "total",
    discountValue: Number(kit.discount_value ?? 0),
    dimensionRule: (kit.dimension_rule as "auto" | "custom") ?? "auto",
    weight: kit.weight != null ? Number(kit.weight) : null,
    depth: kit.depth != null ? Number(kit.depth) : null,
    width: kit.width != null ? Number(kit.width) : null,
    height: kit.height != null ? Number(kit.height) : null,
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
