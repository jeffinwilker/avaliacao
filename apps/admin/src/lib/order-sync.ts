import {
  fetchRecentOrders,
  type NuvemshopFulfillmentOrder,
  type NuvemshopOrder,
} from "@/lib/nuvemshop";
import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

interface ExistingOrder {
  id: string;
  external_order_id: string;
  delivered_at: string | null;
  fulfillment_status: string | null;
  tracking_status: string | null;
  shipping_tracking_number: string | null;
  shipping_tracking_url: string | null;
  tracking_updated_at: string | null;
}

export async function syncRecentOrders(
  admin: AdminClient,
  options: { days?: number; maxOrders?: number } = {}
): Promise<{
  found: number;
  synced: number;
  delivered: number;
  productsLinked: number;
}> {
  const { data: store } = await admin
    .from("stores")
    .select("id, external_store_id, access_token")
    .eq("platform", "nuvemshop")
    .not("access_token", "is", null)
    .maybeSingle();
  if (!store?.access_token) throw new Error("Loja não conectada");

  const remoteOrders = await fetchRecentOrders(
    store.external_store_id,
    store.access_token,
    options
  );
  if (!remoteOrders.length) {
    return { found: 0, synced: 0, delivered: 0, productsLinked: 0 };
  }

  const externalOrderIds = remoteOrders.map((order) => String(order.id));
  const existingOrders = await selectInChunks<ExistingOrder>(
    admin,
    "orders",
    `id, external_order_id, delivered_at, fulfillment_status, tracking_status,
     shipping_tracking_number, shipping_tracking_url, tracking_updated_at`,
    "external_order_id",
    externalOrderIds,
    { store_id: store.id }
  );
  const existingByExternalId = new Map(
    existingOrders.map((order) => [order.external_order_id, order])
  );

  const orderRows = remoteOrders.map((order) => {
    const externalOrderId = String(order.id);
    const existing = existingByExternalId.get(externalOrderId);
    const delivery = deliveryDetails(order);
    return {
      store_id: store.id,
      external_order_id: externalOrderId,
      customer_name: order.customer?.name || order.contact_name || "Cliente",
      customer_email: order.customer?.email || order.contact_email || null,
      customer_phone: order.customer?.phone || order.contact_phone || null,
      status:
        order.status === "cancelled"
          ? "cancelled"
          : delivery.delivered
            ? "delivered"
            : order.status || "open",
      payment_status: order.payment_status || null,
      shipping_status: order.shipping_status || null,
      fulfillment_status:
        delivery.fulfillmentStatus || existing?.fulfillment_status || null,
      tracking_status: delivery.trackingStatus || existing?.tracking_status || null,
      shipping_tracking_number:
        delivery.trackingNumber || existing?.shipping_tracking_number || null,
      shipping_tracking_url:
        delivery.trackingUrl || existing?.shipping_tracking_url || null,
      tracking_updated_at:
        delivery.trackingStatus || delivery.trackingNumber
          ? order.updated_at || new Date().toISOString()
          : existing?.tracking_updated_at || null,
      ordered_at: order.created_at,
      delivered_at: delivery.delivered
        ? delivery.deliveredAt ||
          existing?.delivered_at ||
          order.updated_at ||
          new Date().toISOString()
        : existing?.delivered_at || null,
    };
  });

  for (const rows of chunks(orderRows, 200)) {
    const { error } = await admin
      .from("orders")
      .upsert(rows, { onConflict: "store_id,external_order_id" });
    if (error) throw new Error(error.message);
  }

  const productSeeds = collectProductSeeds(remoteOrders);
  const externalProductIds = [...productSeeds.keys()];
  const products = await selectInChunks<{
    id: string;
    external_product_id: string;
  }>(
    admin,
    "products",
    "id, external_product_id",
    "external_product_id",
    externalProductIds,
    { store_id: store.id }
  );
  const productByExternalId = new Map(
    products.map((product) => [product.external_product_id, product.id])
  );

  const missingProducts = [...productSeeds.entries()]
    .filter(([externalId]) => !productByExternalId.has(externalId))
    .map(([externalId, product]) => ({
      store_id: store.id,
      external_product_id: externalId,
      name: product.name,
      image_url: product.imageUrl,
    }));
  for (const rows of chunks(missingProducts, 200)) {
    if (!rows.length) continue;
    const { data, error } = await admin
      .from("products")
      .upsert(rows, {
        onConflict: "store_id,external_product_id",
        ignoreDuplicates: true,
      })
      .select("id, external_product_id");
    if (error) throw new Error(error.message);
    for (const product of data ?? []) {
      productByExternalId.set(product.external_product_id, product.id);
    }
  }

  const savedOrders = await selectInChunks<{
    id: string;
    external_order_id: string;
  }>(
    admin,
    "orders",
    "id, external_order_id",
    "external_order_id",
    externalOrderIds,
    { store_id: store.id }
  );
  const orderByExternalId = new Map(
    savedOrders.map((order) => [order.external_order_id, order.id])
  );
  const itemQuantities = new Map<
    string,
    { order_id: string; product_id: string; quantity: number }
  >();
  for (const order of remoteOrders) {
    const orderId = orderByExternalId.get(String(order.id));
    if (!orderId) continue;
    for (const item of order.products ?? []) {
      const productId = productByExternalId.get(String(item.product_id));
      if (!productId) continue;
      const key = `${orderId}:${productId}`;
      const current = itemQuantities.get(key);
      itemQuantities.set(key, {
        order_id: orderId,
        product_id: productId,
        quantity: (current?.quantity ?? 0) + Math.max(1, Number(item.quantity) || 1),
      });
    }
  }
  const orderItems = [...itemQuantities.values()];
  for (const rows of chunks(orderItems, 300)) {
    const { error } = await admin
      .from("order_items")
      .upsert(rows, { onConflict: "order_id,product_id" });
    if (error) throw new Error(error.message);
  }

  return {
    found: remoteOrders.length,
    synced: savedOrders.length,
    delivered: orderRows.filter((order) => Boolean(order.delivered_at)).length,
    productsLinked: orderItems.length,
  };
}

function deliveryDetails(order: NuvemshopOrder): {
  delivered: boolean;
  deliveredAt: string | null;
  fulfillmentStatus: string | null;
  trackingStatus: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
} {
  const fulfillment =
    order.fulfillments?.find((item) => item.status?.toUpperCase() === "DELIVERED") ||
    order.fulfillments?.[0] ||
    null;
  const event = latestTrackingEvent(fulfillment);
  const fulfillmentStatus = fulfillment?.status?.toUpperCase() || null;
  const trackingStatus = event?.status?.toLowerCase() || null;
  const delivered =
    order.shipping_status?.toLowerCase() === "delivered" ||
    fulfillmentStatus === "DELIVERED" ||
    trackingStatus === "delivered";
  return {
    delivered,
    deliveredAt: delivered ? event?.happened_at || null : null,
    fulfillmentStatus,
    trackingStatus,
    trackingNumber:
      fulfillment?.tracking_info?.code ||
      fulfillment?.tracking_info?.number ||
      order.shipping_tracking_number ||
      null,
    trackingUrl:
      fulfillment?.tracking_info?.url || order.shipping_tracking_url || null,
  };
}

function latestTrackingEvent(fulfillment: NuvemshopFulfillmentOrder | null) {
  if (!fulfillment?.tracking_events?.length) return null;
  return fulfillment.tracking_events.at(-1) || null;
}

function collectProductSeeds(orders: NuvemshopOrder[]) {
  const products = new Map<string, { name: string; imageUrl: string | null }>();
  for (const order of orders) {
    for (const item of order.products ?? []) {
      const externalId = String(item.product_id || "");
      if (!externalId || externalId === "0" || products.has(externalId)) continue;
      products.set(externalId, {
        name: item.name || "Produto",
        imageUrl: item.image?.src || null,
      });
    }
  }
  return products;
}

async function selectInChunks<T>(
  admin: AdminClient,
  table: string,
  select: string,
  column: string,
  values: string[],
  equals: Record<string, string>
): Promise<T[]> {
  const result: T[] = [];
  for (const batch of chunks([...new Set(values)], 100)) {
    if (!batch.length) continue;
    let query = admin.from(table).select(select).in(column, batch);
    for (const [key, value] of Object.entries(equals)) {
      query = query.eq(key, value);
    }
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    result.push(...((data ?? []) as unknown as T[]));
  }
  return result;
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}
