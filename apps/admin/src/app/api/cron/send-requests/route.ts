import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/providers/resend";
import { sendWhatsApp } from "@/lib/providers/whatsapp";
import {
  DEFAULT_EMAIL_TEMPLATE,
  DEFAULT_WHATSAPP_TEMPLATE,
} from "@avaliacoes/shared";

// Cron job: processa fila de review_requests prontas para envio.
// Configure no Vercel ou em qualquer scheduler para chamar a cada 15-30 min.
// Proteção: header x-cron-secret deve bater com env CRON_SECRET.

export async function POST(req: NextRequest) {
  if (req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();

  const { data: requests } = await admin
    .from("review_requests")
    .select(
      `id, channel, token, store_id, order_id, product_id, attempts,
       store:stores (name, domain, api_key),
       settings:stores!inner (store_settings (email_subject, email_template, whatsapp_template)),
       order:orders (customer_name, customer_email, customer_phone),
       product:products (name, external_product_id, image_url)`
    )
    .eq("status", "scheduled")
    .lte("scheduled_for", new Date().toISOString())
    .lt("attempts", 5)
    .limit(50);

  if (!requests || requests.length === 0) {
    return NextResponse.json({ ok: true, processed: 0 });
  }

  let sent = 0;
  let failed = 0;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  for (const r of requests) {
    type Store = { name: string; domain: string | null; api_key: string };
    type Order = {
      customer_name: string;
      customer_email: string | null;
      customer_phone: string | null;
    };
    type Product = { name: string; external_product_id: string };
    const store = r.store as unknown as Store;
    const order = r.order as unknown as Order;
    const product = r.product as unknown as Product;

    if (!store || !order || !product) {
      await admin
        .from("review_requests")
        .update({ status: "cancelled", error_message: "missing relations" })
        .eq("id", r.id);
      failed++;
      continue;
    }

    // Link para a página do produto com o token (widget detecta e abre o form)
    const link = store.domain
      ? `https://${store.domain.replace(/^https?:\/\//, "")}/produto-${product.external_product_id}?av-token=${r.token}`
      : `${appUrl}/r/${r.token}`;

    const vars = {
      "{{nome}}": order.customer_name.split(" ")[0],
      "{{produto}}": product.name,
      "{{link}}": link,
      "{{loja}}": store.name,
    };

    const replaceVars = (template: string) =>
      Object.entries(vars).reduce(
        (str, [k, v]) => str.replaceAll(k, v),
        template
      );

    try {
      if (r.channel === "email" && order.customer_email) {
        const tpl =
          (r as unknown as { settings: { store_settings: { email_template: string | null } } })
            .settings?.store_settings?.email_template ?? DEFAULT_EMAIL_TEMPLATE;
        const subject =
          (r as unknown as { settings: { store_settings: { email_subject: string | null } } })
            .settings?.store_settings?.email_subject ??
          "Conta pra gente o que achou da sua compra?";
        await sendEmail({
          to: order.customer_email,
          subject: replaceVars(subject),
          body: replaceVars(tpl),
        });
      } else if (r.channel === "whatsapp" && order.customer_phone) {
        const tpl =
          (r as unknown as { settings: { store_settings: { whatsapp_template: string | null } } })
            .settings?.store_settings?.whatsapp_template ?? DEFAULT_WHATSAPP_TEMPLATE;
        await sendWhatsApp({
          phone: order.customer_phone,
          message: replaceVars(tpl),
        });
      } else {
        throw new Error("Canal sem destinatário disponível");
      }

      await admin
        .from("review_requests")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          attempts: r.attempts + 1,
        })
        .eq("id", r.id);
      sent++;
    } catch (err) {
      const attempts = r.attempts + 1;
      const failNow = attempts >= 5;
      await admin
        .from("review_requests")
        .update({
          status: failNow ? "failed" : "scheduled",
          attempts,
          error_message: (err as Error).message,
        })
        .eq("id", r.id);
      failed++;
    }
  }

  return NextResponse.json({ ok: true, sent, failed });
}
