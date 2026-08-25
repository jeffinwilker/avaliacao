-- ============================================================================
-- Coleta de aniversario pos-compra
-- ============================================================================

alter table store_settings
  add column if not exists birthday_collection_enabled boolean not null default false,
  add column if not exists birthday_collection_delay_minutes int not null default 1440,
  add column if not exists birthday_collection_whatsapp_template text;

do $$
begin
  alter table store_settings
    add constraint store_settings_birthday_collection_delay_minutes_check
    check (birthday_collection_delay_minutes between 0 and 43200);
exception
  when duplicate_object then null;
end $$;

alter table automation_messages
  drop constraint if exists automation_messages_automation_type_check;

alter table automation_messages
  add constraint automation_messages_automation_type_check
  check (automation_type in ('abandoned_cart', 'post_purchase', 'birthday_collection'));

create table if not exists customer_birthdate_requests (
  id uuid primary key default uuid_generate_v4(),
  store_id uuid not null references stores(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  order_id uuid references orders(id) on delete set null,
  external_order_id text,
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  status text not null default 'pending'
    check (status in ('pending', 'completed', 'cancelled', 'expired')),
  scheduled_for timestamptz,
  sent_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_birthdate_requests_token_idx
  on customer_birthdate_requests (token);

create index if not exists customer_birthdate_requests_store_status_idx
  on customer_birthdate_requests (store_id, status);

create unique index if not exists customer_birthdate_requests_pending_unique
  on customer_birthdate_requests (store_id, customer_id)
  where status = 'pending';

drop trigger if exists customer_birthdate_requests_updated_at on customer_birthdate_requests;
create trigger customer_birthdate_requests_updated_at before update on customer_birthdate_requests
  for each row execute function set_updated_at();

-- Contem dados pessoais e tokens publicos. Somente o backend com service_role
-- deve acessar diretamente; a pagina publica valida pelo token.
alter table customer_birthdate_requests enable row level security;
