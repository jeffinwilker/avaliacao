import { NextResponse, type NextRequest } from "next/server";
import {
  sendScheduledAutomationMessages,
  syncAbandonedCarts,
} from "@/lib/automations";
import { sendEmail } from "@/lib/providers/resend";
import { sendWhatsApp } from "@/lib/providers/whatsapp";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_EMAIL_TEMPLATE,
  DEFAULT_WHATSAPP_TEMPLATE,
} from "@avaliacoes/shared";

// O mesmo cron sincroniza carrinhos, envia recuperações/pós-venda e processa
// as solicitações de avaliação. A fila e os upserts tornam a execução
// idempotente mesmo quando chamada mais de uma vez.
export async function POST(req: NextRequest) {
  if (req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const sync = await syncAbandonedCarts(admin).catch((error) => ({
    stores: 0,
    found: 0,
    eligible: 0,
    queued: 0,
    cancelled: 0,
    errors: [(error as Error).message],
  }));
  const automations = await sendScheduledAutomationMessages(admin);
  const reviews = await sendReviewRequests(admin);

  return NextResponse.json({ ok: true, sync, automations, reviews });
}

async function sendReviewRequests(
  admin: ReturnType<typeof createAdminClient>
): Promise<{ processed: number; sent: number; failed: number }> {
  const { data: requests } = await admin
    .from("review_requests")
    .select(
      `id, channel, token, store_id, attempts,
       store:stores (name, domain),
       order:orders (customer_name, customer_email, customer_phone),
       product:products (name, external_product_id, url, image_url)`
    )
    .eq("status", "scheduled")
    .lte("scheduled_for", new Date().toISOString())
    .lt("attempts", 5)
    .order("scheduled_for", { ascending: true })
    .limit(50);

  if (!requests?.length) return { processed: 0, sent: 0, failed: 0 };

  const storeIds = [...new Set(requests.map((request) => request.store_id))];
  const { data: settings } = await admin
    .from("store_settings")
    .select(
      `store_id, email_subject, email_template, whatsapp_template,
       whatsapp_instance, whatsapp_attachment_type, whatsapp_attachment_url`
    )
    .in("store_id", storeIds);
  const settingsByStore = new Map(
    (settings ?? []).map((config) => [config.store_id, config])
  );

  let sent = 0;
  let failed = 0;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  for (const request of requests) {
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
    const config = settingsByStore.get(request.store_id);

    if (!store || !order || !product) {
      await admin
        .from("review_requests")
        .update({ status: "cancelled", error_message: "missing relations" })
        .eq("id", request.id);
      failed++;
      continue;
    }

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
      sent++;
    } catch (error) {
      const attempts = request.attempts + 1;
      await admin
        .from("review_requests")
        .update({
          status: attempts >= 5 ? "failed" : "scheduled",
          attempts,
          error_message: (error as Error).message.slice(0, 1000),
        })
        .eq("id", request.id);
      failed++;
    }
  }

  return { processed: requests.length, sent, failed };
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
