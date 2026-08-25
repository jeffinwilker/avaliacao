"use client";

import { useState } from "react";

export interface TeamMemberView {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: "owner" | "member";
  createdAt: string;
}

export function TeamUsers({
  storeId,
  currentUserId,
  initialMembers,
  available,
  canManage,
}: {
  storeId: string;
  currentUserId: string;
  initialMembers: TeamMemberView[];
  available: boolean;
  canManage: boolean;
}) {
  const [members, setMembers] = useState(initialMembers);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "ok" | "error";
    text: string;
  } | null>(null);

  async function addMember() {
    if (saving) return;
    setSaving(true);
    setFeedback(null);
    const res = await fetch("/api/team-users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ storeId, name, email, password }),
    });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setFeedback({
        type: "error",
        text: json.error || "Não foi possível adicionar o usuário",
      });
      return;
    }

    const member = normalizeMember(json.member);
    if (member) {
      setMembers((current) => [...current, member]);
    }
    setName("");
    setEmail("");
    setPassword("");
    setFeedback({
      type: "ok",
      text: "Usuário criado. Ele já pode entrar com o e-mail e a senha inicial.",
    });
  }

  async function removeMember(member: TeamMemberView) {
    if (
      !window.confirm(
        `Remover o acesso de ${member.name}? Essa pessoa será desconectada do painel.`
      )
    ) {
      return;
    }

    setRemovingId(member.userId);
    setFeedback(null);
    const res = await fetch("/api/team-users", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ storeId, userId: member.userId }),
    });
    const json = await res.json().catch(() => ({}));
    setRemovingId(null);
    if (!res.ok) {
      setFeedback({
        type: "error",
        text: json.error || "Não foi possível remover o usuário",
      });
      return;
    }

    setMembers((current) =>
      current.filter((candidate) => candidate.userId !== member.userId)
    );
    setFeedback({ type: "ok", text: "Acesso removido com sucesso." });
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Usuários da equipe</h2>
          <p className="mt-1 text-sm text-gray-500">
            Adicione pessoas para acessar e administrar esta mesma loja.
          </p>
        </div>
        {available && (
          <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
            {members.length} {members.length === 1 ? "usuário" : "usuários"}
          </span>
        )}
      </div>

      {!available ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Execute a migration <code className="font-mono">0014_store_members.sql</code>{" "}
          no Supabase para liberar o cadastro de usuários.
        </div>
      ) : (
        <>
          <div className="mt-5 divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200">
            {members.map((member) => {
              const isCurrent = member.userId === currentUserId;
              return (
                <div
                  key={member.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-zinc-900 text-sm font-semibold text-white">
                      {memberInitials(member.name)}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-semibold text-gray-900">
                          {member.name}
                        </span>
                        {isCurrent && (
                          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                            Você
                          </span>
                        )}
                      </div>
                      <div className="truncate text-xs text-gray-500">
                        {member.email}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        member.role === "owner"
                          ? "bg-zinc-900 text-white"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {member.role === "owner" ? "Administrador" : "Equipe"}
                    </span>
                    {canManage && member.role !== "owner" && (
                      <button
                        type="button"
                        onClick={() => removeMember(member)}
                        disabled={removingId === member.userId}
                        className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        {removingId === member.userId ? "Removendo..." : "Remover"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {canManage ? (
            <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="mb-3">
                <div className="text-sm font-semibold text-gray-900">
                  Adicionar usuário
                </div>
                <p className="mt-0.5 text-xs text-gray-500">
                  Crie uma senha inicial. Depois, a pessoa pode alterá-la pelo painel.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-medium text-gray-700">
                  Nome
                  <input
                    type="text"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addMember();
                      }
                    }}
                    placeholder="Nome da pessoa"
                    autoComplete="off"
                    className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
                  />
                </label>
                <label className="text-sm font-medium text-gray-700">
                  E-mail
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addMember();
                      }
                    }}
                    placeholder="pessoa@sualoja.com.br"
                    autoComplete="off"
                    className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
                  />
                </label>
                <label className="text-sm font-medium text-gray-700 sm:col-span-2">
                  Senha inicial
                  <div className="relative mt-1.5">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      minLength={8}
                      onChange={(event) => setPassword(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addMember();
                        }
                      }}
                      placeholder="Pelo menos 8 caracteres"
                      autoComplete="new-password"
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 pr-20 text-sm font-normal outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((visible) => !visible)}
                      className="absolute inset-y-0 right-3 text-xs font-medium text-gray-500 hover:text-gray-900"
                    >
                      {showPassword ? "Ocultar" : "Mostrar"}
                    </button>
                  </div>
                </label>
              </div>
              <button
                type="button"
                onClick={addMember}
                disabled={saving || !name.trim() || !email.trim() || password.length < 8}
                className="mt-4 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Adicionando..." : "Adicionar usuário"}
              </button>
            </div>
          ) : (
            <p className="mt-4 text-xs text-gray-500">
              Somente o administrador principal pode adicionar ou remover usuários.
            </p>
          )}

          {feedback && (
            <div
              className={`mt-4 rounded-lg border px-3 py-2.5 text-sm ${
                feedback.type === "ok"
                  ? "border-green-200 bg-green-50 text-green-800"
                  : "border-red-200 bg-red-50 text-red-700"
              }`}
            >
              {feedback.text}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function normalizeMember(value: unknown): TeamMemberView | null {
  if (!value || typeof value !== "object") return null;
  const member = value as Record<string, unknown>;
  if (
    typeof member.id !== "string" ||
    typeof member.user_id !== "string" ||
    typeof member.name !== "string" ||
    typeof member.email !== "string"
  ) {
    return null;
  }
  return {
    id: member.id,
    userId: member.user_id,
    name: member.name,
    email: member.email,
    role: member.role === "owner" ? "owner" : "member",
    createdAt:
      typeof member.created_at === "string"
        ? member.created_at
        : new Date().toISOString(),
  };
}

function memberInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return `${parts[0]?.[0] || "U"}${parts[1]?.[0] || ""}`.toUpperCase();
}
