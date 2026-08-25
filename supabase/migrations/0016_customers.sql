-- Cadastro local de clientes, sincronizado da Nuvemshop ou criado manualmente.
-- A automacao de aniversario usa birth_date em uma etapa posterior.

create table if not exists customers (
  id uuid primary key default uuid_generate_v4(),
  store_id uuid not null references stores(id) on delete cascade,
  external_customer_id text,
  name text not null,
  email text,
  phone text,
  identification text,
  birth_date date,
  accepts_marketing boolean,
  active boolean not null default true,
  source text not null default 'manual'
    check (source in ('manual', 'nuvemshop', 'order')),
  total_spent numeric(12, 2),
  total_spent_currency text,
  last_order_id text,
  note text,
  nuvemshop_note text,
  default_address jsonb,
  billing_address jsonb,
  extra jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  external_created_at timestamptz,
  external_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, external_customer_id),
  unique (store_id, email)
);

create index if not exists customers_store_name_idx
  on customers (store_id, name);

create index if not exists customers_store_birth_date_idx
  on customers (store_id, birth_date)
  where birth_date is not null;

drop trigger if exists customers_updated_at on customers;
create trigger customers_updated_at before update on customers
  for each row execute function set_updated_at();

alter table customers enable row level security;
