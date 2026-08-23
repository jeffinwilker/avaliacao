-- ============================================================================
-- Carrinhos abandonados + rotina com várias mensagens personalizáveis
-- ============================================================================

alter table store_settings
  add column if not exists abandoned_cart_sequence jsonb not null default '[]'::jsonb;

-- Preserva a configuração de mensagem única criada na migration 0006.
update store_settings
set abandoned_cart_sequence = jsonb_build_array(
  jsonb_build_object(
    'id', 'step-1',
    'delay_hours', abandoned_cart_delay_hours,
    'message_template', coalesce(
      abandoned_cart_whatsapp_template,
      $message$Oi {{nome}}! 👋

Vimos que você deixou *{{produtos}}* no carrinho da {{loja}}.

Seu carrinho ainda está disponível. Para continuar a compra, acesse:
{{link}}

Se precisar de ajuda, é só responder esta mensagem. 💛$message$
    ),
    'enabled', true
  )
)
where abandoned_cart_sequence = '[]'::jsonb;

alter table store_settings
  alter column abandoned_cart_sequence set default
  '[{"id":"step-1","delay_hours":8,"message_template":"Oi {{nome}}! 👋\n\nVimos que você deixou *{{produtos}}* no carrinho da {{loja}}.\n\nSeu carrinho ainda está disponível. Para continuar a compra, acesse:\n{{link}}\n\nSe precisar de ajuda, é só responder esta mensagem. 💛","enabled":true}]'::jsonb;

create table if not exists abandoned_carts (
  id uuid primary key default uuid_generate_v4(),
  store_id uuid not null references stores(id) on delete cascade,
  external_checkout_id text not null,
  source_token text,
  customer_name text not null default 'Cliente',
  customer_email text,
  customer_phone text,
  checkout_url text,
  products jsonb not null default '[]'::jsonb,
  products_summary text not null default '',
  subtotal numeric(12, 2),
  total numeric(12, 2),
  currency text not null default 'BRL',
  status text not null default 'abandoned'
    check (status in ('abandoned', 'recovered', 'completed')),
  nuvemshop_created_at timestamptz not null,
  nuvemshop_updated_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, external_checkout_id)
);

create index if not exists abandoned_carts_store_created_idx
  on abandoned_carts (store_id, nuvemshop_created_at desc);

create index if not exists abandoned_carts_store_token_idx
  on abandoned_carts (store_id, source_token);

drop trigger if exists abandoned_carts_updated_at on abandoned_carts;
create trigger abandoned_carts_updated_at before update on abandoned_carts
  for each row execute function set_updated_at();

-- A tabela contém dados pessoais do checkout. Somente o backend com
-- service_role deve acessá-la; não há políticas públicas.
alter table abandoned_carts enable row level security;

alter table automation_messages
  add column if not exists routine_step_key text not null default 'default',
  add column if not exists sequence_step int not null default 1
    check (sequence_step between 1 and 10);

update automation_messages
set routine_step_key = 'step-1'
where automation_type = 'abandoned_cart'
  and routine_step_key = 'default';

alter table automation_messages
  drop constraint if exists automation_messages_store_id_automation_type_external_reference_key;

create unique index if not exists automation_messages_store_type_reference_step_unique
  on automation_messages (
    store_id,
    automation_type,
    external_reference,
    routine_step_key
  );

create index if not exists automation_messages_store_reference_idx
  on automation_messages (store_id, automation_type, external_reference);
