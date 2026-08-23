import {
  DEFAULT_ABANDONED_CART_WHATSAPP_TEMPLATE,
  DEFAULT_POST_PURCHASE_WHATSAPP_TEMPLATE,
} from "@avaliacoes/shared";
import { fetchAllAbandonedCheckouts } from "@/lib/nuvemshop";
import { sendWhatsApp } from "@/lib/providers/whatsapp";
import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;
type AutomationType = "abandoned_cart" | "post_purchase";

interface AutomationMessageInput {
  storeId: string;
  externalReference: string;
  referenceLabel?: string | null;
  sourceToken?: string | null;
  customerName: string;
  customerPhone: string;
  productsSummary: string;
  link?: string | null;
  scheduledFor: string;
}

interface AutomationJob {
  id: string;
  store_id: string;
  automation_type: AutomationType;
  external_reference: string;
  reference_label: string | null;
  customer_name: string;
  customer_phone: string;
  products_summary: string;
  link: string | null;
  attempts: number;
}

export interface AbandonedCartSyncResult {
  stores: number;
  found: number;
  eligible: number;
  queued: number;
  cancelled: number;
  errors: string[];
}

export interface AutomationSendResult {
  processed: number;
  sent: number;
  failed: number;
  cancelled: number;
}

export async function syncAbandonedCarts(
  admin: AdminClient
): Promise<AbandonedCartSyncResult> {
  const result: AbandonedCartSyncResult = {
    stores: 0,
    found: 0,
    eligible: 0,
    queued: 0,
    cancelled: 0,
    errors: [],
  };

  const { data: configs, error: configError } = await admin
    .from("store_settings")
    .select("store_id, abandoned_cart_delay_hours")
    .eq("abandoned_cart_enabled", true);

  if (configError) throw configError;

  for (const config of configs ?? []) {
    const { data: store } = await admin
      .from("stores")
      .select("id, external_store_id, access_token")
      .eq("id", config.store_id)
      .maybeSingle();

    if (!store?.access_token) {
      result.errors.push(`Loja ${config.store_id}: conexão com a Nuvemshop ausente`);
      continue;
    }

    result.stores++;

    try {
      const checkouts = await fetchAllAbandonedCheckouts(
        store.external_store_id,
        store.access_token
      );
      result.found += checkouts.length;

      const completedIds = checkouts
        .filter((checkout) => Boolean(checkout.completed_at))
        .map((checkout) => String(checkout.id));

      for (let i = 0; i < completedIds.length; i += 200) {
        const { data: cancelled } = await admin
          .from("automation_messages")
          .update({ status: "cancelled", error_message: null })
          .eq("store_id", store.id)
          .eq("automation_type", "abandoned_cart")
          .eq("status", "scheduled")
          .in("external_reference", completedIds.slice(i, i + 200))
          .select("id");
        result.cancelled += cancelled?.length ?? 0;
      }

      const rows = checkouts
        .filter((checkout) => !checkout.completed_at)
        .map((checkout) => {
          const phone = checkout.contact_phone || checkout.shipping_phone;
          const productsSummary = summarizeProducts(checkout.products);
          if (!phone || !checkout.abandoned_checkout_url || !productsSummary) return null;

          const createdAt = new Date(checkout.created_at).getTime();
          const baseTime = Number.isFinite(createdAt) ? createdAt : Date.now();
          const delay = Math.max(6, config.abandoned_cart_delay_hours ?? 8);

          return {
            store_id: store.id,
            automation_type: "abandoned_cart" as const,
            external_reference: String(checkout.id),
            reference_label: String(checkout.id),
            source_token: checkout.token || null,
            customer_name:
              checkout.contact_name || checkout.shipping_name || "Cliente",
            customer_phone: phone,
            products_summary: productsSummary,
            link: checkout.abandoned_checkout_url,
            scheduled_for: new Date(baseTime + delay * 3600_000).toISOString(),
          };
        })
        .filter((row): row is NonNullable<typeof row> => Boolean(row));

      result.eligible += rows.length;

      for (let i = 0; i < rows.length; i += 200) {
        const { data: inserted, error } = await admin
          .from("automation_messages")
          .upsert(rows.slice(i, i + 200), {
            onConflict: "store_id,automation_type,external_reference",
            ignoreDuplicates: true,
          })
          .select("id");
        if (error) throw error;
        result.queued += inserted?.length ?? 0;
      }
    } catch (error) {
      result.errors.push(
        `Loja ${store.external_store_id}: ${(error as Error).message}`
      );
    }
  }

  return result;
}

export async function queuePostPurchaseMessage(
  admin: AdminClient,
  input: AutomationMessageInput
): Promise<boolean> {
  const { data, error } = await admin
    .from("automation_messages")
    .upsert(
      {
        store_id: input.storeId,
        automation_type: "post_purchase",
        external_reference: input.externalReference,
        reference_label: input.referenceLabel || input.externalReference,
        source_token: input.sourceToken || null,
        customer_name: input.customerName || "Cliente",
        customer_phone: input.customerPhone,
        products_summary: input.productsSummary,
        link: input.link || null,
        scheduled_for: input.scheduledFor,
      },
      {
        onConflict: "store_id,automation_type,external_reference",
        ignoreDuplicates: true,
      }
    )
    .select("id");

  if (error) throw error;
  return Boolean(data?.length);
}

export async function cancelMessagesForOrder(
  admin: AdminClient,
  input: { storeId: string; externalOrderId: string; sourceToken?: string | null }
): Promise<void> {
  await admin
    .from("automation_messages")
    .update({ status: "cancelled", error_message: null })
    .eq("store_id", input.storeId)
    .eq("automation_type", "post_purchase")
    .eq("external_reference", input.externalOrderId)
    .eq("status", "scheduled");

  if (input.sourceToken) {
    await admin
      .from("automation_messages")
      .update({ status: "cancelled", error_message: null })
      .eq("store_id", input.storeId)
      .eq("automation_type", "abandoned_cart")
      .eq("source_token", input.sourceToken)
      .eq("status", "scheduled");
  }
}

export async function cancelAbandonedCartForOrder(
  admin: AdminClient,
  storeId: string,
  sourceToken?: string | null
): Promise<void> {
  if (!sourceToken) return;
  await admin
    .from("automation_messages")
    .update({ status: "cancelled", error_message: null })
    .eq("store_id", storeId)
    .eq("automation_type", "abandoned_cart")
    .eq("source_token", sourceToken)
    .eq("status", "scheduled");
}

export async function sendScheduledAutomationMessages(
  admin: AdminClient
): Promise<AutomationSendResult> {
  const result: AutomationSendResult = {
    processed: 0,
    sent: 0,
    failed: 0,
    cancelled: 0,
  };

  const { data: jobs, error } = await admin.rpc("claim_automation_messages", {
    p_limit: 50,
  });

  if (error) throw error;
  const claimedJobs = (jobs ?? []) as AutomationJob[];
  if (!claimedJobs.length) return result;

  const storeIds = [...new Set(claimedJobs.map((job) => job.store_id))];
  const [{ data: stores }, { data: settings }] = await Promise.all([
    admin.from("stores").select("id, name").in("id", storeIds),
    admin
      .from("store_settings")
      .select(
        `store_id, abandoned_cart_enabled, abandoned_cart_whatsapp_template,
         post_purchase_enabled, post_purchase_whatsapp_template`
      )
      .in("store_id", storeIds),
  ]);

  const storesById = new Map((stores ?? []).map((store) => [store.id, store]));
  const settingsByStore = new Map(
    (settings ?? []).map((config) => [config.store_id, config])
  );

  for (const job of claimedJobs) {
    result.processed++;
    const store = storesById.get(job.store_id);
    const config = settingsByStore.get(job.store_id);
    const type = job.automation_type as AutomationType;
    const enabled =
      type === "abandoned_cart"
        ? config?.abandoned_cart_enabled
        : config?.post_purchase_enabled;

    if (!store || !config || !enabled) {
      await admin
        .from("automation_messages")
        .update({ status: "cancelled", error_message: "Automação desativada" })
        .eq("id", job.id);
      result.cancelled++;
      continue;
    }

    const template =
      type === "abandoned_cart"
        ? config.abandoned_cart_whatsapp_template ||
          DEFAULT_ABANDONED_CART_WHATSAPP_TEMPLATE
        : config.post_purchase_whatsapp_template ||
          DEFAULT_POST_PURCHASE_WHATSAPP_TEMPLATE;

    const message = replaceTemplate(template, {
      "{{nome}}": firstName(job.customer_name),
      "{{produtos}}": job.products_summary,
      "{{link}}": job.link || "",
      "{{loja}}": store.name,
      "{{pedido}}": job.reference_label || job.external_reference,
    });

    try {
      await sendWhatsApp({ phone: job.customer_phone, message });
      await admin
        .from("automation_messages")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          attempts: job.attempts + 1,
          error_message: null,
        })
        .eq("id", job.id);
      result.sent++;
    } catch (sendError) {
      const attempts = job.attempts + 1;
      await admin
        .from("automation_messages")
        .update({
          status: attempts >= 5 ? "failed" : "scheduled",
          attempts,
          error_message: (sendError as Error).message.slice(0, 1000),
        })
        .eq("id", job.id);
      result.failed++;
    }
  }

  return result;
}

export function summarizeProducts(
  products: Array<{ name?: string | null; quantity?: number | null }>
): string {
  return products
    .filter((product) => product.name)
    .map((product) => {
      const quantity = Math.max(1, Number(product.quantity) || 1);
      return quantity > 1 ? `${quantity}x ${product.name}` : String(product.name);
    })
    .join(", ")
    .slice(0, 500);
}

function replaceTemplate(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (message, [variable, value]) => message.replaceAll(variable, value),
    template
  );
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || "cliente";
}
