import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type AdminClient = ReturnType<typeof createAdminClient>;

export interface WhatsAppAccessibleInstance {
  id: string;
  storeId: string;
  sectorId: string | null;
  sectorName: string;
  instanceName: string;
  label: string;
  phoneNumber: string | null;
  active: boolean;
}

export interface WhatsAppAccessContext {
  userId: string;
  userName: string;
  storeId: string;
  storeName: string;
  isOwner: boolean;
  routingAvailable: boolean;
  legacyInstance: string | null;
  instances: WhatsAppAccessibleInstance[];
}

export class WhatsAppAccessError extends Error {
  constructor(
    message: string,
    public readonly status = 403
  ) {
    super(message);
  }
}

export async function getWhatsAppAccessContext(): Promise<WhatsAppAccessContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new WhatsAppAccessError("Unauthorized", 401);

  const admin = createAdminClient();
  const { data: store, error: storeError } = await admin
    .from("stores")
    .select("id, name")
    .limit(1)
    .maybeSingle();
  if (storeError) throw storeError;
  if (!store) throw new WhatsAppAccessError("Loja não encontrada", 404);

  const [{ data: member, error: memberError }, { data: settings }] =
    await Promise.all([
      admin
        .from("store_members")
        .select("name, role")
        .eq("store_id", store.id)
        .eq("user_id", user.id)
        .maybeSingle(),
      admin
        .from("store_settings")
        .select("whatsapp_instance")
        .eq("store_id", store.id)
        .maybeSingle(),
    ]);
  if (memberError) throw memberError;
  if (!member) {
    throw new WhatsAppAccessError("Seu usuário não possui acesso à loja", 403);
  }

  const { data: instanceRows, error: instanceError } = await admin
    .from("whatsapp_instances")
    .select(
      "id, store_id, sector_id, instance_name, label, phone_number, active"
    )
    .eq("store_id", store.id)
    .order("label", { ascending: true });

  if (instanceError && isRoutingSchemaMissing(instanceError.message)) {
    return {
      userId: user.id,
      userName: member.name,
      storeId: store.id,
      storeName: store.name,
      isOwner: member.role === "owner",
      routingAvailable: false,
      legacyInstance: settings?.whatsapp_instance ?? null,
      instances: [],
    };
  }
  if (instanceError) throw instanceError;

  const isOwner = member.role === "owner";
  let allowedSectorIds: string[] | null = null;
  if (!isOwner) {
    const { data: accessRows, error: accessError } = await admin
      .from("whatsapp_sector_members")
      .select("sector_id")
      .eq("store_id", store.id)
      .eq("user_id", user.id);
    if (accessError) throw accessError;
    allowedSectorIds = (accessRows ?? []).map((row) => String(row.sector_id));
  }

  const allSectorIds = Array.from(
    new Set(
      (instanceRows ?? [])
        .map((row) => row.sector_id && String(row.sector_id))
        .filter((value): value is string => Boolean(value))
    )
  );
  const sectorNames = await sectorNameMap(admin, store.id, allSectorIds);
  const instances = (instanceRows ?? [])
    .filter(
      (row) =>
        isOwner ||
        (Boolean(row.sector_id) && allowedSectorIds?.includes(String(row.sector_id)))
    )
    .map((row) => ({
      id: String(row.id),
      storeId: String(row.store_id),
      sectorId: row.sector_id ? String(row.sector_id) : null,
      sectorName: row.sector_id
        ? sectorNames.get(String(row.sector_id)) ?? "Sem setor"
        : "Sem setor",
      instanceName: String(row.instance_name),
      label: String(row.label),
      phoneNumber:
        typeof row.phone_number === "string" ? row.phone_number : null,
      active: row.active !== false,
    }));

  return {
    userId: user.id,
    userName: member.name,
    storeId: store.id,
    storeName: store.name,
    isOwner,
    routingAvailable: true,
    legacyInstance: settings?.whatsapp_instance ?? null,
    instances,
  };
}

export function accessibleInstance(
  context: WhatsAppAccessContext,
  instanceId: string,
  options: { requireActive?: boolean } = {}
): WhatsAppAccessibleInstance {
  const instance = context.instances.find((item) => item.id === instanceId);
  if (!instance) {
    throw new WhatsAppAccessError(
      "Você não possui acesso ao setor desse telefone",
      403
    );
  }
  if (options.requireActive && !instance.active) {
    throw new WhatsAppAccessError("Este telefone foi desativado", 409);
  }
  return instance;
}

export function isRoutingSchemaMissing(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("whatsapp_instances") ||
    normalized.includes("whatsapp_sectors") ||
    normalized.includes("whatsapp_sector_members") ||
    normalized.includes("whatsapp_conversations") ||
    normalized.includes("whatsapp_conversation_events")
  ) && (normalized.includes("schema cache") || normalized.includes("does not exist"));
}

async function sectorNameMap(
  admin: AdminClient,
  storeId: string,
  sectorIds: string[]
): Promise<Map<string, string>> {
  if (!sectorIds.length) return new Map();
  const { data, error } = await admin
    .from("whatsapp_sectors")
    .select("id, name")
    .eq("store_id", storeId)
    .in("id", sectorIds);
  if (error) throw error;
  return new Map((data ?? []).map((row) => [String(row.id), String(row.name)]));
}
