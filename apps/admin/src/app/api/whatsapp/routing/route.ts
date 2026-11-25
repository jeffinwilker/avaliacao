import { NextResponse, type NextRequest } from "next/server";
import {
  evolutionInstanceExists,
  evolutionRequest,
  isEvolutionServerConfigured,
} from "@/lib/evolution";
import { createAdminClient } from "@/lib/supabase/admin";
import { instanceStatus } from "@/lib/whatsapp-instances";
import {
  getWhatsAppAccessContext,
  WhatsAppAccessError,
} from "@/lib/whatsapp-routing";

export async function GET() {
  try {
    const context = await getWhatsAppAccessContext();
    if (!context.routingAvailable) {
      return NextResponse.json(
        { error: "Execute a migration 0021_whatsapp_sectors_and_transfers.sql" },
        { status: 409 }
      );
    }
    const admin = createAdminClient();
    const [{ data: sectors, error: sectorError }, { data: members, error: memberError }] =
      await Promise.all([
        admin
          .from("whatsapp_sectors")
          .select("id, name, active")
          .eq("store_id", context.storeId)
          .order("name", { ascending: true }),
        context.isOwner
          ? admin
              .from("store_members")
              .select("user_id, name, email, role")
              .eq("store_id", context.storeId)
              .order("name", { ascending: true })
          : Promise.resolve({ data: [], error: null }),
      ]);
    if (sectorError) throw sectorError;
    if (memberError) throw memberError;

    const { data: accessRows, error: accessError } = context.isOwner
      ? await admin
          .from("whatsapp_sector_members")
          .select("user_id, sector_id")
          .eq("store_id", context.storeId)
      : { data: [], error: null };
    if (accessError) throw accessError;
    const statuses = await Promise.all(
      context.instances.map((instance) => instanceStatus(instance))
    );

    return NextResponse.json({
      canManage: context.isOwner,
      sectors: sectors ?? [],
      instances: statuses.map((instance) => ({
        id: instance.id,
        sectorId: instance.sectorId,
        sectorName: instance.sectorName,
        instanceName: instance.instanceName,
        label: instance.label,
        phoneNumber: instance.phoneNumber,
        active: instance.active,
        state: instance.state,
        error: instance.error,
      })),
      members: (members ?? []).map((member) => ({
        userId: member.user_id,
        name: member.name,
        email: member.email,
        role: member.role,
        sectorIds: (accessRows ?? [])
          .filter((row) => String(row.user_id) === String(member.user_id))
          .map((row) => String(row.sector_id)),
      })),
    });
  } catch (error) {
    return accessErrorResponse(error, "Não foi possível carregar os setores");
  }
}

export async function POST(req: NextRequest) {
  try {
    const context = await getWhatsAppAccessContext();
    if (!context.routingAvailable) {
      return NextResponse.json(
        { error: "Execute a migration 0021_whatsapp_sectors_and_transfers.sql" },
        { status: 409 }
      );
    }
    if (!context.isOwner) {
      throw new WhatsAppAccessError(
        "Somente o administrador pode configurar setores e telefones",
        403
      );
    }
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const action = typeof body?.action === "string" ? body.action : "";
    const admin = createAdminClient();

    if (action === "createSector") {
      const name = cleanText(body?.name, 60);
      if (name.length < 2) {
        return NextResponse.json({ error: "Informe o nome do setor" }, { status: 400 });
      }
      const { data, error } = await admin
        .from("whatsapp_sectors")
        .insert({ store_id: context.storeId, name })
        .select("id, name, active")
        .single();
      if (error) throw error;
      return NextResponse.json({ ok: true, sector: data });
    }

    if (action === "saveInstance") {
      const id = typeof body?.id === "string" ? body.id : "";
      const sectorId = typeof body?.sectorId === "string" ? body.sectorId : "";
      const label = cleanText(body?.label, 80);
      const phoneNumber = cleanText(body?.phoneNumber, 30) || null;
      const active = body?.active !== false;
      const instanceName = cleanInstanceName(body?.instanceName);
      if (!sectorId || !label || !instanceName) {
        return NextResponse.json(
          { error: "Informe setor, nome e instância do telefone" },
          { status: 400 }
        );
      }
      await ensureSector(admin, context.storeId, sectorId);
      if (!id) await ensureEvolutionInstance(instanceName);
      const values = {
        store_id: context.storeId,
        sector_id: sectorId,
        instance_name: instanceName,
        label,
        phone_number: phoneNumber,
        active,
      };
      const query = id
        ? admin
            .from("whatsapp_instances")
            .update(values)
            .eq("id", id)
            .eq("store_id", context.storeId)
        : admin.from("whatsapp_instances").insert(values);
      const { data, error } = await query
        .select("id, sector_id, instance_name, label, phone_number, active")
        .single();
      if (error) throw error;
      return NextResponse.json({ ok: true, instance: data });
    }

    if (action === "setMemberSectors") {
      const userId = typeof body?.userId === "string" ? body.userId : "";
      const sectorIds = Array.isArray(body?.sectorIds)
        ? Array.from(
            new Set(
              body.sectorIds.filter((value): value is string => typeof value === "string")
            )
          )
        : [];
      const { data: member, error: memberError } = await admin
        .from("store_members")
        .select("user_id")
        .eq("store_id", context.storeId)
        .eq("user_id", userId)
        .maybeSingle();
      if (memberError) throw memberError;
      if (!member) {
        return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
      }
      if (sectorIds.length) {
        const { data: validSectors, error: sectorError } = await admin
          .from("whatsapp_sectors")
          .select("id")
          .eq("store_id", context.storeId)
          .in("id", sectorIds);
        if (sectorError) throw sectorError;
        if ((validSectors ?? []).length !== sectorIds.length) {
          return NextResponse.json({ error: "Há um setor inválido" }, { status: 400 });
        }
      }
      const { error: deleteError } = await admin
        .from("whatsapp_sector_members")
        .delete()
        .eq("store_id", context.storeId)
        .eq("user_id", userId);
      if (deleteError) throw deleteError;
      if (sectorIds.length) {
        const { error: insertError } = await admin
          .from("whatsapp_sector_members")
          .insert(
            sectorIds.map((sectorId) => ({
              store_id: context.storeId,
              sector_id: sectorId,
              user_id: userId,
            }))
          );
        if (insertError) throw insertError;
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  } catch (error) {
    return accessErrorResponse(error, "Não foi possível salvar a configuração");
  }
}

async function ensureEvolutionInstance(instanceName: string) {
  if (!isEvolutionServerConfigured()) {
    throw new Error("Servidor Evolution não configurado");
  }
  const instances = await evolutionRequest("instance/fetchInstances");
  if (evolutionInstanceExists(instances, instanceName)) return;
  await evolutionRequest("instance/create", {
    method: "POST",
    body: {
      instanceName,
      integration: "WHATSAPP-BAILEYS",
      qrcode: true,
    },
  });
}

async function ensureSector(
  admin: ReturnType<typeof createAdminClient>,
  storeId: string,
  sectorId: string
) {
  const { data, error } = await admin
    .from("whatsapp_sectors")
    .select("id")
    .eq("id", sectorId)
    .eq("store_id", storeId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Setor não encontrado");
}

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanInstanceName(value: unknown): string {
  const text = cleanText(value, 100);
  return /^[a-zA-Z0-9_-]+$/.test(text) ? text : "";
}

function accessErrorResponse(error: unknown, fallback: string) {
  const status = error instanceof WhatsAppAccessError ? error.status : 500;
  return NextResponse.json(
    { error: (error as Error).message || fallback },
    { status }
  );
}
