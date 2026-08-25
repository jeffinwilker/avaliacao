import { registerWebhook } from "@/lib/nuvemshop";

export const NUVEMSHOP_WEBHOOK_EVENTS = [
  "order/created",
  "order/paid",
  "order/packed",
  "order/fulfilled",
  "order/cancelled",
  "customer/created",
  "customer/updated",
  "customer/deleted",
  "fulfillment_order/status_updated",
  "fulfillment_order/label_status_updated",
  "fulfillment_order/tracking_event_created",
  "fulfillment_order/tracking_event_updated",
] as const;

export const NUVEMSHOP_AUTOMATION_WEBHOOK_EVENTS = NUVEMSHOP_WEBHOOK_EVENTS;

export async function registerAutomationWebhooks(input: {
  storeId: string;
  token: string;
  webhookUrl: string;
}): Promise<PromiseSettledResult<void>[]> {
  return Promise.allSettled(
    NUVEMSHOP_WEBHOOK_EVENTS.map((event) =>
      registerWebhook(input.storeId, input.token, event, input.webhookUrl)
    )
  );
}

