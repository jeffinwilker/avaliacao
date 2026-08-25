import {
  DEFAULT_EMAIL_TEMPLATE,
  DEFAULT_WHATSAPP_TEMPLATE,
} from "@avaliacoes/shared";
import { sendEmail } from "@/lib/providers/resend";
import { sendWhatsApp } from "@/lib/providers/whatsapp";
import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

interface ReviewRequestRow {
  id: string;
  channel: "email" | "whatsapp";
  token: string;
  store_id: string;
  attempts: number;
  store: unknown;
  order: unknown;
  product: unknown;
}

interface ReviewSettings {
  email_subject?: string | null;
  email_template?: string | null;
  whatsapp_template?: string | null;
  whatsapp_instance?: string | null;
  whatsapp_attachment_type?: string | null;
  whatsapp_attachment_url?: string | null;
}

const REQUEST_SELECT = `id, channel, token, store_id, attempts,
  store:stores (name, domain),
  order:orders (customer_name, customer_email, customer_phone),
  product:products (name, external_product_id, url, image_url)`;

const SETTINGS_SELECT = `store_id, email_subject, email_template, whatsapp_template,
  whatsapp_instance, whatsapp_attachment_type, whatsapp_attachment_url`;

export async function sendDueReviewRequests(
  admin: AdminClient
): Promise<{ processed: number; sent: number; failed: number }> {
  const { data: requests, error } = await admin
    .from("review_requests")
    .select(REQUEST_SELECT)
    .eq("status", "scheduled")
    .lte("scheduled_for", new Date().toISOString())
    .lt("attempts", 5)
    .order("scheduled_for", { ascending: true })
    .limit(50);

  if (error) throw new Error(error.message);
  if (!requests?.length) return { processed: 0, sent: 0, failed: 0 };

  const storeIds = [...new Set(requests.map((request) => request.store_id))];
  const { data: settings } = await admin
    .from("store_settings")
    .select(SETTINGS_SELECT)
    .in("store_id", storeIds);
  const settingsByStore = new Map(
    (settings ?? []).map((config) => [config.store_id, config as ReviewSettings])
  );

  let sent = 0;
  let failed = 0;
  for (const request of requests as unknown as ReviewRequestRow[]) {
    try {
      await deliverReviewRequest(
        admin,
        request,
        settingsByStore.get(request.store_id),
        true
      );
      sent++;
    } catch {
      failed++;
    }
  }

  return { processed: requests.length, sent, failed };
}

export async function sendReviewRequestNow(
  admin: AdminClient,
  requestId: string
): Promise<void> {
  const { data: request, error } = await admin
    .from("review_requests")
    .select(REQUEST_SELECT)
    .eq("id", requestId)
    .single();
  if (error || !request) {
    throw new Error(error?.message || "Pedido de avaliação não encontrado");
  }

  const { data: settings } = await admin
    .from("store_settings")
    .select(SETTINGS_SELECT)
    .eq("store_id", request.store_id)
    .maybeSingle();

  await deliverReviewRequest(
    admin,
    request as unknown as ReviewRequestRow,
    (settings as ReviewSettings | null) ?? undefined,
    false
  );
}

async function deliverReviewRequest(
  admin: AdminClient,
  request: ReviewRequestRow,
  config: ReviewSettings | undefined,
  retryAutomatically: boolean
): Promise<void> {
  type Store = { name: string; domain: string | null };
  type Order = {
    customer_name: string;
    customer_email: string | null;
    customer_phone: string | null;
  };
  type Product = {
    name: string;
    external_product_id: string;
    url: string | null;
    image_url: string | null;
  };

  const store = pickRelation<Store>(request.store);
  const order = pickRelation<Order>(request.order);
  const product = pickRelation<Product>(request.product);
  if (!store || !order || !product) {
    await admin
      .from("review_requests")
      .update({ status: "cancelled", error_message: "missing relations" })
      .eq("id", request.id);
    throw new Error("Faltam dados do pedido ou do produto");
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const directReviewLink = appUrl
    ? `${appUrl.replace(/\/$/, "")}/avaliar/${encodeURIComponent(request.token)}`
    : null;
  const baseLink =
    product.url ||
    (store.domain
      ? normalizeStoreUrl(store.domain)
      : `/avaliar/${encodeURIComponent(request.token)}`);
  const link =
    directReviewLink ??
    `${baseLink}${baseLink.includes("?") ? "&" : "?"}av-token=${request.token}`;
  const vars: Record<string, string> = {
    "{{nome}}": firstName(order.customer_name),
    "{{produto}}": product.name,
    "{{link}}": link,
    "{{link_avaliacao}}": link,
    "{{loja}}": store.name,
  };
  const replaceVars = (template: string) =>
    Object.entries(vars).reduce(
      (message, [variable, value]) => message.replaceAll(variable, value),
      template
    );

  try {
    if (request.channel === "email" && order.customer_email) {
      await sendEmail({
        to: order.customer_email,
        subject: replaceVars(
          config?.email_subject || "Conta pra gente o que achou da sua compra?"
        ),
        body: replaceVars(config?.email_template || DEFAULT_EMAIL_TEMPLATE),
      });
    } else if (request.channel === "whatsapp" && order.customer_phone) {
      await sendWhatsApp({
        phone: order.customer_phone,
        message: replaceVars(
          config?.whatsapp_template || DEFAULT_WHATSAPP_TEMPLATE
        ),
        instance: config?.whatsapp_instance,
        mediaUrl:
          config?.whatsapp_attachment_type === "library"
            ? config.whatsapp_attachment_url
            : config?.whatsapp_attachment_type === "product_image"
              ? product.image_url
              : null,
      });
    } else {
      throw new Error("Canal sem destinatário disponível");
    }

    await admin
      .from("review_requests")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        attempts: request.attempts + 1,
        error_message: null,
      })
      .eq("id", request.id);
  } catch (error) {
    const attempts = request.attempts + 1;
    await admin
      .from("review_requests")
      .update({
        status: retryAutomatically && attempts < 5 ? "scheduled" : "failed",
        attempts,
        error_message: (error as Error).message.slice(0, 1000),
      })
      .eq("id", request.id);
    throw error;
  }
}

function pickRelation<T>(value: unknown): T | null {
  if (Array.isArray(value)) return (value[0] as T | undefined) ?? null;
  return (value as T | null) ?? null;
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || "cliente";
}

function normalizeStoreUrl(domain: string): string {
  return domain.startsWith("http://") || domain.startsWith("https://")
    ? domain
    : `https://${domain}`;
}
