import { createAdminClient } from "@/lib/supabase/admin";
import { RunAutomationsButton } from "./RunAutomationsButton";

const dateTime = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

const statusLabels: Record<string, string> = {
  scheduled: "Agendada",
  processing: "Processando",
  sent: "Enviada",
  failed: "Falhou",
  cancelled: "Cancelada",
};

export default async function AutomationsPage() {
  const admin = createAdminClient();
  const { data: store } = await admin.from("stores").select("id").limit(1).maybeSingle();

  if (!store) {
    return <div className="p-8 text-gray-600">Conecte uma loja primeiro.</div>;
  }

  const [{ data: messages }, { count: scheduled }, { count: sent }, { count: failed }] =
    await Promise.all([
      admin
        .from("automation_messages")
        .select(
          `id, automation_type, reference_label, customer_name, customer_phone,
           products_summary, status, scheduled_for, sent_at, error_message`
        )
        .eq("store_id", store.id)
        .order("created_at", { ascending: false })
        .limit(100),
      countStatus(admin, store.id, "scheduled"),
      countStatus(admin, store.id, "sent"),
      countStatus(admin, store.id, "failed"),
    ]);

  return (
    <div className="p-8">
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Automações de WhatsApp</h1>
          <p className="text-sm text-gray-600 mt-1">
            Histórico de carrinhos abandonados e mensagens de pós-venda.
          </p>
        </div>
        <RunAutomationsButton />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card label="Agendadas" value={scheduled ?? 0} />
        <Card label="Enviadas" value={sent ?? 0} />
        <Card label="Falhas" value={failed ?? 0} warn={(failed ?? 0) > 0} />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {messages?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="text-left px-4 py-3">Automação</th>
                  <th className="text-left px-4 py-3">Cliente</th>
                  <th className="text-left px-4 py-3">Produtos</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Agendada para</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {messages.map((message) => (
                  <tr key={message.id}>
                    <td className="px-4 py-3">
                      <div className="font-medium">
                        {message.automation_type === "abandoned_cart"
                          ? "Carrinho abandonado"
                          : "Pós-venda"}
                      </div>
                      <div className="text-xs text-gray-500">
                        #{message.reference_label || "—"}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div>{message.customer_name}</div>
                      <div className="text-xs text-gray-500">
                        {maskPhone(message.customer_phone)}
                      </div>
                    </td>
                    <td className="px-4 py-3 max-w-xs truncate">
                      {message.products_summary}
                    </td>
                    <td className="px-4 py-3">
                      <span className={statusClass(message.status)}>
                        {statusLabels[message.status] || message.status}
                      </span>
                      {message.error_message && (
                        <div className="text-xs text-red-600 mt-1 max-w-xs truncate" title={message.error_message}>
                          {message.error_message}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {dateTime.format(new Date(message.scheduled_for))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-5 py-16 text-center text-gray-500">
            Nenhuma mensagem automática registrada ainda.
          </div>
        )}
      </div>
    </div>
  );
}

function countStatus(
  admin: ReturnType<typeof createAdminClient>,
  storeId: string,
  status: string
) {
  return admin
    .from("automation_messages")
    .select("*", { count: "exact", head: true })
    .eq("store_id", storeId)
    .eq("status", status);
}

function Card({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className={`rounded-xl border p-5 ${warn ? "border-red-200 bg-red-50" : "border-gray-200 bg-white"}`}>
      <div className="text-sm text-gray-500 mb-1">{label}</div>
      <div className="text-3xl font-bold">{value}</div>
    </div>
  );
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 6) return "••••";
  return `${digits.slice(0, 4)}••••${digits.slice(-3)}`;
}

function statusClass(status: string): string {
  const color =
    status === "sent"
      ? "bg-green-100 text-green-800"
      : status === "failed"
      ? "bg-red-100 text-red-800"
      : status === "cancelled"
      ? "bg-gray-100 text-gray-700"
      : "bg-amber-100 text-amber-800";
  return `inline-flex rounded-full px-2 py-1 text-xs font-medium ${color}`;
}
