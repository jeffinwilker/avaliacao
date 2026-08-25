import {
  DEFAULT_BIRTHDAY_COLLECTION_WHATSAPP_TEMPLATE,
  DEFAULT_ABANDONED_CART_SEQUENCE,
  DEFAULT_ABANDONED_CART_WHATSAPP_TEMPLATE,
  DEFAULT_POST_SALE_SEQUENCE,
  DEFAULT_POST_PURCHASE_WHATSAPP_TEMPLATE,
  type AbandonedCartMessageStep,
  type AbandonedCartCouponType,
  type AutomationAttachmentType,
  type PostSaleMessageStep,
  type PostSaleTrigger,
} from "@avaliacoes/shared";
import {
  ensureAbandonedCheckoutCoupon,
  fetchAllAbandonedCheckouts,
} from "@/lib/nuvemshop";
import { sendWhatsApp } from "@/lib/providers/whatsapp";
import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;
type AutomationType = "abandoned_cart" | "post_purchase" | "birthday_collection";

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
  attachmentUrl?: string | null;
  routineStepKey?: string;
  sequenceStep?: number;
  trackingCode?: string | null;
  trackingStatus?: string | null;
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
  source_token: string | null;
  attempts: number;
  routine_step_key: string;
  sequence_step: number;
  attachment_url: string | null;
  coupon_id: number | null;
  coupon_code: string | null;
  coupon_applied_at: string | null;
  tracking_code: string | null;
  tracking_status: string | null;
}

export interface StoredAbandonedCartStep {
  id: string;
  delay_minutes: number;
  message_template: string;
  enabled: boolean;
  active_since: string | null;
  attachment_type: AutomationAttachmentType;
  attachment_url: string | null;
  coupon_enabled: boolean;
  coupon_type: AbandonedCartCouponType;
  coupon_value: number;
  coupon_valid_hours: number;
  coupon_min_price: number | null;
}

export interface StoredPostSaleStep extends PostSaleMessageStep {
  id: PostSaleTrigger;
}

interface ExistingAutomationMessage {
  id: string;
  external_reference: string;
  routine_step_key: string;
  status: string;
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

export interface ManualAbandonedCartSendResult {
  messageId: string;
  status: "sent";
  sentAt: string;
  couponCode: string | null;
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

  const [{ data: stores, error: storesError }, { data: configs, error: configError }] =
    await Promise.all([
      admin
        .from("stores")
        .select("id, external_store_id, access_token")
        .eq("platform", "nuvemshop"),
      admin
        .from("store_settings")
        .select(
          `store_id, abandoned_cart_enabled, abandoned_cart_delay_hours,
           abandoned_cart_whatsapp_template, abandoned_cart_sequence`
        ),
    ]);

  if (storesError) throw storesError;
  if (configError) throw configError;
  const configsByStore = new Map(
    (configs ?? []).map((config) => [config.store_id, config])
  );

  for (const store of stores ?? []) {
    if (!store.access_token) {
      result.errors.push(`Loja ${store.id}: conexão com a Nuvemshop ausente`);
      continue;
    }

    result.stores++;

    try {
      const config = configsByStore.get(store.id);
      const steps = parseAbandonedCartSequence(
        config?.abandoned_cart_sequence,
        config?.abandoned_cart_delay_hours,
        config?.abandoned_cart_whatsapp_template
      );
      const activeSteps = config?.abandoned_cart_enabled
        ? steps.filter((step) => step.enabled)
        : [];
      const checkouts = await fetchAllAbandonedCheckouts(
        store.external_store_id,
        store.access_token
      );
      result.found += checkouts.length;

      const checkoutIds = checkouts.map((checkout) => String(checkout.id));
      const [{ data: knownCarts }, { data: knownMessages }] = await Promise.all([
        checkoutIds.length
          ? admin
              .from("abandoned_carts")
              .select("external_checkout_id, status")
              .eq("store_id", store.id)
              .in("external_checkout_id", checkoutIds)
          : Promise.resolve({ data: [] }),
        admin
          .from("automation_messages")
          .select("id, external_reference, routine_step_key, status")
          .eq("store_id", store.id)
          .eq("automation_type", "abandoned_cart"),
      ]);
      const knownCartStatus = new Map(
        (knownCarts ?? []).map((cart) => [cart.external_checkout_id, cart.status])
      );
      const knownMessageByKey = new Map(
        ((knownMessages ?? []) as ExistingAutomationMessage[]).map((message) => [
          `${message.external_reference}:${message.routine_step_key}`,
          message,
        ])
      );

      const cartRows = checkouts.map((checkout) => {
        const externalId = String(checkout.id);
        const previousStatus = knownCartStatus.get(externalId);
        const status = checkout.completed_at
          ? "completed"
          : previousStatus === "recovered"
          ? "recovered"
          : "abandoned";
        return {
          store_id: store.id,
          external_checkout_id: externalId,
          source_token: checkout.token || null,
          customer_name:
            checkout.contact_name || checkout.shipping_name || "Cliente",
          customer_email: checkout.contact_email || null,
          customer_phone:
            checkout.contact_phone || checkout.shipping_phone || null,
          checkout_url: checkout.abandoned_checkout_url || null,
          products: checkout.products ?? [],
          products_summary: summarizeProducts(checkout.products ?? []),
          subtotal: parseMoney(checkout.subtotal),
          total: parseMoney(checkout.total),
          currency: checkout.currency || "BRL",
          status,
          nuvemshop_created_at: checkout.created_at,
          nuvemshop_updated_at: checkout.updated_at || null,
          completed_at: checkout.completed_at || null,
        };
      });

      for (let i = 0; i < cartRows.length; i += 200) {
        const { error } = await admin.from("abandoned_carts").upsert(
          cartRows.slice(i, i + 200),
          { onConflict: "store_id,external_checkout_id" }
        );
        if (error) throw error;
      }

      const completedIds = cartRows
        .filter((cart) => cart.status !== "abandoned")
        .map((cart) => cart.external_checkout_id);

      for (let i = 0; i < completedIds.length; i += 200) {
        const { data: cancelled } = await admin
          .from("automation_messages")
          .update({ status: "cancelled", error_message: null })
          .eq("store_id", store.id)
          .eq("automation_type", "abandoned_cart")
          .in("status", ["scheduled", "processing"])
          .in("external_reference", completedIds.slice(i, i + 200))
          .select("id");
        result.cancelled += cancelled?.length ?? 0;
      }

      const rows = checkouts
        .filter(
          (checkout) =>
            !checkout.completed_at &&
            knownCartStatus.get(String(checkout.id)) !== "recovered"
        )
        .flatMap((checkout) => {
          const phone = checkout.contact_phone || checkout.shipping_phone;
          const productsSummary = summarizeProducts(checkout.products);
          if (!phone || !checkout.abandoned_checkout_url || !productsSummary) return [];

          const createdAt = new Date(checkout.created_at).getTime();
          const baseTime = Number.isFinite(createdAt) ? createdAt : Date.now();
          return activeSteps.flatMap((step, index) => {
            const activeSince = step.active_since
              ? new Date(step.active_since).getTime()
              : NaN;
            if (Number.isFinite(activeSince) && baseTime < activeSince) {
              return [];
            }

            const messageKey = `${checkout.id}:${step.id}`;
            const existing = knownMessageByKey.get(messageKey);
            if (
              existing &&
              ["sent", "processing", "failed"].includes(existing.status)
            ) {
              return [];
            }

            const attachmentUrl = resolveCartAttachmentUrl(
              step,
              checkout.products
            );

            return [{
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
              routine_step_key: step.id,
              sequence_step: index + 1,
              status: "scheduled" as const,
              error_message: null,
              attachment_type: attachmentUrl ? "image" : "none",
              attachment_url: attachmentUrl,
              scheduled_for: new Date(
                baseTime + step.delay_minutes * 60_000
              ).toISOString(),
            }];
          });
        })
        .filter(Boolean);

      result.eligible += new Set(rows.map((row) => row.external_reference)).size;

      for (let i = 0; i < rows.length; i += 200) {
        const { data: inserted, error } = await admin
          .from("automation_messages")
          .upsert(rows.slice(i, i + 200), {
            onConflict:
              "store_id,automation_type,external_reference,routine_step_key",
          })
          .select("id");
        if (error) throw error;
        result.queued += inserted?.length ?? 0;
      }

      const activeStepIds = new Set(activeSteps.map((step) => step.id));
      const removedMessageIds = ((knownMessages ?? []) as ExistingAutomationMessage[])
        .filter(
          (message) =>
            message.status === "scheduled" &&
            !activeStepIds.has(message.routine_step_key)
        )
        .map((message) => message.id);
      for (let i = 0; i < removedMessageIds.length; i += 200) {
        const { data: cancelled } = await admin
          .from("automation_messages")
          .update({ status: "cancelled", error_message: "Etapa removida ou desativada" })
          .in("id", removedMessageIds.slice(i, i + 200))
          .select("id");
        result.cancelled += cancelled?.length ?? 0;
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
        routine_step_key: input.routineStepKey || "order_created",
        sequence_step: input.sequenceStep || 1,
        scheduled_for: input.scheduledFor,
        attachment_type: input.attachmentUrl ? "image" : "none",
        attachment_url: input.attachmentUrl || null,
        tracking_code: input.trackingCode || null,
        tracking_status: input.trackingStatus || null,
      },
      {
        onConflict:
          "store_id,automation_type,external_reference,routine_step_key",
        ignoreDuplicates: true,
      }
    )
    .select("id");

  if (error) throw error;
  return Boolean(data?.length);
}

export async function queueBirthdayCollectionMessage(
  admin: AdminClient,
  input: {
    storeId: string;
    customerId: string;
    orderId?: string | null;
    externalOrderId?: string | null;
    referenceLabel?: string | null;
    customerName: string;
    customerPhone: string;
    productsSummary: string;
    scheduledFor: string;
  }
): Promise<boolean> {
  const phone = input.customerPhone.trim();
  if (!phone) return false;

  const { data: customer, error: customerError } = await admin
    .from("customers")
    .select("id, birth_date, active, accepts_marketing")
    .eq("store_id", input.storeId)
    .eq("id", input.customerId)
    .maybeSingle();
  if (customerError) throw customerError;
  if (!customer || customer.birth_date || customer.active === false) return false;
  if (customer.accepts_marketing === false) return false;

  const { data: existingRequest, error: existingError } = await admin
    .from("customer_birthdate_requests")
    .select("id, token, status")
    .eq("store_id", input.storeId)
    .eq("customer_id", input.customerId)
    .eq("status", "pending")
    .maybeSingle();
  if (existingError) throw existingError;

  let request = existingRequest;
  if (!request) {
    const { data: inserted, error: insertError } = await admin
      .from("customer_birthdate_requests")
      .insert({
        store_id: input.storeId,
        customer_id: input.customerId,
        order_id: input.orderId || null,
        external_order_id: input.externalOrderId || null,
        status: "pending",
        scheduled_for: input.scheduledFor,
        expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select("id, token, status")
      .single();

    if (insertError) {
      if (insertError.code !== "23505") throw insertError;
      const { data: retried, error: retryError } = await admin
        .from("customer_birthdate_requests")
        .select("id, token, status")
        .eq("store_id", input.storeId)
        .eq("customer_id", input.customerId)
        .eq("status", "pending")
        .maybeSingle();
      if (retryError) throw retryError;
      request = retried;
    } else {
      request = inserted;
    }
  }

  if (!request?.token) return false;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const link = `${appUrl.replace(/\/$/, "")}/cliente/aniversario/${encodeURIComponent(
    request.token
  )}`;
  const { data, error } = await admin
    .from("automation_messages")
    .upsert(
      {
        store_id: input.storeId,
        automation_type: "birthday_collection",
        external_reference: input.customerId,
        reference_label:
          input.referenceLabel || input.externalOrderId || input.customerName,
        source_token: request.token,
        customer_name: input.customerName || "Cliente",
        customer_phone: phone,
        products_summary: input.productsSummary || "sua compra",
        link,
        routine_step_key: "collect_birthday",
        sequence_step: 1,
        scheduled_for: input.scheduledFor,
        attachment_type: "none",
        attachment_url: null,
        error_message: null,
      },
      {
        onConflict:
          "store_id,automation_type,external_reference,routine_step_key",
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
    .in("status", ["scheduled", "processing"]);

  if (input.sourceToken) {
    await admin
      .from("automation_messages")
      .update({ status: "cancelled", error_message: null })
      .eq("store_id", input.storeId)
      .eq("automation_type", "abandoned_cart")
      .eq("source_token", input.sourceToken)
      .in("status", ["scheduled", "processing"]);
  }
}

export async function cancelAbandonedCartForOrder(
  admin: AdminClient,
  storeId: string,
  sourceToken?: string | null
): Promise<void> {
  if (!sourceToken) return;
  await Promise.all([
    admin
      .from("automation_messages")
      .update({ status: "cancelled", error_message: null })
      .eq("store_id", storeId)
      .eq("automation_type", "abandoned_cart")
      .eq("source_token", sourceToken)
      .in("status", ["scheduled", "processing"]),
    admin
      .from("abandoned_carts")
      .update({ status: "recovered", completed_at: new Date().toISOString() })
      .eq("store_id", storeId)
      .eq("source_token", sourceToken)
      .eq("status", "abandoned"),
  ]);
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
  const [{ data: stores }, { data: settings }, { data: birthdaySettings }] =
    await Promise.all([
    admin
      .from("stores")
      .select("id, name, external_store_id, access_token")
      .in("id", storeIds),
    admin
      .from("store_settings")
      .select(
        `store_id, abandoned_cart_enabled, abandoned_cart_delay_hours,
         abandoned_cart_whatsapp_template, abandoned_cart_sequence,
         post_purchase_enabled, post_purchase_whatsapp_template,
         post_purchase_delay_minutes, post_purchase_attachment_type,
         post_purchase_attachment_url, post_sale_sequence,
         whatsapp_instance`
      )
      .in("store_id", storeIds),
    admin
      .from("store_settings")
      .select(
        "store_id, birthday_collection_enabled, birthday_collection_whatsapp_template"
      )
      .in("store_id", storeIds),
  ]);

  const storesById = new Map((stores ?? []).map((store) => [store.id, store]));
  const settingsByStore = new Map(
    (settings ?? []).map((config) => [config.store_id, config])
  );
  const birthdaySettingsByStore = new Map(
    (birthdaySettings ?? []).map((config) => [config.store_id, config])
  );

  for (const job of claimedJobs) {
    result.processed++;
    const store = storesById.get(job.store_id);
    const config = settingsByStore.get(job.store_id);
    const birthdayConfig = birthdaySettingsByStore.get(job.store_id);
    const type = job.automation_type as AutomationType;
    const abandonedStep =
      type === "abandoned_cart" && config
        ? parseAbandonedCartSequence(
            config.abandoned_cart_sequence,
            config.abandoned_cart_delay_hours,
            config.abandoned_cart_whatsapp_template
          ).find((step) => step.id === job.routine_step_key)
        : null;
    const postSaleStep =
      type === "post_purchase" && config
        ? parsePostSaleSequence(config.post_sale_sequence, {
            enabled: config.post_purchase_enabled,
            delayMinutes: config.post_purchase_delay_minutes,
            messageTemplate: config.post_purchase_whatsapp_template,
            attachmentType: config.post_purchase_attachment_type,
            attachmentUrl: config.post_purchase_attachment_url,
          }).find(
            (step) =>
              step.id ===
              (job.routine_step_key === "default"
                ? "order_created"
                : job.routine_step_key)
          )
        : null;
    const enabled =
      type === "abandoned_cart"
        ? config?.abandoned_cart_enabled && abandonedStep?.enabled
        : type === "birthday_collection"
          ? birthdayConfig?.birthday_collection_enabled && Boolean(job.link)
        : postSaleStep?.enabled;

    if (!store || !config || !enabled) {
      await admin
        .from("automation_messages")
        .update({ status: "cancelled", error_message: "Automação desativada" })
        .eq("id", job.id);
      result.cancelled++;
      continue;
    }

    if (
      type === "abandoned_cart" &&
      !(await abandonedCartStillOpen(
        admin,
        job.store_id,
        job.external_reference
      ))
    ) {
      await admin
        .from("automation_messages")
        .update({
          status: "cancelled",
          error_message: "Pedido já foi fechado",
        })
        .eq("id", job.id);
      result.cancelled++;
      continue;
    }

    if (
      type === "birthday_collection" &&
      !(await birthdayCollectionStillPending(
        admin,
        job.store_id,
        job.external_reference,
        job.source_token
      ))
    ) {
      await admin
        .from("automation_messages")
        .update({
          status: "cancelled",
          error_message: "Aniversário já preenchido ou convite indisponível",
        })
        .eq("id", job.id);
      result.cancelled++;
      continue;
    }

    const template =
      type === "abandoned_cart"
        ? abandonedStep?.message_template ||
          config.abandoned_cart_whatsapp_template ||
          DEFAULT_ABANDONED_CART_WHATSAPP_TEMPLATE
        : type === "birthday_collection"
          ? birthdayConfig?.birthday_collection_whatsapp_template ||
            DEFAULT_BIRTHDAY_COLLECTION_WHATSAPP_TEMPLATE
        : postSaleStep?.messageTemplate ||
          config.post_purchase_whatsapp_template ||
          DEFAULT_POST_PURCHASE_WHATSAPP_TEMPLATE;

    try {
      let couponCode =
        type === "abandoned_cart" && abandonedStep?.coupon_enabled
          ? job.coupon_code || ""
          : "";
      if (type === "abandoned_cart" && abandonedStep?.coupon_enabled) {
        if (!store.access_token) {
          throw new Error("Conexão com a Nuvemshop ausente para criar o cupom");
        }
        if (!couponCode || !job.coupon_applied_at) {
          const coupon = await ensureAbandonedCheckoutCoupon(
            store.external_store_id,
            store.access_token,
            job.external_reference,
            {
              code: automaticCouponCode(job.id),
              type: abandonedStep.coupon_type,
              value: abandonedStep.coupon_value,
              validHours: abandonedStep.coupon_valid_hours,
              minPrice: abandonedStep.coupon_min_price,
            }
          );
          couponCode = coupon.code;
          await admin
            .from("automation_messages")
            .update({
              coupon_id: coupon.id,
              coupon_code: coupon.code,
              coupon_applied_at: new Date().toISOString(),
            })
            .eq("id", job.id);
        }
      }

      const couponTemplate =
        couponCode && !template.includes("{{cupom}}")
          ? `${template}\n\nUse o cupom *{{cupom}}* no seu carrinho.`
          : template;
      const preparedTemplate = removeUnavailableTrackingLines(
        couponTemplate,
        job.tracking_code,
        job.link
      );
      const message = replaceTemplate(preparedTemplate, {
        "{{nome}}": firstName(job.customer_name),
        "{{produtos}}": job.products_summary,
        "{{link}}": job.link || "",
        "{{loja}}": store.name,
        "{{pedido}}": job.reference_label || job.external_reference,
        "{{cupom}}": couponCode,
        "{{codigo_rastreio}}": job.tracking_code || "",
        "{{link_rastreio}}": job.link || "",
        "{{status_entrega}}": trackingStatusLabel(job.tracking_status),
        "{{desconto}}": abandonedStep
          ? couponDiscountLabel(abandonedStep)
          : "",
      });

      // Repete a condição imediatamente antes do envio para cobrir o caso de o
      // checkout ser finalizado enquanto o cupom e a mensagem eram preparados.
      if (
        type === "abandoned_cart" &&
        !(await abandonedCartStillOpen(
          admin,
          job.store_id,
          job.external_reference
        ))
      ) {
        await admin
          .from("automation_messages")
          .update({
            status: "cancelled",
            error_message: "Pedido fechado antes do envio",
          })
          .eq("id", job.id);
        result.cancelled++;
        continue;
      }

      await sendWhatsApp({
        phone: job.customer_phone,
        message,
        instance: config.whatsapp_instance,
        mediaUrl: job.attachment_url,
      });
      await admin
        .from("automation_messages")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          attempts: job.attempts + 1,
          error_message: null,
        })
        .eq("id", job.id);
      if (type === "birthday_collection" && job.source_token) {
        await admin
          .from("customer_birthdate_requests")
          .update({ sent_at: new Date().toISOString() })
          .eq("token", job.source_token)
          .eq("status", "pending");
      }
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

async function abandonedCartStillOpen(
  admin: AdminClient,
  storeId: string,
  externalReference: string
): Promise<boolean> {
  const { data, error } = await admin
    .from("abandoned_carts")
    .select("status")
    .eq("store_id", storeId)
    .eq("external_checkout_id", externalReference)
    .maybeSingle();
  if (error) throw error;
  return data?.status === "abandoned";
}

async function birthdayCollectionStillPending(
  admin: AdminClient,
  storeId: string,
  customerId: string,
  token: string | null
): Promise<boolean> {
  if (!token) return false;

  const [{ data: request, error: requestError }, { data: customer, error: customerError }] =
    await Promise.all([
      admin
        .from("customer_birthdate_requests")
        .select("id, status, expires_at")
        .eq("store_id", storeId)
        .eq("customer_id", customerId)
        .eq("token", token)
        .maybeSingle(),
      admin
        .from("customers")
        .select("birth_date, active, accepts_marketing")
        .eq("store_id", storeId)
        .eq("id", customerId)
        .maybeSingle(),
    ]);

  if (requestError) throw requestError;
  if (customerError) throw customerError;
  if (!request || request.status !== "pending") return false;
  if (!customer || customer.birth_date || customer.active === false) return false;
  if (customer.accepts_marketing === false) return false;
  if (request.expires_at && Date.parse(request.expires_at) < Date.now()) {
    await admin
      .from("customer_birthdate_requests")
      .update({ status: "expired" })
      .eq("id", request.id);
    return false;
  }
  return true;
}

/**
 * Envia uma etapa da rotina imediatamente, sem aplicar o corte active_since.
 * Assim o lojista pode recuperar carrinhos antigos e repetir uma tentativa que
 * falhou, mantendo o resultado na mesma linha do tempo da automação.
 */
export async function sendManualAbandonedCartMessage(
  admin: AdminClient,
  input: { storeId: string; externalCheckoutId: string; stepId: string }
): Promise<ManualAbandonedCartSendResult> {
  const [{ data: store, error: storeError }, { data: config, error: configError }, { data: cart, error: cartError }] =
    await Promise.all([
      admin
        .from("stores")
        .select("id, name, external_store_id, access_token")
        .eq("id", input.storeId)
        .maybeSingle(),
      admin
        .from("store_settings")
        .select(
          `store_id, abandoned_cart_delay_hours, abandoned_cart_whatsapp_template,
           abandoned_cart_sequence, whatsapp_instance`
        )
        .eq("store_id", input.storeId)
        .maybeSingle(),
      admin
        .from("abandoned_carts")
        .select(
          `external_checkout_id, source_token, customer_name, customer_phone,
           checkout_url, products, products_summary, status`
        )
        .eq("store_id", input.storeId)
        .eq("external_checkout_id", input.externalCheckoutId)
        .maybeSingle(),
    ]);

  if (storeError) throw storeError;
  if (configError) throw configError;
  if (cartError) throw cartError;
  if (!store || !config || !cart) throw new Error("Carrinho não encontrado");
  if (cart.status !== "abandoned") {
    throw new Error("Este carrinho já virou pedido e não pode receber a mensagem");
  }
  if (!cart.customer_phone) {
    throw new Error("O cliente não informou um número de WhatsApp");
  }
  if (!cart.checkout_url) {
    throw new Error("O link deste carrinho não está mais disponível");
  }

  const steps = parseAbandonedCartSequence(
    config.abandoned_cart_sequence,
    config.abandoned_cart_delay_hours,
    config.abandoned_cart_whatsapp_template
  );
  const stepIndex = steps.findIndex((step) => step.id === input.stepId);
  const step = steps[stepIndex];
  if (!step) throw new Error("Mensagem da rotina não encontrada");

  const attachmentUrl = resolveCartAttachmentUrl(
    step,
    Array.isArray(cart.products) ? cart.products : []
  );
  const startedAt = new Date().toISOString();
  const { data: job, error: jobError } = await admin
    .from("automation_messages")
    .upsert(
      {
        store_id: input.storeId,
        automation_type: "abandoned_cart",
        external_reference: cart.external_checkout_id,
        reference_label: cart.external_checkout_id,
        source_token: cart.source_token || null,
        customer_name: cart.customer_name || "Cliente",
        customer_phone: cart.customer_phone,
        products_summary: cart.products_summary || "seus produtos",
        link: cart.checkout_url,
        routine_step_key: step.id,
        sequence_step: stepIndex + 1,
        status: "processing",
        scheduled_for: startedAt,
        sent_at: null,
        attempts: 0,
        error_message: null,
        attachment_type: attachmentUrl ? "image" : "none",
        attachment_url: attachmentUrl,
      },
      {
        onConflict:
          "store_id,automation_type,external_reference,routine_step_key",
      }
    )
    .select("id, coupon_code, coupon_applied_at")
    .single();

  if (jobError) throw jobError;

  try {
    let couponCode = step.coupon_enabled ? job.coupon_code || "" : "";
    if (step.coupon_enabled && (!couponCode || !job.coupon_applied_at)) {
      if (!store.access_token) {
        throw new Error("Conexão com a Nuvemshop ausente para criar o cupom");
      }
      const coupon = await ensureAbandonedCheckoutCoupon(
        store.external_store_id,
        store.access_token,
        cart.external_checkout_id,
        {
          code: automaticCouponCode(job.id),
          type: step.coupon_type,
          value: step.coupon_value,
          validHours: step.coupon_valid_hours,
          minPrice: step.coupon_min_price,
        }
      );
      couponCode = coupon.code;
      await admin
        .from("automation_messages")
        .update({
          coupon_id: coupon.id,
          coupon_code: coupon.code,
          coupon_applied_at: new Date().toISOString(),
        })
        .eq("id", job.id);
    }

    const couponTemplate =
      couponCode && !step.message_template.includes("{{cupom}}")
        ? `${step.message_template}\n\nUse o cupom *{{cupom}}* no seu carrinho.`
        : step.message_template;
    const message = replaceTemplate(couponTemplate, {
      "{{nome}}": firstName(cart.customer_name || "Cliente"),
      "{{produtos}}": cart.products_summary || "seus produtos",
      "{{link}}": cart.checkout_url,
      "{{loja}}": store.name,
      "{{pedido}}": cart.external_checkout_id,
      "{{cupom}}": couponCode,
      "{{desconto}}": couponDiscountLabel(step),
    });

    if (!(await abandonedCartStillOpen(admin, input.storeId, input.externalCheckoutId))) {
      throw new Error("O pedido foi fechado antes do envio");
    }

    await sendWhatsApp({
      phone: cart.customer_phone,
      message,
      instance: config.whatsapp_instance,
      mediaUrl: attachmentUrl,
    });
    const sentAt = new Date().toISOString();
    const { error: updateError } = await admin
      .from("automation_messages")
      .update({
        status: "sent",
        sent_at: sentAt,
        attempts: 1,
        error_message: null,
      })
      .eq("id", job.id);
    if (updateError) throw updateError;

    return {
      messageId: job.id,
      status: "sent",
      sentAt,
      couponCode: couponCode || null,
    };
  } catch (error) {
    await admin
      .from("automation_messages")
      .update({
        status: "failed",
        sent_at: null,
        attempts: 1,
        error_message: (error as Error).message.slice(0, 1000),
      })
      .eq("id", job.id);
    throw error;
  }
}

export function parsePostSaleSequence(
  value: unknown,
  legacy?: {
    enabled?: boolean | null;
    delayMinutes?: number | null;
    messageTemplate?: string | null;
    attachmentType?: AutomationAttachmentType | null;
    attachmentUrl?: string | null;
  }
): StoredPostSaleStep[] {
  const rawSteps = Array.isArray(value) ? value : [];
  const candidates = new Map<string, Record<string, unknown>>();
  for (const raw of rawSteps) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const candidate = raw as Record<string, unknown>;
    if (typeof candidate.id === "string") candidates.set(candidate.id, candidate);
  }

  return DEFAULT_POST_SALE_SEQUENCE.map((defaultStep) => {
    const candidate = candidates.get(defaultStep.id);
    const isLegacyConfirmation = defaultStep.id === "order_created" && !candidate;
    const delay = Number(
      candidate?.delay_minutes ??
        candidate?.delayMinutes ??
        (isLegacyConfirmation ? legacy?.delayMinutes : defaultStep.delayMinutes)
    );
    const messageTemplate = String(
      candidate?.message_template ??
        candidate?.messageTemplate ??
        (isLegacyConfirmation ? legacy?.messageTemplate : null) ??
        defaultStep.messageTemplate
    ).trim();
    const attachmentType = parseAttachmentType(
      candidate?.attachment_type ??
        candidate?.attachmentType ??
        (isLegacyConfirmation ? legacy?.attachmentType : defaultStep.attachmentType)
    );
    const attachmentUrlValue =
      candidate?.attachment_url ??
      candidate?.attachmentUrl ??
      (isLegacyConfirmation ? legacy?.attachmentUrl : defaultStep.attachmentUrl);

    return {
      id: defaultStep.id,
      delayMinutes: Number.isInteger(delay)
        ? Math.max(0, Math.min(43_200, delay))
        : defaultStep.delayMinutes,
      messageTemplate: messageTemplate.slice(0, 4000) || defaultStep.messageTemplate,
      enabled:
        typeof candidate?.enabled === "boolean"
          ? candidate.enabled
          : isLegacyConfirmation
            ? legacy?.enabled === true
            : defaultStep.enabled,
      attachmentType,
      attachmentUrl:
        attachmentType === "library" &&
        typeof attachmentUrlValue === "string" &&
        /^https:\/\//i.test(attachmentUrlValue)
          ? attachmentUrlValue
          : null,
    };
  });
}

function parseAttachmentType(value: unknown): AutomationAttachmentType {
  return value === "product_image" || value === "library" ? value : "none";
}

function trackingStatusLabel(status: string | null): string {
  const labels: Record<string, string> = {
    dispatched: "Postado",
    received_by_post_office: "Recebido pela transportadora",
    in_transit: "Em trânsito",
    out_for_delivery: "Saiu para entrega",
    delivery_attempt_failed: "Tentativa de entrega",
    delayed: "Entrega atrasada",
    ready_for_pickup: "Disponível para retirada",
    delivered: "Entregue",
    returned_to_sender: "Devolvido ao remetente",
    lost: "Objeto extraviado",
  };
  return status ? labels[status.toLowerCase()] || status : "";
}

function removeUnavailableTrackingLines(
  template: string,
  trackingCode: string | null,
  trackingUrl: string | null
): string {
  return template
    .split("\n")
    .filter(
      (line) =>
        (trackingCode || !line.includes("{{codigo_rastreio}}")) &&
        (trackingUrl || !line.includes("{{link_rastreio}}"))
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function parseAbandonedCartSequence(
  value: unknown,
  fallbackDelay = 8,
  fallbackTemplate = DEFAULT_ABANDONED_CART_WHATSAPP_TEMPLATE
): StoredAbandonedCartStep[] {
  const rawSteps = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  const parsed = rawSteps.flatMap((raw, index) => {
    if (!raw || typeof raw !== "object") return [];
    const candidate = raw as Record<string, unknown>;
    const rawId = String(candidate.id || `step-${index + 1}`);
    const id = /^[a-zA-Z0-9_-]{1,80}$/.test(rawId)
      ? rawId
      : `step-${index + 1}`;
    if (seen.has(id)) return [];
    seen.add(id);

    const explicitMinutes = candidate.delay_minutes ?? candidate.delayMinutes;
    const legacyHours = candidate.delay_hours ?? candidate.delayHours;
    const delayMinutes =
      explicitMinutes != null
        ? Number(explicitMinutes)
        : Number(legacyHours) * 60;
    const template = String(
      candidate.message_template ?? candidate.messageTemplate ?? ""
    ).trim();
    const attachmentType: AutomationAttachmentType =
      candidate.attachment_type === "product_image" ||
      candidate.attachmentType === "product_image"
        ? "product_image"
        : candidate.attachment_type === "library" ||
            candidate.attachmentType === "library"
          ? "library"
          : "none";
    const rawAttachmentUrl = candidate.attachment_url ?? candidate.attachmentUrl;
    const attachmentUrl =
      typeof rawAttachmentUrl === "string" && /^https:\/\//i.test(rawAttachmentUrl)
        ? rawAttachmentUrl
        : null;
    const couponEnabled =
      candidate.coupon_enabled === true || candidate.couponEnabled === true;
    const couponType: AbandonedCartCouponType =
      candidate.coupon_type === "absolute" || candidate.couponType === "absolute"
        ? "absolute"
        : candidate.coupon_type === "shipping" || candidate.couponType === "shipping"
          ? "shipping"
          : "percentage";
    const couponValue = Number(
      candidate.coupon_value ?? candidate.couponValue ?? 10
    );
    const couponValidHours = Number(
      candidate.coupon_valid_hours ?? candidate.couponValidHours ?? 48
    );
    const rawCouponMinPrice =
      candidate.coupon_min_price ?? candidate.couponMinPrice;
    const couponMinPrice =
      rawCouponMinPrice == null || rawCouponMinPrice === ""
        ? null
        : Number(rawCouponMinPrice);
    if (
      !Number.isFinite(delayMinutes) ||
      delayMinutes < 10 ||
      delayMinutes > 43_200 ||
      !template
      || (attachmentType === "library" && !attachmentUrl) ||
      (couponEnabled && couponType !== "shipping" && (
        !Number.isFinite(couponValue) || couponValue <= 0 ||
        (couponType === "percentage" && couponValue > 100)
      )) ||
      (couponEnabled && (
        !Number.isFinite(couponValidHours) ||
        couponValidHours < 1 || couponValidHours > 720
      )) ||
      (couponMinPrice != null && (
        !Number.isFinite(couponMinPrice) || couponMinPrice < 0
      ))
    ) {
      return [];
    }

    return [{
      id,
      delay_minutes: Math.round(delayMinutes),
      message_template: template.slice(0, 4000),
      enabled: candidate.enabled !== false,
      attachment_type: attachmentType,
      attachment_url: attachmentType === "library" ? attachmentUrl : null,
      coupon_enabled: couponEnabled,
      coupon_type: couponType,
      coupon_value: couponType === "shipping" ? 0 : couponValue,
      coupon_valid_hours: Math.round(couponValidHours),
      coupon_min_price: couponMinPrice,
      active_since:
        typeof candidate.active_since === "string"
          ? candidate.active_since
          : typeof candidate.activeSince === "string"
            ? candidate.activeSince
            : null,
    }];
  });

  if (parsed.length) {
    return parsed
      .slice(0, 5)
      .sort((a, b) => a.delay_minutes - b.delay_minutes);
  }

  const fallback = DEFAULT_ABANDONED_CART_SEQUENCE[0];
  return [{
    id: fallback.id,
    delay_minutes: Math.max(
      10,
      Math.min(43_200, Math.round((fallbackDelay || 8) * 60))
    ),
    message_template: fallbackTemplate || fallback.messageTemplate,
    enabled: true,
    attachment_type: fallback.attachmentType,
    attachment_url: fallback.attachmentUrl,
    coupon_enabled: fallback.couponEnabled,
    coupon_type: fallback.couponType,
    coupon_value: fallback.couponValue,
    coupon_valid_hours: fallback.couponValidHours,
    coupon_min_price: fallback.couponMinPrice,
    active_since: null,
  }];
}

export function serializeAbandonedCartSequence(
  steps: AbandonedCartMessageStep[]
): StoredAbandonedCartStep[] {
  return parseAbandonedCartSequence(steps);
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

function parseMoney(value: string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveCartAttachmentUrl(
  step: StoredAbandonedCartStep,
  products: Array<{ image?: { src?: string | null } | null }>
): string | null {
  if (step.attachment_type === "library") return step.attachment_url;
  if (step.attachment_type === "product_image") {
    return products.find((product) => product.image?.src)?.image?.src || null;
  }
  return null;
}

function automaticCouponCode(jobId: string): string {
  const uniqueSuffix = jobId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8);
  return `CAR${uniqueSuffix}`.toUpperCase();
}

function couponDiscountLabel(step: StoredAbandonedCartStep): string {
  if (!step.coupon_enabled) return "";
  if (step.coupon_type === "shipping") return "frete grátis";
  if (step.coupon_type === "percentage") {
    return `${formatNumber(step.coupon_value)}% de desconto`;
  }
  return `${new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(step.coupon_value)} de desconto`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value);
}
