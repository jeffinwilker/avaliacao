-- ============================================================================
-- Automações de WhatsApp: carrinho abandonado e mensagem de pós-venda
-- ============================================================================

alter table store_settings
  add column if not exists abandoned_cart_enabled boolean not null default false,
  add column if not exists abandoned_cart_delay_hours int not null default 8
    check (abandoned_cart_delay_hours between 6 and 168),
  add column if not exists abandoned_cart_whatsapp_template text,
  add column if not exists post_purchase_enabled boolean not null default false,
  add column if not exists post_purchase_delay_hours int not null default 24
    check (post_purchase_delay_hours between 0 and 720),
  add column if not exists post_purchase_whatsapp_template text;

create table if not exists automation_messages (
  id uuid primary key default uuid_generate_v4(),
  store_id uuid not null references stores(id) on delete cascade,
  automation_type text not null
    check (automation_type in ('abandoned_cart', 'post_purchase')),
  external_reference text not null,
  reference_label text,
  source_token text,
  customer_name text not null default 'Cliente',
  customer_phone text not null,
  products_summary text not null,
  link text,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'processing', 'sent', 'failed', 'cancelled')),
  scheduled_for timestamptz not null,
  sent_at timestamptz,
  attempts int not null default 0,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, automation_type, external_reference)
);

create index if not exists automation_messages_status_scheduled_idx
  on automation_messages (status, scheduled_for);

create index if not exists automation_messages_store_token_idx
  on automation_messages (store_id, source_token);

create unique index if not exists order_items_order_product_unique
  on order_items (order_id, product_id);

drop trigger if exists automation_messages_updated_at on automation_messages;
create trigger automation_messages_updated_at before update on automation_messages
  for each row execute function set_updated_at();

-- A tabela contém telefone e nome do cliente. Somente o backend com service_role
-- deve acessá-la; não há políticas públicas.
alter table automation_messages enable row level security;

create or replace function claim_automation_messages(p_limit int default 50)
returns setof automation_messages
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update automation_messages as message
  set status = 'processing', updated_at = now()
  where message.id in (
    select candidate.id
    from automation_messages as candidate
    where (
      candidate.status = 'scheduled'
      and candidate.scheduled_for <= now()
      and candidate.attempts < 5
    ) or (
      candidate.status = 'processing'
      and candidate.updated_at < now() - interval '15 minutes'
      and candidate.attempts < 5
    )
    order by candidate.scheduled_for asc
    for update skip locked
    limit greatest(1, least(p_limit, 100))
  )
  returning message.*;
end;
$$;

revoke all on function claim_automation_messages(int) from public, anon, authenticated;
grant execute on function claim_automation_messages(int) to service_role;
