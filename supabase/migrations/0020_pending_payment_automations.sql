-- ============================================================================
-- Recuperação de pedidos com pagamento Pix pendente
-- ============================================================================

alter table store_settings
  add column if not exists pending_payment_enabled boolean not null default false,
  add column if not exists pending_payment_sequence jsonb not null default '[]'::jsonb;

update store_settings
set pending_payment_sequence = jsonb_build_array(
  jsonb_build_object(
    'id', 'step-1',
    'delay_minutes', 30,
    'message_template', $message$Oi {{nome}}! 👋

O Pix do pedido *#{{pedido}}* na {{loja}} ainda está aguardando pagamento.

Você pode abrir a página segura do pedido e tentar pagar novamente por aqui:
{{link_pagamento}}

Se precisar de ajuda, é só responder esta mensagem. 💛$message$,
    'enabled', true,
    'active_since', null,
    'attachment_type', 'none',
    'attachment_url', null,
    'coupon_enabled', false,
    'coupon_type', 'percentage',
    'coupon_value', 10,
    'coupon_valid_hours', 48,
    'coupon_min_price', null
  )
)
where pending_payment_sequence = '[]'::jsonb;

alter table orders
  add column if not exists order_number text,
  add column if not exists source_token text,
  add column if not exists order_status_url text,
  add column if not exists payment_method text,
  add column if not exists products_summary text,
  add column if not exists product_image_url text,
  add column if not exists total numeric(12,2),
  add column if not exists currency text not null default 'BRL',
  add column if not exists paid_at timestamptz;

create index if not exists orders_store_payment_status_idx
  on orders (store_id, payment_status, ordered_at desc);

alter table automation_messages
  drop constraint if exists automation_messages_automation_type_check;

alter table automation_messages
  add constraint automation_messages_automation_type_check
  check (
    automation_type in (
      'abandoned_cart',
      'post_purchase',
      'birthday_collection',
      'pending_payment'
    )
  );
