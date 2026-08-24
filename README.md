# Avaliações

Sistema de avaliações para lojas online (Nuvemshop / Tray), inspirado em Lily Reviews.

## Estrutura

```
.
├── apps/
│   ├── admin/         # Painel admin (Next.js 15 + Tailwind)
│   └── widget/        # Widget público embarcável (Vite — library mode)
├── packages/
│   └── shared/        # Tipos TypeScript compartilhados
└── supabase/
    └── migrations/    # Schema SQL
```

## Pré-requisitos

- Node 20+
- Conta no [Supabase](https://supabase.com) (plano grátis)
- Conta no [Resend](https://resend.com) (e-mail)
- Servidor com [Evolution API](https://evolution-api.com/) ou conta na [Z-API](https://z-api.io/) (WhatsApp)

## Setup inicial

```bash
# 1. Instalar dependências
npm install

# 2. Copiar variáveis de ambiente
cp .env.example .env
# edite .env com suas chaves

# 3. Subir o banco (rode todos os arquivos de supabase/migrations em ordem no SQL Editor)
```

## Rodar em desenvolvimento

```bash
npm run dev:admin    # painel admin em http://localhost:3000
npm run dev:widget   # widget em http://localhost:5173
```

## Build de produção

```bash
npm run build
```

O bundle do widget fica em `apps/widget/dist/avaliacoes-widget.js` — esse arquivo é hospedado num CDN e injetado na Nuvemshop via script tag.

## Integração na Nuvemshop

Para automações de carrinho abandonado e pós-venda, o aplicativo precisa da
permissão `read_orders`, dos webhooks de pedido registrados e do cron configurado
conforme `deploy/README.md`.

As telas de automação separam carrinhos abandonados e pós-venda. A recuperação
armazena os carrinhos identificados dos últimos 30 dias e permite montar uma
rotina com até cinco mensagens de WhatsApp, com atrasos a partir de 10 minutos.
Ao ativar a rotina ou alterar o tempo de uma etapa, o novo prazo passa a valer
para carrinhos criados depois da alteração, evitando disparos retroativos em massa.
Para usar essa versão, execute também a migration
`0007_abandoned_cart_routines.sql`.

Cole no tema da loja (Configurações → HTML/CSS → produto.tpl):

```html
<div id="avaliacoes-widget" data-product-id="{{ product.id }}"></div>
<script src="https://seu-cdn.com/avaliacoes-widget.js" data-store-key="SUA_API_KEY"></script>
```
