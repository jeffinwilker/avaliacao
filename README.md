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

# 3. Subir schema do banco (rode o SQL em supabase/migrations/0001_initial.sql no SQL Editor)
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

Cole no tema da loja (Configurações → HTML/CSS → produto.tpl):

```html
<div id="avaliacoes-widget" data-product-id="{{ product.id }}"></div>
<script src="https://seu-cdn.com/avaliacoes-widget.js" data-store-key="SUA_API_KEY"></script>
```
