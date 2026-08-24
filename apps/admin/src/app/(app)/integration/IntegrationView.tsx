"use client";

import { useEffect, useState } from "react";

interface Store {
  id: string;
  name: string;
  external_store_id: string;
  api_key: string;
  domain: string | null;
  created_at: string;
}

export function IntegrationView({
  store,
  installUrl,
}: {
  store: Store | null;
  installUrl: string | null;
}) {
  return store ? (
    <Connected store={store} installUrl={installUrl} />
  ) : (
    <Connect installUrl={installUrl} />
  );
}

function Connect({ installUrl }: { installUrl: string | null }) {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold mb-3">Como conectar</h2>
        <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700">
          <li>
            Crie uma conta grátis em{" "}
            <a
              href="https://partners.nuvemshop.com.br"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              partners.nuvemshop.com.br
            </a>{" "}
            (Parceiros).
          </li>
          <li>
            Crie um App privado. Em <em>URL de redirecionamento</em>, coloque:
            <code className="block mt-1 bg-gray-100 px-3 py-2 rounded text-xs font-mono">
              {typeof window !== "undefined" ? window.location.origin : ""}
              /api/nuvemshop/callback
            </code>
          </li>
          <li>
            Pegue o link de instalação do App e abra ele aqui no navegador
            logado na sua loja. Você vai autorizar uma vez e estamos prontos.
          </li>
        </ol>

        <div className="mt-5">
          {installUrl ? (
            <a
              href={installUrl}
              className="inline-block bg-brand-900 text-white px-5 py-2.5 rounded-lg font-medium hover:opacity-90"
            >
              Conectar minha loja Nuvemshop
            </a>
          ) : (
            <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
              Preencha <code>NUVEMSHOP_CLIENT_ID</code> em{" "}
              <code>apps/admin/.env.local</code> e reinicie o servidor para
              habilitar o botão de conexão.
            </div>
          )}
        </div>
      </div>

      <ManualConnect />
    </div>
  );
}

function ManualConnect() {
  const [storeId, setStoreId] = useState("");
  const [token, setToken] = useState("");
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const res = await fetch("/api/nuvemshop/connect-manual", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        external_store_id: storeId,
        access_token: token,
        name,
        domain,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "Falha ao conectar.");
      return;
    }
    window.location.reload();
  }

  return (
    <details className="bg-white rounded-xl border border-gray-200 p-6">
      <summary className="font-semibold cursor-pointer">
        Conectar manualmente (avançado)
      </summary>
      <p className="text-sm text-gray-600 mt-3">
        Se você já obteve o <code>access_token</code> e <code>store_id</code> da
        Nuvemshop (via Postman ou outro fluxo), cole aqui.
      </p>
      <form onSubmit={submit} className="space-y-3 mt-4">
        <Input label="ID da loja (store_id)" value={storeId} onChange={setStoreId} required />
        <Input label="Nome da loja" value={name} onChange={setName} required />
        <Input label="Domínio (opcional)" value={domain} onChange={setDomain} placeholder="minhaloja.com.br" />
        <Input
          label="Access token"
          value={token}
          onChange={setToken}
          required
          type="password"
        />
        {error && (
          <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg border border-red-200">
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={saving}
          className="bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-900 disabled:opacity-50"
        >
          {saving ? "Conectando..." : "Salvar conexão"}
        </button>
      </form>
    </details>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
  required,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
      />
    </div>
  );
}

function Connected({
  store,
  installUrl,
}: {
  store: Store;
  installUrl: string | null;
}) {
  const scriptTag = `<div data-avaliacoes data-product-id="{{ product.id }}"></div>
<script
  src="${typeof window !== "undefined" ? window.location.origin : ""}/widget/avaliacoes-widget.js"
  data-store-key="${store.api_key}"
  async
></script>`;

  return (
    <div className="space-y-6">
      <div className="bg-green-50 border border-green-200 rounded-xl p-5">
        <div className="font-semibold text-green-800 mb-1">
          ✓ Loja conectada
        </div>
        <div className="text-sm text-green-900">
          {store.name}{" "}
          {store.domain && (
            <span className="text-green-700">— {store.domain}</span>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold mb-2">Instalar widget no tema</h2>
        <p className="text-sm text-gray-600 mb-3">
          Cole o código abaixo no template do produto (no admin da Nuvemshop:{" "}
          <em>Loja virtual → Editar HTML/CSS → produto.tpl</em>).
        </p>
        <textarea
          readOnly
          rows={6}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono bg-gray-50"
          value={scriptTag}
          onClick={(e) => (e.target as HTMLTextAreaElement).select()}
        />
      </div>

      <SyncSection />

      <WebhookSection installUrl={installUrl} />

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold mb-3">Zona de risco</h2>
        <button
          onClick={async () => {
            if (!confirm("Tem certeza? Isso desconecta a loja.")) return;
            const res = await fetch("/api/nuvemshop/disconnect", { method: "POST" });
            if (res.ok) window.location.reload();
          }}
          className="border border-red-300 text-red-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-50"
        >
          Desconectar loja
        </button>
      </div>
    </div>
  );
}

function WebhookSection({ installUrl }: { installUrl: string | null }) {
  const [state, setState] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [access, setAccess] = useState<{
    checking: boolean;
    orders: boolean;
    coupons: boolean;
  }>({ checking: true, orders: false, coupons: false });

  useEffect(() => {
    fetch("/api/nuvemshop/check-automation-access")
      .then((res) => res.json())
      .then((json) => {
        setAccess({
          checking: false,
          orders: json.read_orders === true,
          coupons: json.coupons === true,
        });
      })
      .catch(() => setAccess({ checking: false, orders: false, coupons: false }));
  }, []);

  async function register() {
    setState("saving");
    setError(null);
    const res = await fetch("/api/nuvemshop/register-webhooks", { method: "POST" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error || "Não foi possível registrar os webhooks");
      setState("error");
      return;
    }
    setState("done");
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="font-semibold mb-1">Automações de pedidos</h2>
      <p className="text-sm text-gray-600 mb-4">
        Registre os eventos de pedido para cancelar carrinhos recuperados e agendar
        mensagens de pós-venda automaticamente.
      </p>
      {access.checking && (
        <p className="text-sm text-gray-500 mb-4">Verificando permissões...</p>
      )}
      {!access.checking && access.orders && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
          ✓ A permissão <code>read_orders</code> está ativa.
        </p>
      )}
      {!access.checking && !access.orders && (
        <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
          <p>
            Adicione a permissão <code>read_orders</code> no aplicativo Nuvemshop e
            atualize a autorização antes de ativar estas automações.
          </p>
          {installUrl && (
            <a href={installUrl} className="inline-block underline font-medium mt-2">
              Atualizar autorização da loja
            </a>
          )}
        </div>
      )}
      {!access.checking && access.coupons && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
          ✓ O acesso aos cupons está ativo. Para criar os códigos automáticos, mantenha também <code>write_coupons</code> habilitada no aplicativo.
        </p>
      )}
      {!access.checking && !access.coupons && (
        <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
          <p>
            Ative <code>read_coupons</code> e <code>write_coupons</code> no aplicativo Nuvemshop para criar e aplicar cupons automáticos.
          </p>
          {installUrl && (
            <a href={installUrl} className="inline-block underline font-medium mt-2">
              Atualizar autorização da loja
            </a>
          )}
        </div>
      )}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={register}
          disabled={state === "saving" || !access.orders}
          className="bg-brand-900 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
        >
          {state === "saving" ? "Registrando..." : "Registrar webhooks"}
        </button>
        {state === "done" && (
          <span className="text-sm text-green-700">✓ Webhooks registrados</span>
        )}
      </div>
      {error && <p className="text-sm text-red-700 mt-3">{error}</p>}
    </div>
  );
}

// ==================== SyncSection ====================
// Botão de sincronização com feedback visual real: spinner, contagem
// atual, contagem sincronizada, mensagem de erro.

function SyncSection() {
  const [state, setState] = useState<"idle" | "syncing" | "done" | "error">("idle");
  const [current, setCurrent] = useState<number | null>(null);
  const [synced, setSynced] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Busca a contagem atual quando o componente monta
  useEffect(() => {
    fetch("/api/products/count")
      .then((r) => r.json())
      .then((j) => setCurrent(j.count ?? 0))
      .catch(() => {});
  }, []);

  async function sync() {
    setState("syncing");
    setError(null);
    setSynced(null);
    try {
      const res = await fetch("/api/nuvemshop/sync-products", { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Falha ao sincronizar");
        setState("error");
        return;
      }
      setSynced(json.count ?? 0);
      setCurrent(json.count ?? 0);
      setState("done");
    } catch (err) {
      setError((err as Error).message);
      setState("error");
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
        <div>
          <h2 className="font-semibold mb-1">Catálogo de produtos</h2>
          <p className="text-sm text-gray-600">
            {current === null
              ? "Carregando contagem..."
              : current === 0
              ? "Nenhum produto sincronizado ainda."
              : `${current} produto${current !== 1 ? "s" : ""} no sistema.`}
          </p>
        </div>
        <button
          onClick={sync}
          disabled={state === "syncing"}
          className="bg-brand-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-60 inline-flex items-center gap-2"
        >
          {state === "syncing" ? (
            <>
              <Spinner /> Sincronizando...
            </>
          ) : (
            "Sincronizar com Nuvemshop"
          )}
        </button>
      </div>

      {state === "syncing" && (
        <div className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-3">
          Buscando produtos na Nuvemshop e salvando no banco. Isso pode levar
          alguns segundos por página (a Nuvemshop tem paginação de 200 por vez).
        </div>
      )}

      {state === "done" && synced !== null && (
        <div className="text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg p-3">
          ✓ Sincronização concluída — <strong>{synced}</strong> produto
          {synced !== 1 ? "s" : ""} atualizado{synced !== 1 ? "s" : ""}.
        </div>
      )}

      {state === "error" && error && (
        <div className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg p-3">
          ✕ {error}
        </div>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <span
      className="inline-block w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin"
      aria-hidden
    />
  );
}
