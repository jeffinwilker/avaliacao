import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  CustomersManager,
  type BirthdayCollectionSettingsView,
  type CustomerView,
} from "./CustomersManager";
import { customerMigrationError } from "@/lib/customers";

export default async function CustomersPage() {
  const admin = createAdminClient();
  const { data: store } = await admin
    .from("stores")
    .select("id, name, platform, access_token")
    .limit(1)
    .maybeSingle();

  if (!store) {
    return (
      <div className="p-8">
        <p className="text-gray-600">
          Conecte sua loja primeiro em{" "}
          <Link href="/integration" className="underline">
            Integração
          </Link>
          .
        </p>
      </div>
    );
  }

  const customersResult = await admin
    .from("customers")
    .select(
      "id, external_customer_id, name, email, phone, identification, birth_date, accepts_marketing, active, source, total_spent, total_spent_currency, last_order_id, note, created_at, updated_at"
    )
    .eq("store_id", store.id)
    .order("updated_at", { ascending: false })
    .limit(5000);
  const settingsResult = await admin
    .from("store_settings")
    .select(
      "birthday_collection_enabled, birthday_collection_delay_minutes, birthday_collection_whatsapp_template"
    )
    .eq("store_id", store.id)
    .maybeSingle();

  const customers: CustomerView[] = (customersResult.data ?? []).map((customer) => ({
    id: customer.id,
    externalCustomerId: customer.external_customer_id,
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    identification: customer.identification,
    birthDate: customer.birth_date,
    acceptsMarketing: customer.accepts_marketing,
    active: customer.active,
    source: customer.source === "nuvemshop" || customer.source === "order"
      ? customer.source
      : "manual",
    totalSpent:
      customer.total_spent != null ? Number(customer.total_spent) : null,
    totalSpentCurrency: customer.total_spent_currency,
    lastOrderId: customer.last_order_id,
    note: customer.note,
    createdAt: customer.created_at,
    updatedAt: customer.updated_at,
  }));
  const birthdaySettings: BirthdayCollectionSettingsView = {
    enabled: settingsResult.data?.birthday_collection_enabled === true,
    delayMinutes: Math.max(
      0,
      Math.min(
        43_200,
        Number(settingsResult.data?.birthday_collection_delay_minutes ?? 1440)
      )
    ),
    template:
      typeof settingsResult.data?.birthday_collection_whatsapp_template === "string"
        ? settingsResult.data.birthday_collection_whatsapp_template
        : null,
  };

  return (
    <div className="p-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Clientes</h1>
          <p className="mt-1 text-sm text-gray-500">
            Base de clientes para relacionamento, aniversários e cupons.
          </p>
        </div>
        <Link
          href="/automations/abandoned-carts?section=messages"
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Ver mensagens
        </Link>
      </div>

      <CustomersManager
        storeId={store.id}
        initialCustomers={customers}
        available={!customersResult.error}
        unavailableMessage={
          customersResult.error
            ? customerMigrationError(customersResult.error.message)
            : null
        }
        canSyncNuvemshop={store.platform === "nuvemshop" && Boolean(store.access_token)}
        birthdaySettings={birthdaySettings}
        birthdaySettingsAvailable={!settingsResult.error}
        birthdaySettingsUnavailableMessage={
          settingsResult.error
            ? customerMigrationError(settingsResult.error.message)
            : null
        }
      />
    </div>
  );
}
