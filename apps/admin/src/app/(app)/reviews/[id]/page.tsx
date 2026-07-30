import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { Stars } from "@/components/Stars";
import { StatusBadge } from "@/components/StatusBadge";
import { pickOne } from "@/lib/pick-one";
import { ReviewActions } from "./ReviewActions";

const dtf = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function ReviewDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = createAdminClient();

  const { data: review } = await admin
    .from("reviews")
    .select(
      `*,
       products (name, image_url, url),
       media:review_media (id, type, url, storage_path, ordering)`
    )
    .eq("id", id)
    .maybeSingle();

  if (!review) notFound();

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-4 text-sm text-gray-500">
        <a href="/reviews" className="hover:underline">
          ← Voltar para avaliações
        </a>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-xl font-bold">{review.customer_name}</h1>
              <StatusBadge status={review.status} />
              {review.verified_purchase && (
                <span className="text-xs text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                  ✓ Compra verificada
                </span>
              )}
            </div>
            {review.customer_email && (
              <div className="text-sm text-gray-500">{review.customer_email}</div>
            )}
            <div className="text-xs text-gray-500 mt-1">
              {dtf.format(new Date(review.created_at))}
            </div>
          </div>
          <Stars value={review.rating} size={24} />
        </div>

        {(() => {
          const product = pickOne<{ name: string; image_url: string | null }>(
            review.products
          );
          if (!product) return null;
          return (
            <div className="flex items-center gap-3 bg-gray-50 rounded-lg p-3 mb-4">
              {product.image_url && (
                <img
                  src={product.image_url}
                  alt=""
                  className="w-12 h-12 rounded object-cover"
                />
              )}
              <div className="text-sm">
                <div className="font-medium">{product.name}</div>
              </div>
            </div>
          );
        })()}

        {review.title && (
          <h2 className="text-lg font-semibold mb-2">{review.title}</h2>
        )}
        {review.comment && (
          <p className="text-gray-800 whitespace-pre-wrap">{review.comment}</p>
        )}

        {review.media && review.media.length > 0 && (
          <div className="flex gap-2 mt-4 flex-wrap">
            {(
              review.media as unknown as Array<{
                id: string;
                type: string;
                url: string | null;
              }>
            ).map((m) =>
              m.type === "video" ? (
                <video
                  key={m.id}
                  src={m.url ?? undefined}
                  controls
                  className="w-32 h-32 rounded object-cover border border-gray-200"
                />
              ) : (
                <img
                  key={m.id}
                  src={m.url ?? undefined}
                  alt=""
                  className="w-32 h-32 rounded object-cover border border-gray-200"
                />
              )
            )}
          </div>
        )}

        {review.reply && (
          <div className="mt-4 p-4 bg-gray-50 border-l-4 border-brand-900 rounded">
            <div className="text-xs font-semibold text-gray-700 mb-1">
              Resposta da loja
            </div>
            <p className="text-gray-800">{review.reply}</p>
          </div>
        )}
      </div>

      <ReviewActions
        reviewId={review.id}
        currentStatus={review.status}
        currentReply={review.reply}
      />
    </div>
  );
}
