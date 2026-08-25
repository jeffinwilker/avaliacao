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

Para automações de carrinho abandonado e pós-venda, o aplicativo precisa das
permissões `read_orders`, `write_orders`, `read_fulfillment_orders`,
`read_coupons` e `write_coupons`, dos
webhooks de pedido registrados e do cron configurado conforme `deploy/README.md`.

As telas de automação separam **Pedidos e envios**, **Mensagens** e **Rotinas**,
sempre com abas para carrinho abandonado e pós-venda. A recuperação armazena os
carrinhos identificados dos últimos 30 dias e permite montar uma rotina com até
cinco mensagens de WhatsApp, com atrasos a partir de 10 minutos. O editor de rotinas
mostra o fluxo visualmente como gatilho, espera e mensagem. Cada mensagem pode sair
sem anexo, com a imagem do produto ou com uma imagem fixa enviada para a biblioteca.
Uma etapa também pode criar um cupom exclusivo de uso único, aplicá-lo ao checkout
abandonado e inserir o código na mensagem com `{{cupom}}`.
Antes de cada mensagem, o fluxo confirma que o checkout ainda não virou pedido;
se ele já foi fechado, a etapa atual e as próximas são canceladas.
Ao ativar a rotina ou alterar o tempo de uma etapa, o novo prazo passa a valer
para carrinhos criados depois da alteração, evitando disparos retroativos em massa.
Os atrasos podem ser informados em minutos, horas ou dias. Para usar essa versão,
execute também as migrations `0007_abandoned_cart_routines.sql`,
`0009_flexible_post_sale_delays.sql`, `0010_automation_attachments.sql`,
`0011_abandoned_cart_coupons.sql`, `0012_post_sale_tracking.sql` e
`0013_review_after_delivery.sql`.

O pós-venda também reage aos estados de preparação, despacho e rastreamento
recebidos pela Nuvemshop. Cada estado pode ter mensagem, atraso e anexo próprios,
com as variáveis `{{codigo_rastreio}}`, `{{link_rastreio}}` e
`{{status_entrega}}`. A lista de pedidos mostra o código e a linha do tempo da
entrega. Os eventos detalhados dependem de a transportadora alimentar o rastreio
na Nuvemshop.
O convite de avaliação é criado somente quando a entrega é confirmada e, por
padrão, fica agendado para o dia seguinte.

Cole no tema da loja (Configurações → HTML/CSS → produto.tpl):

```html
<div id="avaliacoes-widget" data-product-id="{{ product.id }}"></div>
<script src="https://seu-cdn.com/avaliacoes-widget.js" data-store-key="SUA_API_KEY"></script>
```
