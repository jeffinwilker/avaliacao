import {
  DEFAULT_ABANDONED_CART_WHATSAPP_TEMPLATE,
  DEFAULT_POST_PURCHASE_WHATSAPP_TEMPLATE,
} from "@avaliacoes/shared";
import {
  parseAbandonedCartSequence,
  parsePostSaleSequence,
} from "@/lib/automations";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  AutomationLibrary,
  type ActiveAutomationView,
} from "./AutomationLibrary";

const TRIGGER_LABELS: Record<string, string> = {
  order_created: "Pedido criado",
  order_paid: "Pagamento aprovado",
  order_packed: "Pedido preparado",
  order_fulfilled: "Pedido despachado",
  tracking_in_transit: "Objeto em trânsito",
  tracking_out_for_delivery: "Saiu para entrega",
  tracking_ready_for_pickup: "Disponível para retirada",
  tracking_delivered: "Pedido entregue",
  tracking_delayed: "Entrega atrasada",
  tracking_delivery_attempt_failed: "Tentativa sem sucesso",
};

const AUTOMATION_TITLES: Record<string, string> = {
  order_created: "Confirmação de pedido",
  order_paid: "Pagamento confirmado",
  order_packed: "Pedido separado",
  order_fulfilled: "Envio com rastreio",
  tracking_in_transit: "Atualização de transporte",
  tracking_out_for_delivery: "Saiu para entrega",
  tracking_ready_for_pickup: "Pedido disponível para retirada",
  tracking_delivered: "Confirmação de entrega",
  tracking_delayed: "Aviso de atraso",
  tracking_delivery_attempt_failed: "Tentativa de entrega",
};

export default async function AutomationsPage() {
  const admin = createAdminClient();
  const { data: store } = await admin
    .from("stores")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (!store) {
    return <div className="p-8 text-gray-600">Conecte uma loja primeiro.</div>;
  }

  const { data: settings, error } = await admin
    .from("store_settings")
    .select(
      `abandoned_cart_enabled, abandoned_cart_delay_hours,
       abandoned_cart_whatsapp_template, abandoned_cart_sequence,
       whatsapp_enabled, review_request_delay_minutes,
       post_purchase_enabled, post_purchase_delay_minutes,
       post_purchase_whatsapp_template, post_purchase_attachment_type,
       post_purchase_attachment_url, post_sale_sequence,
       birthday_collection_enabled, birthday_collection_delay_minutes`
    )
    .eq("store_id", store.id)
    .maybeSingle();

  if (error) {
    return (
      <div className="p-8">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          Não foi possível carregar as automações. Confirme se todas as migrations até
          <code className="mx-1 font-mono">0017_birthday_collection.sql</code>
          foram executadas no Supabase.
        </div>
      </div>
    );
  }

  const active: ActiveAutomationView[] = [];
  const abandonedSteps = parseAbandonedCartSequence(
    settings?.abandoned_cart_sequence,
    settings?.abandoned_cart_delay_hours ?? 8,
    settings?.abandoned_cart_whatsapp_template ??
      DEFAULT_ABANDONED_CART_WHATSAPP_TEMPLATE
  );
  if (settings?.abandoned_cart_enabled) {
    active.push({
      id: "abandoned_cart",
      title: "Recuperação de carrinho",
      category: "Carrinho abandonado",
      trigger: "Carrinho abandonado identificado",
      description: `${abandonedSteps.filter((step) => step.enabled).length} mensagem(ns) configurada(s) para recuperar a compra.`,
      href: "/automations/abandoned-carts?section=routines&editor=edit",
      messageCount: abandonedSteps.filter((step) => step.enabled).length,
    });
  }

  const postSaleSteps = parsePostSaleSequence(settings?.post_sale_sequence, {
    enabled: settings?.post_purchase_enabled,
    delayMinutes: settings?.post_purchase_delay_minutes,
    messageTemplate:
      settings?.post_purchase_whatsapp_template ??
      DEFAULT_POST_PURCHASE_WHATSAPP_TEMPLATE,
    attachmentType: settings?.post_purchase_attachment_type,
    attachmentUrl: settings?.post_purchase_attachment_url,
  });
  for (const step of postSaleSteps.filter((item) => item.enabled)) {
    active.push({
      id: step.id,
      title: AUTOMATION_TITLES[step.id] ?? "Mensagem de pós-venda",
      category: "Pós-venda",
      trigger: TRIGGER_LABELS[step.id] ?? step.id,
      description: `Mensagem enviada ${delayLabel(step.delayMinutes)} do gatilho.`,
      href: `/automations/post-sale?section=routines&focus=${step.id}&editor=edit`,
      messageCount: 1,
    });
  }

  if (settings?.birthday_collection_enabled) {
    active.push({
      id: "birthday_collection",
      title: "Coleta de aniversário",
      category: "Relacionamento",
      trigger: "Pedido criado",
      description: `Pede a data de nascimento ${delayLabel(settings.birthday_collection_delay_minutes ?? 1_440)} da compra.`,
      href: "/automations/post-sale?section=routines&focus=birthday_collection&editor=edit",
      messageCount: 1,
    });
  }

  if (settings?.whatsapp_enabled) {
    active.push({
      id: "review_request",
      title: "Pedido de avaliação",
      category: "Avaliações",
      trigger: "Pedido entregue",
      description: `Solicita a avaliação ${delayLabel(settings.review_request_delay_minutes ?? 1_440)} da entrega.`,
      href: "/automations/post-sale?section=routines&focus=review_request&editor=edit",
      messageCount: 1,
    });
  }

  return <AutomationLibrary activeAutomations={active} />;
}

function delayLabel(minutes: number): string {
  if (minutes === 0) return "imediatamente depois";
  if (minutes % 1_440 === 0) {
    const days = minutes / 1_440;
    return `${days} ${days === 1 ? "dia" : "dias"} depois`;
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} ${hours === 1 ? "hora" : "horas"} depois`;
  }
  return `${minutes} minutos depois`;
}
