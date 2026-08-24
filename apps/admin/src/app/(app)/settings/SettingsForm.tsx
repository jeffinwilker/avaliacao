"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { WhatsAppConnection } from "./WhatsAppConnection";

interface Settings {
  store_id: string;
  auto_publish: boolean;
  request_delay_days: number;
  email_enabled: boolean;
  whatsapp_enabled: boolean;
  whatsapp_instance: string | null;
  email_subject: string | null;
  email_template: string | null;
  whatsapp_template: string | null;
  abandoned_cart_enabled: boolean;
  abandoned_cart_delay_hours: number;
  abandoned_cart_whatsapp_template: string | null;
  abandoned_cart_sequence: unknown;
  post_purchase_enabled: boolean;
  post_purchase_delay_hours: number;
  post_purchase_whatsapp_template: string | null;
  brand_color: string | null;
  allow_media: boolean;
  max_media_per_review: number;
}

export function SettingsForm({
  storeName,
  initial,
  evolutionServerConfigured,
}: {
  storeName: string;
  initial: Settings;
  evolutionServerConfigured: boolean;
}) {
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(s),
    });
    setSaving(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setSaveError(json.error || "Não foi possível salvar as configurações");
      return;
    }
    setSaved(true);
    router.refresh();
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <form onSubmit={save} className="space-y-6">
      <Section title="Loja">
        <div className="text-sm text-gray-600">
          Conectada: <strong>{storeName}</strong>
        </div>
      </Section>

      <Section title="WhatsApp">
        <WhatsAppConnection
          serverConfigured={evolutionServerConfigured}
          initialInstance={initial.whatsapp_instance}
        />
      </Section>

      <Section title="Moderação">
        <Toggle
          label="Publicar avaliações automaticamente"
          hint="Se ligado, novas avaliações ficam visíveis sem aprovação manual."
          value={s.auto_publish}
          onChange={(v) => setS({ ...s, auto_publish: v })}
        />
        <Toggle
          label="Permitir fotos e vídeos"
          value={s.allow_media}
          onChange={(v) => setS({ ...s, allow_media: v })}
        />
        {s.allow_media && (
          <Field label="Máx. de mídias por avaliação">
            <input
              type="number"
              min={1}
              max={10}
              value={s.max_media_per_review}
              onChange={(e) =>
                setS({ ...s, max_media_per_review: Number(e.target.value) })
              }
              className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </Field>
        )}
      </Section>

      <Section title="Solicitação de avaliação por e-mail">
        <Field label="Dias após o pedido para pedir avaliação">
          <input
            type="number"
            min={1}
            max={60}
            value={s.request_delay_days}
            onChange={(e) =>
              setS({ ...s, request_delay_days: Number(e.target.value) })
            }
            className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </Field>

        <Toggle
          label="Enviar por e-mail"
          value={s.email_enabled}
          onChange={(v) => setS({ ...s, email_enabled: v })}
        />
        {s.email_enabled && (
          <>
            <Field label="Assunto do e-mail">
              <input
                type="text"
                value={s.email_subject ?? ""}
                onChange={(e) => setS({ ...s, email_subject: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </Field>
            <Field
              label="Mensagem do e-mail"
              hint="Variáveis disponíveis: {{nome}}, {{produto}}, {{link}}, {{loja}}"
            >
              <textarea
                value={s.email_template ?? ""}
                onChange={(e) => setS({ ...s, email_template: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm min-h-[140px] font-mono"
              />
            </Field>
          </>
        )}

      </Section>

      <Section title="Automações de WhatsApp">
        <p className="text-sm text-gray-600">
          As mensagens, horários e listas de envios agora ficam em páginas separadas.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <a
            href="/automations/abandoned-carts?section=orders"
            className="rounded-xl border border-gray-200 bg-gray-50 p-4 transition hover:border-gray-400 hover:bg-white"
          >
            <div className="font-semibold text-gray-900">Carrinhos abandonados</div>
            <div className="mt-1 text-sm text-gray-500">
              Sequência de recuperação e lista de carrinhos.
            </div>
          </a>
          <a
            href="/automations/post-sale?section=orders"
            className="rounded-xl border border-gray-200 bg-gray-50 p-4 transition hover:border-gray-400 hover:bg-white"
          >
            <div className="font-semibold text-gray-900">Pós-venda</div>
            <div className="mt-1 text-sm text-gray-500">
              Mensagem da compra, pedido de avaliação e status dos envios.
            </div>
          </a>
        </div>
      </Section>

      <Section title="Aparência do widget">
        <Field
          label="Cor principal"
          hint="Aplicada nos botões e destaques do widget na loja."
        >
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={s.brand_color ?? "#111827"}
              onChange={(e) => setS({ ...s, brand_color: e.target.value })}
              className="h-10 w-16 border border-gray-300 rounded-lg"
            />
            <input
              type="text"
              value={s.brand_color ?? ""}
              onChange={(e) => setS({ ...s, brand_color: e.target.value })}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"
            />
          </div>
        </Field>
      </Section>

      <div className="flex items-center gap-3 sticky bottom-0 bg-gray-50 py-4 -mx-8 px-8 border-t border-gray-200">
        <button
          type="submit"
          disabled={saving}
          className="bg-brand-900 text-white px-5 py-2.5 rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Salvando..." : "Salvar configurações"}
        </button>
        {saved && (
          <span className="text-green-700 text-sm">✓ Salvo com sucesso</span>
        )}
        {saveError && <span className="text-red-700 text-sm">{saveError}</span>}
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="font-semibold mb-4">{title}</h2>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
    </div>
  );
}

function Toggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition flex-shrink-0 mt-0.5 ${
          value ? "bg-brand-900" : "bg-gray-300"
        }`}
        role="switch"
        aria-checked={value}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
            value ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
      <div>
        <div className="text-sm font-medium">{label}</div>
        {hint && <p className="text-xs text-gray-500">{hint}</p>}
      </div>
    </div>
  );
}
