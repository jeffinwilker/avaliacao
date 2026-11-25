"use client";

import { useCallback, useEffect, useState } from "react";

interface SectorView {
  id: string;
  name: string;
  active: boolean;
}

interface InstanceView {
  id: string;
  sectorId: string | null;
  sectorName: string;
  instanceName: string;
  label: string;
  phoneNumber: string | null;
  active: boolean;
  state: "open" | "close" | "connecting" | "unknown";
  error: string | null;
}

interface MemberView {
  userId: string;
  name: string;
  email: string;
  role: string;
  sectorIds: string[];
}

export function WhatsAppRoutingManager() {
  const [sectors, setSectors] = useState<SectorView[]>([]);
  const [instances, setInstances] = useState<InstanceView[]>([]);
  const [members, setMembers] = useState<MemberView[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [sectorName, setSectorName] = useState("");
  const [newPhone, setNewPhone] = useState({
    label: "",
    instanceName: "",
    phoneNumber: "",
    sectorId: "",
  });
  const [connection, setConnection] = useState<{
    title: string;
    qrCode: string | null;
    pairingCode: string | null;
    state: string;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/whatsapp/routing", { cache: "no-store" });
    const result = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) {
      setError(result.error || "Não foi possível carregar os setores");
      return;
    }
    setSectors(result.sectors ?? []);
    setInstances(result.instances ?? []);
    setMembers(result.members ?? []);
    setCanManage(result.canManage === true);
    setNewPhone((current) => ({
      ...current,
      sectorId: current.sectorId || result.sectors?.[0]?.id || "",
    }));
    setError(null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function action(body: Record<string, unknown>, key: string) {
    setBusy(key);
    setError(null);
    const response = await fetch("/api/whatsapp/routing", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({}));
    setBusy(null);
    if (!response.ok) {
      setError(result.error || "Não foi possível salvar");
      return false;
    }
    await load();
    return true;
  }

  async function createSector() {
    const name = sectorName.trim();
    if (!name) return;
    if (await action({ action: "createSector", name }, "sector")) {
      setSectorName("");
    }
  }

  async function addPhone() {
    if (
      await action(
        { action: "saveInstance", ...newPhone, active: true },
        "new-phone"
      )
    ) {
      setNewPhone({
        label: "",
        instanceName: "",
        phoneNumber: "",
        sectorId: sectors[0]?.id ?? "",
      });
    }
  }

  async function saveInstance(instance: InstanceView) {
    await action(
      {
        action: "saveInstance",
        id: instance.id,
        sectorId: instance.sectorId,
        instanceName: instance.instanceName,
        label: instance.label,
        phoneNumber: instance.phoneNumber,
        active: instance.active,
      },
      `instance:${instance.id}`
    );
  }

  async function saveMember(member: MemberView) {
    await action(
      {
        action: "setMemberSectors",
        userId: member.userId,
        sectorIds: member.sectorIds,
      },
      `member:${member.userId}`
    );
  }

  async function connectPhone(instance: InstanceView) {
    setBusy(`connect:${instance.id}`);
    setError(null);
    const response = await fetch("/api/whatsapp/instances/connect", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ instanceId: instance.id }),
    });
    const result = await response.json().catch(() => ({}));
    setBusy(null);
    if (!response.ok) {
      setError(result.error || "Não foi possível conectar o telefone");
      return;
    }
    setConnection({
      title: instance.label,
      qrCode: result.qrCode ?? null,
      pairingCode: result.pairingCode ?? null,
      state: result.state ?? "unknown",
    });
    await load();
  }

  if (loading) {
    return <div className="text-sm text-zinc-500">Carregando setores e telefones...</div>;
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-semibold text-zinc-900">Setores e telefones</h3>
        <p className="mt-1 text-sm leading-5 text-zinc-500">
          Cada usuário verá e poderá transferir conversas somente para os setores liberados.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {canManage && (
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-xl border border-zinc-200 p-4">
            <div className="text-sm font-semibold text-zinc-800">Novo setor</div>
            <div className="mt-3 flex gap-2">
              <input
                value={sectorName}
                onChange={(event) => setSectorName(event.target.value)}
                placeholder="Ex.: Vendas, Financeiro"
                className="min-w-0 flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => void createSector()}
                disabled={busy === "sector" || !sectorName.trim()}
                className="rounded-lg bg-zinc-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Criar
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-200 p-4">
            <div className="text-sm font-semibold text-zinc-800">Adicionar telefone</div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <input
                value={newPhone.label}
                onChange={(event) => setNewPhone({ ...newPhone, label: event.target.value })}
                placeholder="Nome: Vendas 1"
                className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              />
              <input
                value={newPhone.instanceName}
                onChange={(event) => setNewPhone({ ...newPhone, instanceName: event.target.value })}
                placeholder="Instância na Evolution"
                className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              />
              <input
                value={newPhone.phoneNumber}
                onChange={(event) => setNewPhone({ ...newPhone, phoneNumber: event.target.value })}
                placeholder="Telefone (opcional)"
                className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              />
              <select
                value={newPhone.sectorId}
                onChange={(event) => setNewPhone({ ...newPhone, sectorId: event.target.value })}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
              >
                <option value="">Escolha o setor</option>
                {sectors.map((sector) => (
                  <option key={sector.id} value={sector.id}>{sector.name}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => void addPhone()}
              disabled={busy === "new-phone" || !newPhone.label || !newPhone.instanceName || !newPhone.sectorId}
              className="mt-3 rounded-lg bg-zinc-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Adicionar telefone
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {instances.map((instance, index) => (
          <div key={instance.id} className="rounded-xl border border-zinc-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-semibold text-zinc-900">{instance.label}</div>
                <div className="mt-1 text-xs text-zinc-500">
                  {instance.phoneNumber || instance.instanceName} · {instance.sectorName}
                </div>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${instance.state === "open" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700"}`}>
                {!instance.active ? "Desativado" : instance.state === "open" ? "Conectado" : "Desconectado"}
              </span>
            </div>
            {canManage && (
              <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
                <input
                  value={instance.label}
                  onChange={(event) => updateInstance(setInstances, index, { label: event.target.value })}
                  className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                />
                <select
                  value={instance.sectorId ?? ""}
                  onChange={(event) => updateInstance(setInstances, index, {
                    sectorId: event.target.value,
                    sectorName: sectors.find((item) => item.id === event.target.value)?.name ?? "Sem setor",
                  })}
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                >
                  {sectors.map((sector) => (
                    <option key={sector.id} value={sector.id}>{sector.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => void saveInstance(instance)}
                  disabled={busy === `instance:${instance.id}`}
                  className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold text-zinc-700 disabled:opacity-50"
                >
                  Salvar
                </button>
                <button
                  type="button"
                  onClick={() => void connectPhone(instance)}
                  disabled={busy === `connect:${instance.id}`}
                  className="rounded-lg bg-zinc-950 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Conectar
                </button>
                <label className="flex items-center gap-2 text-xs font-medium text-zinc-600 sm:col-span-4">
                  <input
                    type="checkbox"
                    checked={instance.active}
                    onChange={(event) => updateInstance(setInstances, index, { active: event.target.checked })}
                    className="h-4 w-4 rounded border-zinc-300"
                  />
                  Telefone ativo para receber e transferir atendimentos
                </label>
              </div>
            )}
          </div>
        ))}
      </div>

      {canManage && members.length > 0 && (
        <div className="space-y-3">
          <div className="text-sm font-semibold text-zinc-800">Acesso dos usuários</div>
          {members.map((member, memberIndex) => (
            <div key={member.userId} className="rounded-xl border border-zinc-200 p-4">
              <div className="font-medium text-zinc-900">{member.name}</div>
              <div className="text-xs text-zinc-500">{member.email}</div>
              {member.role === "owner" && (
                <div className="mt-2 text-xs font-medium text-emerald-700">
                  Administrador principal · acesso a todos os setores
                </div>
              )}
              <div className={`mt-3 flex flex-wrap gap-3 ${member.role === "owner" ? "opacity-50" : ""}`}>
                {sectors.map((sector) => (
                  <label key={sector.id} className="flex items-center gap-2 text-sm text-zinc-700">
                    <input
                      type="checkbox"
                      checked={member.role === "owner" || member.sectorIds.includes(sector.id)}
                      disabled={member.role === "owner"}
                      onChange={(event) => updateMemberSector(
                        setMembers,
                        memberIndex,
                        sector.id,
                        event.target.checked
                      )}
                      className="h-4 w-4 rounded border-zinc-300"
                    />
                    {sector.name}
                  </label>
                ))}
              </div>
              <button
                type="button"
                onClick={() => void saveMember(member)}
                disabled={member.role === "owner" || busy === `member:${member.userId}`}
                className="mt-3 rounded-lg border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-700 disabled:opacity-50"
              >
                Salvar acessos
              </button>
            </div>
          ))}
        </div>
      )}

      {connection && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-zinc-950/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl">
            <h3 className="font-semibold text-zinc-900">Conectar {connection.title}</h3>
            {connection.state === "open" ? (
              <div className="mt-5 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">Telefone conectado.</div>
            ) : connection.qrCode ? (
              <img src={connection.qrCode} alt="QR Code do WhatsApp" className="mx-auto mt-5 h-64 w-64" />
            ) : (
              <div className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
                Solicitação enviada. Atualize em alguns segundos para obter o QR Code.
              </div>
            )}
            {connection.pairingCode && <div className="mt-3 font-mono text-lg font-bold">{connection.pairingCode}</div>}
            <button type="button" onClick={() => setConnection(null)} className="mt-5 rounded-lg bg-zinc-950 px-5 py-2.5 text-sm font-semibold text-white">Fechar</button>
          </div>
        </div>
      )}
    </div>
  );
}

function updateInstance(
  setter: React.Dispatch<React.SetStateAction<InstanceView[]>>,
  index: number,
  updates: Partial<InstanceView>
) {
  setter((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...updates } : item));
}

function updateMemberSector(
  setter: React.Dispatch<React.SetStateAction<MemberView[]>>,
  index: number,
  sectorId: string,
  checked: boolean
) {
  setter((current) => current.map((member, memberIndex) => memberIndex === index
    ? {
        ...member,
        sectorIds: checked
          ? Array.from(new Set([...member.sectorIds, sectorId]))
          : member.sectorIds.filter((id) => id !== sectorId),
      }
    : member));
}
