import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { pickOne } from "@/lib/pick-one";
import {
  ReelsManager,
  type ProductReelView,
  type ReelProductOption,
} from "./ReelsManager";

export default async function ReelsPage() {
  const admin = createAdminClient();
  const { data: store } = await admin
    .from("stores")
    .select("id, name")
    .limit(1)
    .maybeSingle();

  if (!store) {
    return (
      <div className="p-8">
        <p className="text-gray-600">
          Conecte sua loja primeiro em{" "}
          <Link href="/integration" className="underline">
            Integração
          </Link>
          .
        </p>
      </div>
    );
  }

  const [productsResult, reelsResult] = await Promise.all([
    admin
      .from("products")
      .select("id, external_product_id, name, image_url, url")
      .eq("store_id", store.id)
      .order("name")
      .limit(5000),
    admin
      .from("product_reels")
      .select(
        `id, product_id, title, video_url, storage_provider, storage_path, thumbnail_url, active, ordering, created_at,
         product:products (id, external_product_id, name, image_url, url)`
      )
      .eq("store_id", store.id)
      .order("ordering", { ascending: true })
      .order("created_at", { ascending: false }),
  ]);

  const products: ReelProductOption[] = (productsResult.data ?? []).map((product) => ({
    id: product.id,
    externalProductId: product.external_product_id,
    name: product.name,
    imageUrl: product.image_url,
    url: product.url,
  }));

  const reels: ProductReelView[] = (reelsResult.data ?? [])
    .map((reel) => {
      const product = pickOne<{
        id: string;
        external_product_id: string;
        name: string;
        image_url: string | null;
        url: string | null;
      }>(reel.product);
      if (!product) return null;
      return {
        id: reel.id,
        productId: reel.product_id,
        productExternalId: product.external_product_id,
        productName: product.name,
        productImageUrl: product.image_url,
        productUrl: product.url,
        title: reel.title,
        videoUrl: reel.video_url,
        storageProvider: reel.storage_provider === "r2" ? "r2" : "supabase",
        storagePath: reel.storage_path,
        thumbnailUrl: reel.thumbnail_url,
        active: reel.active,
        ordering: reel.ordering,
        createdAt: reel.created_at,
      };
    })
    .filter(Boolean) as ProductReelView[];

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Reels dos produtos</h1>
        <p className="mt-1 text-sm text-gray-500">
          Vídeos verticais exibidos como destaques na página do produto.
        </p>
      </div>

      <ReelsManager
        storeId={store.id}
        products={products}
        initialReels={reels}
        available={!reelsResult.error}
        unavailableMessage={
          reelsResult.error ? migrationMessage(reelsResult.error.message) : null
        }
      />
    </div>
  );
}

function migrationMessage(message: string): string {
  const tableMissing =
    message.includes("product_reels") &&
    (message.includes("schema cache") || message.includes("does not exist"));
  return tableMissing
    ? "Execute a migration 0015_product_reels.sql no Supabase para liberar os reels."
    : message;
}
