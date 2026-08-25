-- ============================================================================
-- Pós-venda orientado por eventos de pedido e rastreio
-- ============================================================================

alter table store_settings
  add column if not exists post_sale_sequence jsonb not null default '[]'::jsonb;

-- Preserva a confirmação de pedido já configurada nas versões anteriores.
update store_settings
set post_sale_sequence = jsonb_build_array(
  jsonb_build_object(
    'id', 'order_created',
    'delay_minutes', coalesce(post_purchase_delay_minutes, post_purchase_delay_hours * 60, 0),
    'message_template', coalesce(
      post_purchase_whatsapp_template,
      $message$Oi {{nome}}! 💛

Recebemos seu pedido *#{{pedido}}* na {{loja}} com: {{produtos}}.

Estamos preparando tudo com carinho. Se precisar falar com a gente, é só responder esta mensagem.$message$
    ),
    'enabled', post_purchase_enabled,
    'attachment_type', coalesce(post_purchase_attachment_type, 'none'),
    'attachment_url', post_purchase_attachment_url
  )
)
where post_sale_sequence = '[]'::jsonb;

alter table orders
  add column if not exists payment_status text,
  add column if not exists shipping_status text,
  add column if not exists fulfillment_status text,
  add column if not exists tracking_status text,
  add column if not exists shipping_tracking_number text,
  add column if not exists shipping_tracking_url text,
  add column if not exists tracking_updated_at timestamptz;

alter table automation_messages
  add column if not exists tracking_code text,
  add column if not exists tracking_status text;

create table if not exists order_delivery_events (
  id uuid primary key default uuid_generate_v4(),
  store_id uuid not null references stores(id) on delete cascade,
  order_id uuid not null references orders(id) on delete cascade,
  external_event_key text not null,
  event_type text not null,
  status text not null,
  description text,
  tracking_number text,
  tracking_url text,
  happened_at timestamptz,
  created_at timestamptz not null default now(),
  unique (store_id, external_event_key)
);

create index if not exists order_delivery_events_order_created_idx
  on order_delivery_events (order_id, created_at desc);

-- Contém dados operacionais do pedido e é acessada somente pelo backend.
alter table order_delivery_events enable row level security;

