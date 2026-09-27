import { NextRequest, NextResponse } from "next/server";
import { fetchOrdersByPeriod, type NuvemshopOrder } from "@/lib/nuvemshop";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 730;
const MAX_ORDERS = 5_000;

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const start = request.nextUrl.searchParams.get("start") || "";
  const end = request.nextUrl.searchParams.get("end") || "";
  const validationError = validatePeriod(start, end);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: store } = await admin
    .from("stores")
    .select("external_store_id, access_token")
    .eq("platform", "nuvemshop")
    .not("access_token", "is", null)
    .limit(1)
    .maybeSingle();

  if (!store?.access_token) {
    return NextResponse.json(
      { error: "Conecte a loja Nuvemshop antes de calcular a comissão." },
      { status: 400 }
    );
  }

  try {
    const orders = await fetchOrdersByPeriod(
      store.external_store_id,
      store.access_token,
      {
        createdAtMin: `${start}T00:00:00-03:00`,
        createdAtMax: `${end}T23:59:59-03:00`,
        maxOrders: MAX_ORDERS,
      }
    );
    const paidOrders = orders
      .filter(isCommissionableOrder)
      .map(toCommissionOrder)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

    const grossRevenue = roundMoney(
      paidOrders.reduce((sum, order) => sum + order.totalPaid, 0)
    );
    const shippingCost = roundMoney(
      paidOrders.reduce((sum, order) => sum + order.shippingCost, 0)
    );

    return NextResponse.json({
      period: { start, end },
      ordersCount: paidOrders.length,
      grossRevenue,
      shippingCost,
      revenueAfterShipping: roundMoney(grossRevenue - shippingCost),
      currency: paidOrders[0]?.currency || "BRL",
      truncated: orders.length >= MAX_ORDERS,
      orders: paidOrders,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          (error as Error).message ||
          "Não foi possível buscar os valores dos pedidos na Nuvemshop.",
      },
      { status: 400 }
    );
  }
}

function validatePeriod(start: string, end: string): string | null {
  if (!DATE_PATTERN.test(start) || !DATE_PATTERN.test(end)) {
    return "Informe uma data inicial e uma data final válidas.";
  }
  const startDate = new Date(`${start}T12:00:00Z`);
  const endDate = new Date(`${end}T12:00:00Z`);
  if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime())) {
    return "O período informado é inválido.";
  }
  if (endDate < startDate) return "A data final não pode ser anterior à inicial.";
  const rangeDays = (endDate.getTime() - startDate.getTime()) / 86_400_000;
  if (rangeDays > MAX_RANGE_DAYS) {
    return "Escolha um período de até dois anos.";
  }
  return null;
}

function isCommissionableOrder(order: NuvemshopOrder): boolean {
  const paymentStatus = order.payment_status?.toLowerCase();
  const orderStatus = order.status?.toLowerCase();
  return paymentStatus === "paid" && orderStatus !== "cancelled";
}

function toCommissionOrder(order: NuvemshopOrder) {
  const totalPaid = money(
    order.total_paid_by_customer ??
      order.total_paid ??
      order.total_paid_by_customer_including_fees ??
      order.total
  );
  const shippingCost = money(order.shipping_cost_owner);
  return {
    id: String(order.id),
    number: String(order.number || order.id),
    customerName: order.customer?.name || order.contact_name || "Cliente",
    createdAt: order.created_at,
    paidAt: order.paid_at || null,
    totalPaid: roundMoney(totalPaid),
    shippingCost: roundMoney(shippingCost),
    revenueAfterShipping: roundMoney(totalPaid - shippingCost),
    currency: order.currency || "BRL",
  };
}

function money(value: string | number | null | undefined): number {
  if (value == null || value === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
