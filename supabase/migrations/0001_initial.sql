-- ============================================================================
-- Schema inicial — Sistema de Avaliações
-- ============================================================================

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- stores: cada loja conectada (multi-tenant)
-- ----------------------------------------------------------------------------
create table stores (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  platform text not null check (platform in ('nuvemshop', 'tray', 'custom')),
  external_store_id text not null,
  access_token text,
  api_key text unique not null default replace(uuid_generate_v4()::text, '-', ''),
  domain text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform, external_store_id)
);

-- ----------------------------------------------------------------------------
-- store_settings: configurações por loja (templates, automação, branding)
-- ----------------------------------------------------------------------------
create table store_settings (
  store_id uuid primary key references stores(id) on delete cascade,
  auto_publish boolean not null default false,
  request_delay_days int not null default 7,
  email_enabled boolean not null default true,
  whatsapp_enabled boolean not null default false,
  email_subject text default 'Conta pra gente o que achou da sua compra?',
  email_template text,
  whatsapp_template text,
  brand_color text default '#111827',
  allow_media boolean not null default true,
  max_media_per_review int not null default 5,
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- products: produtos sincronizados da plataforma
-- ----------------------------------------------------------------------------
create table products (
  id uuid primary key default uuid_generate_v4(),
  store_id uuid not null references stores(id) on delete cascade,
  external_product_id text not null,
  name text not null,
  image_url text,
  url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, external_product_id)
);

create index products_store_idx on products (store_id);

-- ----------------------------------------------------------------------------
-- orders: pedidos (sincronizados via webhook da Nuvemshop)
-- ----------------------------------------------------------------------------
create table orders (
  id uuid primary key default uuid_generate_v4(),
  store_id uuid not null references stores(id) on delete cascade,
  external_order_id text not null,
  customer_name text not null,
  customer_email text,
  customer_phone text,
  status text not null,
  ordered_at timestamptz not null,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  unique (store_id, external_order_id)
);

create index orders_store_status_idx on orders (store_id, status);

-- ----------------------------------------------------------------------------
-- order_items: itens de cada pedido (saber quais produtos avaliar)
-- ----------------------------------------------------------------------------
create table order_items (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  quantity int not null default 1
);

create index order_items_order_idx on order_items (order_id);

-- ----------------------------------------------------------------------------
-- reviews: avaliações dos clientes
-- ----------------------------------------------------------------------------
create table reviews (
  id uuid primary key default uuid_generate_v4(),
  store_id uuid not null references stores(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  order_id uuid references orders(id) on delete set null,
  customer_name text not null,
  customer_email text,
  rating int not null check (rating between 1 and 5),
  title text,
  comment text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  verified_purchase boolean not null default false,
  reply text,
  replied_at timestamptz,
  created_at timestamptz not null default now(),
  moderated_at timestamptz,
  moderation_note text
);

create index reviews_product_status_idx on reviews (product_id, status, created_at desc);
create index reviews_store_status_idx on reviews (store_id, status, created_at desc);

-- ----------------------------------------------------------------------------
-- review_media: fotos e vídeos anexados às avaliações
-- ----------------------------------------------------------------------------
create table review_media (
  id uuid primary key default uuid_generate_v4(),
  review_id uuid not null references reviews(id) on delete cascade,
  type text not null check (type in ('image', 'video')),
  storage_path text not null,
  url text,
  width int,
  height int,
  ordering int not null default 0,
  created_at timestamptz not null default now()
);

create index review_media_review_idx on review_media (review_id, ordering);

-- ----------------------------------------------------------------------------
-- review_requests: jobs de solicitação (e-mail e WhatsApp)
-- ----------------------------------------------------------------------------
create table review_requests (
  id uuid primary key default uuid_generate_v4(),
  store_id uuid not null references stores(id) on delete cascade,
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  channel text not null check (channel in ('email', 'whatsapp')),
  status text not null default 'scheduled' check (status in ('scheduled', 'sent', 'failed', 'cancelled', 'completed')),
  scheduled_for timestamptz not null,
  sent_at timestamptz,
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  error_message text,
  attempts int not null default 0,
  created_at timestamptz not null default now()
);

create index review_requests_status_scheduled_idx on review_requests (status, scheduled_for);
create index review_requests_token_idx on review_requests (token);

-- ----------------------------------------------------------------------------
-- View: agregados por produto (para exibir no widget)
-- ----------------------------------------------------------------------------
create or replace view product_review_stats as
select
  product_id,
  count(*) filter (where status = 'approved') as total_reviews,
  round(avg(rating) filter (where status = 'approved')::numeric, 2) as average_rating,
  count(*) filter (where status = 'approved' and rating = 5) as rating_5,
  count(*) filter (where status = 'approved' and rating = 4) as rating_4,
  count(*) filter (where status = 'approved' and rating = 3) as rating_3,
  count(*) filter (where status = 'approved' and rating = 2) as rating_2,
  count(*) filter (where status = 'approved' and rating = 1) as rating_1
from reviews
group by product_id;

-- ----------------------------------------------------------------------------
-- Trigger: updated_at automático
-- ----------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger stores_updated_at before update on stores
  for each row execute function set_updated_at();
create trigger store_settings_updated_at before update on store_settings
  for each row execute function set_updated_at();
create trigger products_updated_at before update on products
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- Storage bucket para mídia das reviews
-- (criar no painel: bucket "review-media" público com leitura, upload via service role)
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- RLS — ligar quando widget for público; admin usa service role e ignora RLS
-- ----------------------------------------------------------------------------
alter table reviews enable row level security;
alter table review_media enable row level security;
alter table products enable row level security;

-- Leitura pública apenas de reviews aprovadas
create policy "public read approved reviews"
  on reviews for select
  using (status = 'approved');

create policy "public read review media of approved reviews"
  on review_media for select
  using (exists (select 1 from reviews r where r.id = review_id and r.status = 'approved'));

create policy "public read products"
  on products for select
  using (true);
