# Avaliações + Kits — Guia do Projeto

Sistema de **avaliações** e **kits de produtos** para lojas Nuvemshop, inspirado no
Lily Reviews (avaliações) e Funsales (kits). Loja em produção: **Essenciarte**.

- **Painel (produção):** https://app.mesafy.shop
- **Repositório:** https://github.com/jeffinwilker/avaliacao
- **Widget na loja:** `https://app.mesafy.shop/widget/avaliacoes-widget.js`

> Este arquivo é a fonte de verdade pra retomar o projeto. Cobre avaliações, kits
> (até peso/dimensões) e as **automações de WhatsApp** (carrinho abandonado +
> pós-venda). Fase 5 de estoque de kit via webhook ainda pendente.

## 0. Estado de continuidade (25/08/2026)

- Branch de trabalho: `main`. A base local foi sincronizada com o Git até
  `61b5acd` antes da entrega atual.
- A entrega atual criou uma biblioteca central em `/automations` com automações
  ativas e pré-definidas, criação em branco por gatilho e cópia dos modelos. Os
  editores focados continuam gravando nas sequências existentes, preservando o
  motor de envio e permitindo até cinco mensagens no carrinho.
- Os editores de mensagem ganharam barra de formatação compatível com WhatsApp
  (negrito, itálico, riscado, monoespaçado e listas). As variáveis de destino
  agora são explícitas: `{{link_carrinho}}`, `{{link_avaliacao}}`,
  `{{link_aniversario}}` e `{{link_rastreio}}`; `{{link}}` continua sendo
  substituída somente para compatibilidade com mensagens antigas.
- O typecheck e o build completo passaram após essas alterações.
- A área Pedidos e envios agora possui a aba **Pedidos**. Ela sincroniza até mil
  compras dos últimos 12 meses, começa filtrada em entregues e permite enviar ou
  reenviar manualmente pelo WhatsApp o convite de avaliação de cada produto. O
  envio reaproveita o template configurado e registra o resultado em
  `review_requests`; avaliações já respondidas não podem ser reenviadas.
- Não foi criada migration nova nesta entrega. Ainda é necessário confirmar no
  ambiente de produção se as migrations `0014_store_members.sql`,
  `0016_customers.sql` e `0017_birthday_collection.sql` já foram executadas.
- Logo antes disso, o commit `78516d2` redesenhou as atividades de carrinhos e
  adicionou envio manual imediato, inclusive para carrinhos antigos e retentativa
  de falhas. Esse envio registra o resultado na linha do tempo e revalida se o
  carrinho ainda está aberto.
- Ao retomar: rode `git status`, `git log -5 --oneline` e leia esta seção. Não
  refaça funcionalidades já descritas como concluídas.
- Próximo passo operacional provável: confirmar/aplicar as migrations pendentes
  no SQL Editor do Supabase e atualizar o VPS com `git pull`, `npm run build` e
  `pm2 restart avaliacoes-admin`.

### Forma de trabalhar neste projeto

- Converse com o usuário em português e use explicações não técnicas sempre que
  possível. Ele prefere que o agente implemente, valide, envie ao Git e entregue os
  comandos curtos de deploy.
- Antes de cada push, rode pelo menos `cd apps/admin && npx tsc --noEmit`; para
  alterações maiores, rode `npm run build` na raiz.
- Migrations são executadas manualmente no SQL Editor do Supabase. Nunca presuma
  que uma migration nova já foi aplicada sem confirmação.
- Nunca versione `.env.local`, tokens, chaves ou senhas. O `AGENTS.md` pode conter
  somente arquitetura, identificadores públicos e instruções operacionais.

---

## 1. Arquitetura

Monorepo com **npm workspaces**:

```
.
├── apps/
│   ├── admin/     # Next.js 15 (App Router) — painel + APIs + webhooks. É o backend de tudo.
│   └── widget/    # Vite (library mode) — bundle JS único embarcado no tema da loja.
├── packages/
│   └── shared/    # Tipos TypeScript + helpers puros compartilhados (@avaliacoes/shared)
├── supabase/
│   └── migrations/  # SQL (rodar manualmente no SQL Editor do Supabase)
├── scripts/copy-widget.mjs   # copia o bundle do widget pra public/ do admin
├── deploy/                    # nginx conf + README de deploy
└── ecosystem.config.cjs       # PM2
```

**Decisão-chave:** não usamos Edge Functions do Supabase. Todo o backend são **API
routes do Next.js** (`apps/admin/src/app/api/...`). Stack única, deploy único.

**Stack:** Next.js 15 + React 18 + Tailwind (admin) · Vite + React 18 (widget) ·
Supabase (Postgres + Auth por e-mail/senha + Storage) · Nuvemshop API · Resend (e-mail) ·
Evolution/Z-API (WhatsApp) · xlsx (import/export).

---

## 2. Como rodar em outro PC

```bash
git clone https://github.com/jeffinwilker/avaliacao.git
cd avaliacao
npm install
```

Depois **crie os dois `.env.local`** (são gitignored — NÃO estão no repo).
Copie-os do PC antigo (pen drive/nuvem) ou recrie com os valores dos painéis:

- `apps/admin/.env.local` — ver seção **6. Variáveis de ambiente**
- `apps/widget/.env.local`

No Codex do novo PC, abra a pasta clonada e diga: **"Leia o AGENTS.md e continue
o projeto a partir do estado de continuidade"**. O Codex carrega este arquivo
automaticamente quando trabalha dentro do repositório.

Rodar:

```bash
npm run dev:admin    # http://localhost:3000
npm run dev:widget   # http://localhost:5173 (modo demo com dados fake se sem Supabase)
```

Build de produção (widget + admin):

```bash
npm run build
```

Typecheck rápido antes de commitar (recomendado — o build do VPS falha em erro de tipo):

```bash
cd apps/admin && npx tsc --noEmit
```

---

## 3. Funcionalidades

### Avaliações (reviews)
- **Widget público** (`apps/widget`): estrelas (com meia-estrela via gradiente SVG),
  lista paginada, filtro por nota, formulário com upload de fotos/vídeos (≤20MB),
  token de pré-verificação vindo do link de e-mail/WhatsApp.
- **Formulário móvel do convite** (`/avaliar/[token]`): a tela de Mensagens do
  pós-venda mostra a mesma página em um celular simulado via `/avaliar/preview`,
  usando produto e cor reais, mas com submissão desativada.
- **Mini-summary** (`data-avaliacoes-summary`): estrelas + "4.5 · N avaliações" com
  scroll até a lista. Usa **batch** (`/api/widget/stats`) pra vitrines/categorias.
- **Reels/stories de produto** (`/reels` + `data-avaliacoes-reels`): vídeos
  verticais por produto, com bolinhas estilo destaque de stories e modal 9:16 no
  widget. O banco guarda metadados em `product_reels`; os arquivos vão para o
  Cloudflare R2 quando `R2_*` estiver configurado, com fallback para o bucket
  Supabase `product-reels` em teste.
- **Clientes** (`/customers`): base local de clientes para relacionamento. Importa
  da Nuvemshop via `GET /customers`, cadastra/edita em modal e também alimenta a
  base por `customer/created|updated|deleted` e pedidos recebidos por webhook. A
  importação em massa aceita CSV/XLS/XLSX, oferece modelo, relação manual de
  colunas, prévia dos erros e atualiza duplicados por e-mail ou telefone. Guarda
  aniversário (`birth_date`), telefone, e-mail, aceite de marketing, total gasto
  e origem (`manual`/`nuvemshop`/`order`). A coleta pós-compra por WhatsApp fica
  em **Automações → Pós-venda → Rotinas**, com mensagem editável, atraso flexível
  e `{{link}}` para a página pública `/cliente/aniversario/[token]`.
  A automação de cupom no dia do aniversário ainda fica como próxima fase.
- **Painel admin**: dashboard, lista com filtros (pendente/aprovada/reprovada),
  detalhe com aprovar/reprovar/responder, configurações (templates, auto-publicar,
  cor da marca), **importação XLSX/CSV** com matching de produto por similaridade
  (Dice/bigramas, `apps/admin/src/lib/match.ts`), export de produtos, modelo de import.

### Kits de produtos
Modelo **A+**: o kit é criado como **produto real na Nuvemshop** (tem página própria,
checkout nativo, frete). O nosso sistema cria/atualiza esse produto automaticamente.

- **CRUD** em `/kits` — nome, produtos incluídos (multi-select com busca), desconto
  (percent / valor fixo / preço total), galeria de imagens (upload pro Storage +
  "usar imagens dos produtos"), descrição com **editor rich-text** (WYSIWYG + código-
  fonte HTML, `apps/admin/src/components/RichTextEditor.tsx`), **peso e dimensões**
  (regra automática: soma peso + maior dimensão, ou custom), duplicar kit.
- **Sync automático** (`apps/admin/src/lib/kit-sync.ts`): ao salvar, cria/atualiza o
  produto-kit na Nuvemshop com preço "de/por" (promotional_price), descrição, galeria,
  categoria "Kits", estoque (min montável) e peso/dimensões. Deletar o kit deleta o
  produto na Nuvemshop.
- **Widget na loja**:
  - `data-avaliacoes-kit` → cards "Compre no kit" nas páginas dos produtos que fazem
    parte de kits (batch `/api/widget/kits`).
  - `data-avaliacoes-kit-items` → lista "Produtos do kit" na página do próprio kit
    (`/api/widget/kit-contents`).

### Integração Nuvemshop
- OAuth (`/api/nuvemshop/callback`) **ou** conexão manual (colar token).
- Sync de produtos (`/api/nuvemshop/sync-products`): nome, descrição, galeria, preço,
  promo, estoque, variant_id, **peso e dimensões**.
- A confirmação de entrega (`tracking_delivered`) cria `review_requests` com delay
  padrão de um dia.

### Usuários da equipe
- Em `/settings`, qualquer usuário logado no painel cria acessos com nome, e-mail
  e senha inicial e pode remover membros. Todos acessam e administram a mesma loja;
  o papel `owner` só identifica o administrador principal e não pode ser removido.
  Vínculos em `store_members`, contas no Supabase Auth.

### Automação de mensagens (WhatsApp/e-mail)
- **Solicitação de avaliação pós-compra**: o webhook cria `review_requests` com delay;
  o cron envia e-mail (Resend) + WhatsApp (Evolution/Z-API).
- **Recuperação de carrinho abandonado** e **mensagem de pós-venda** (`apps/admin/src/lib/automations.ts`):
  carrinhos em `abandoned_carts` e fila em `automation_messages` (migrations 0006/0007/0009/0010/0011/0012),
  consumida de forma concorrente-segura pela RPC `claim_automation_messages`.
  As três áreas da interface são selecionadas por `?section=orders|messages|routines`,
  com abas `/automations/abandoned-carts` e `/automations/post-sale`. Os atrasos
  usam minutos como fonte de verdade e aceitam minutos, horas ou dias na interface.
  Rotinas têm editor visual linear e as mensagens aceitam nenhum anexo, imagem
  dinâmica do produto ou imagem fixa da biblioteca `automation-media`. A rota
  central `/automations` lista as ativas e os modelos pré-definidos, permite
  começar em branco escolhendo o gatilho ou criar a partir de um modelo. Um
  fluxo de carrinho concentra até cinco mensagens; cada gatilho de pós-venda é
  tratado como uma automação ativa independente na biblioteca.
  Etapas de carrinho podem criar um cupom exclusivo de uso único pela Nuvemshop,
  aplicá-lo ao checkout e inserir o código via `{{cupom}}`. Os novos códigos
  usam o prefixo curto `CAR` seguido de um identificador exclusivo. Requer os escopos
  `read_coupons` e `write_coupons`, além de `read_orders`/`write_orders`,
  `read_customers` para importar clientes e `read_fulfillment_orders` para
  rastreio detalhado.
  Antes de cada envio, a fila confirma que o carrinho ainda está abandonado e
  cancela as mensagens atuais e futuras quando o checkout já virou pedido.
  Na lista, cada atividade abre uma prévia por clique e pode ser enviada
  manualmente, inclusive em carrinhos antigos ou como nova tentativa após falha;
  o resultado continua registrado na linha do tempo do carrinho.
  A aba **Pedidos** importa compras anteriores à instalação dos webhooks, mostra
  somente entregues por padrão e oferece o mesmo envio manual por produto para o
  convite de avaliação.
  O webhook `order/created` enfileira a confirmação do pedido; a confirmação de
  entrega cria os pedidos de avaliação; os demais eventos enfileiram as mensagens configuradas
  para cada estado e `order/cancelled` cancela mensagens pendentes.
- Webhooks (`order/created|paid|packed|fulfilled|cancelled`,
  `customer/created|updated|deleted` e eventos de `fulfillment_order` para
  status, etiqueta e rastreio) são **registrados automaticamente**
  ao conectar a loja (OAuth ou manual), quando `NEXT_PUBLIC_APP_URL` é https.
- Tudo processado por `/api/cron/send-requests` (header `x-cron-secret`): sincroniza
  carrinhos, envia automações e processa solicitações de avaliação — idempotente.

---

## 4. Banco de dados (Supabase / Postgres)

Rode as migrations **em ordem** no SQL Editor (idempotentes, usam `if not exists`):

| Migration | Conteúdo |
|---|---|
| `0001_initial.sql` | stores, store_settings, products, orders, order_items, reviews, review_media, review_requests, view `product_review_stats`, RLS público de reviews aprovadas |
| `0002_helpers.sql` | RPC `avg_rating_for_store`, `moderate_review`, `reply_to_review` |
| `0003_kits.sql` | products.price/promotional_price/stock/variant_id, tabelas `kits` + `kit_items`, view `kits_with_items` |
| `0004_kit_media.sql` | products.description/images, kits.images, bucket Storage `kit-media` |
| `0005_kit_dimensions.sql` | products.weight/depth/width/height, kits.dimension_rule + weight/depth/width/height |
| `0006_whatsapp_automations.sql` | store_settings (abandoned_cart_* / post_purchase_*), tabela `automation_messages` + RPC `claim_automation_messages`, índice único de order_items |
| `0007_abandoned_cart_routines.sql` | tabela `abandoned_carts`, sequência JSON de até 5 mensagens e várias tentativas por carrinho |
| `0008_whatsapp_instance.sql` | instância Evolution exclusiva salva por loja |
| `0009_flexible_post_sale_delays.sql` | atrasos de confirmação e avaliação armazenados em minutos |
| `0010_automation_attachments.sql` | biblioteca pública `automation-media` e anexos nas configurações/fila de automação |
| `0011_abandoned_cart_coupons.sql` | código, ID e data de aplicação do cupom por mensagem de carrinho |
| `0012_post_sale_tracking.sql` | sequência de pós-venda por evento, código/link de rastreio, estado atual e histórico da entrega |
| `0013_review_after_delivery.sql` | transfere o gatilho da avaliação para a entrega confirmada e define atraso padrão de um dia |
| `0014_store_members.sql` | vínculo entre contas do Supabase Auth e a loja, com papéis owner/member |
| `0015_product_reels.sql` | tabela `product_reels` e bucket público `product-reels` para reels/stories de produto |
| `0016_customers.sql` | tabela `customers` para clientes importados da Nuvemshop ou cadastrados manualmente |
| `0017_birthday_collection.sql` | configuração da coleta pós-compra de aniversário e tokens em `customer_birthdate_requests` |

**Storage buckets (públicos):** `review-media` (fotos/vídeos de reviews),
`kit-media` (imagens de kit enviadas pelo lojista) e `automation-media`
(imagens fixas usadas nas mensagens automáticas). Para reels, prefira Cloudflare
R2; o bucket Supabase `product-reels` fica como fallback/dev.

**Multi-tenant:** as tabelas têm `store_id`, mas hoje só há **1 loja**. O admin usa o
**service_role** (ignora RLS). O widget lê via endpoints públicos validados por `api_key`.

---

## 5. Deploy (VPS)

- **Servidor:** Ubuntu 24.04, IP `145.223.31.158` (compartilhado com outros 5 apps PM2).
- **Domínio:** `app.mesafy.shop` (registro A na Hostinger → IP; HTTPS via Let's Encrypt/certbot).
- **Pasta:** `/var/www/avaliacoes`
- **Processo PM2:** `avaliacoes-admin` na **porta 3002** (3000/3001/3010 já usadas por
  outros apps — não mudar sem checar `ss -tlnp`).
- **Nginx:** `/etc/nginx/sites-available/avaliacoes` faz proxy `app.mesafy.shop` → `127.0.0.1:3002`.

### Atualizar produção
```bash
cd /var/www/avaliacoes && git pull && npm run build && pm2 restart avaliacoes-admin
```
- `npm run build` regenera o bundle do widget em `apps/admin/public/widget/avaliacoes-widget.js`
  (esse arquivo é **gitignored** — não versionar).
- Se `pm2 restart` falhar com "process not found": `pm2 start ecosystem.config.cjs && pm2 save`.
- Detalhes completos em `deploy/README.md`.

---

## 6. Variáveis de ambiente

**Nunca commitar segredos.** Os `.env.local` são gitignored. Identificadores públicos
(estão no HTML da loja / URLs) podem ficar aqui; segredos, obter no painel.

`apps/admin/.env.local`:
```
# Supabase (URL e anon são públicas; SERVICE_ROLE é SEGREDO)
SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_APP_URL=https://app.mesafy.shop   # em dev: http://localhost:3000

# Nuvemshop (CLIENT_ID=37558 público; CLIENT_SECRET é SEGREDO)
NUVEMSHOP_CLIENT_ID / NUVEMSHOP_CLIENT_SECRET / NUVEMSHOP_WEBHOOK_SECRET

# Envio (ainda não configurados — ver Pendências)
RESEND_API_KEY / RESEND_FROM_EMAIL
WHATSAPP_PROVIDER=evolution / WHATSAPP_API_URL / WHATSAPP_API_KEY / WHATSAPP_INSTANCE

# Cron (SEGREDO — gerar com: openssl rand -hex 32)
CRON_SECRET

# Reels em Cloudflare R2 (recomendado para vídeo; SEGREDOS nos access keys)
R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET
R2_PUBLIC_URL=https://media.seudominio.com
```

`apps/widget/.env.local`:
```
VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
VITE_ADMIN_URL=https://app.mesafy.shop        # em dev: http://localhost:3000
```

**Identificadores da loja (não são segredo — o api_key aparece no HTML da loja):**
- Supabase project ref: `gtsvlrbjwgpzjjiezojh`
- Nuvemshop App (Client ID): `37558`
- `data-store-key` (api_key da loja): `198dc71dd35e4554bd8317ba55009332`

Após editar qualquer `.env.local`, **reinicie o servidor** (Next lê env só no boot).

---

## 7. Snippets do widget (tema Nuvemshop → produto.tpl)

Um único `<script>` cuida de todos os blocos. Cole os `<div>` onde quiser:

```html
<!-- Avaliações (lista completa) -->
<div data-avaliacoes data-product-id="{{ product.id }}"></div>

<!-- Reels/stories do produto -->
<div data-avaliacoes-reels data-product-id="{{ product.id }}"></div>

<!-- Mini-resumo (estrelas + link), perto do preço -->
<div data-avaliacoes-summary data-product-id="{{ product.id }}"></div>

<!-- Card "Compre no kit" (nas páginas dos produtos que compõem kits) -->
<div data-avaliacoes-kit data-product-id="{{ product.id }}"></div>

<!-- Lista "Produtos do kit" (na página do produto-kit) -->
<div data-avaliacoes-kit-items data-product-id="{{ product.id }}"></div>

<!-- Uma vez só, no fim -->
<script src="https://app.mesafy.shop/widget/avaliacoes-widget.js"
        data-store-key="198dc71dd35e4554bd8317ba55009332" async></script>
```

---

## 8. Pega-ratões (erros já resolvidos — não repetir)

- **`.env.local` por app**, não `.env.example` (esse é só template). Next/Vite leem no boot → reiniciar.
- **Copiar chaves do chat mascara com `•`** (bullets unicode) e quebra headers HTTP
  ("non ISO-8859-1"). Colar do painel do Supabase, não do chat.
- **Supabase free pausa** o projeto após ~7 dias sem uso → "Failed to fetch". Restaurar no dashboard.
- **Supabase Auth URL:** Site URL e Redirect URLs precisam apontar pra `https://app.mesafy.shop`
  (senão o magic-link cai em localhost).
- **Relações do Supabase vêm como array** mesmo em 1:1 → usar `pickOne` (`apps/admin/src/lib/pick-one.ts`).
- **Nuvemshop `PUT /products` rejeita o campo `images` (422)** "images must not be present".
  Imagens só no `POST` de criação ou via sub-recurso `/products/{id}/images` (ver `replaceProductImages`).
  Na edição, galeria só é re-enviada se mudou.
- **Widget:** `process is not defined` no browser → `define` no `vite.config.ts` substitui `process.env`.
- **Middleware** deve excluir `/widget` (bundle é público) — senão redireciona pra /login.
- **Callbacks** (OAuth/auth) usam `NEXT_PUBLIC_APP_URL`, não `req.url` (atrás do proxy vira localhost:3002).
- **Porta 3002** (3000/3001/3010 ocupadas). `apps/admin/package.json` "start" = `next start` (sem `-p`);
  a porta vem do `ecosystem.config.cjs` (env PORT).
- **Bundle do widget é gitignored** (regenerado no build). Não commitar `public/widget/*.js`.
- **Import grande travava** → matching pré-computa bigramas do catálogo uma vez + processa em chunks + paginação.
- **Cupons da Nuvemshop aceitam datas sem horário** → `start_date` e `end_date`
  devem usar `YYYY-MM-DD`; a validade configurada em horas precisa ser arredondada
  para dias, com pelo menos o dia seguinte como término.

---

## 9. Pendências / próximos passos

- **Fase 5 dos kits — sync de estoque via webhook:** quando um kit é vendido, baixar o
  estoque dos itens; quando um item é vendido, recalcular o estoque do kit. (Decidido:
  tempo real via webhook. Ainda não implementado.)
- **Configurar envio:** preencher `RESEND_*` e `WHATSAPP_*` no `.env.local` do VPS
  (sem isso, e-mail/WhatsApp não saem). Webhooks já são registrados automaticamente ao
  conectar a loja; há também `/api/nuvemshop/register-webhooks` pra re-registrar.
- **Cron do Linux** chamando `/api/cron/send-requests` a cada 5min com header `x-cron-secret`
  (o `vercel.json` só vale na Vercel; no VPS usar crontab — ver `deploy/README.md` passo 7).
- **Kits antigos** (criados antes de peso/dimensões) precisam ser re-salvos ou re-sincronizados
  (botão "↻" na lista) pra ganhar peso/dimensão.
- **Rotacionar segredos** antes de expor mais (service_role do Supabase e client_secret da
  Nuvemshop apareceram no histórico de desenvolvimento).

---

## 10. Endpoints da API (referência rápida)

Admin (autenticados via Supabase Auth):
`/api/reviews/[id]` (PATCH moderar), `/api/reviews/[id]/reply`, `/api/settings`,
`/api/products/list|count|export|details`, `/api/import/reviews|template`,
`/api/kits` (GET/POST), `/api/kits/[id]` (GET/PUT/DELETE), `/api/kits/[id]/sync`,
`/api/kits/[id]/duplicate`, `/api/kits/upload-image`,
`/api/automations/run` (POST — dispara o cron manualmente),
`/api/automations/abandoned-cart-routine`, `/api/automations/post-sale-routine`,
`/api/automations/abandoned-cart-manual-send`,
`/api/automations/review-request-manual-send`, `/api/automations/sync-orders`,
`/api/reels` (POST), `/api/reels/[id]` (PUT/DELETE), `/api/reels/upload-video`,
`/api/customers` (POST), `/api/customers/[id]` (PUT/DELETE),
`/api/customers/import` (POST em massa),
`/api/customers/import/template` (modelo XLSX),
`/api/customers/birthday-settings` (PUT),
`/api/team-users` (POST criar / DELETE remover membro),
`/api/nuvemshop/connect-manual|callback|disconnect|sync-products`,
`/api/nuvemshop/sync-customers`, `/api/nuvemshop/register-webhooks`,
`/api/nuvemshop/check-automation-access`.

Públicos (validados por `api_key`, com CORS):
`/api/widget/submit` (POST review + mídia), `/api/widget/stats` (batch),
`/api/widget/kits` (batch), `/api/widget/kit-contents`, `/api/widget/reels`.

Webhook/cron: `/api/nuvemshop/webhook`, `/api/cron/send-requests`.
Público com token: `/cliente/aniversario/[token]` e `/api/customer-birthdate/[token]`.
Estáticos servidos pelo Next: `/widget/avaliacoes-widget.js`, `/preview/frame` (preview do widget).
