-- ============================================================================
-- Kits — agrupar produtos com desconto, sincronizado como produto-kit
-- na Nuvemshop (com preço promocional automático).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Ampliar products: guardar preço e estoque pra calcular kits
-- ----------------------------------------------------------------------------
alter table products
  add column if not exists price numeric(10, 2),
  add column if not exists promotional_price numeric(10, 2),
  add column if not exists stock int,
  add column if not exists variant_id text;
  -- variant_id: ID da variante principal na Nuvemshop (preço/estoque vem por variante)

comment on column products.price is 'Preço regular da variante principal';
comment on column products.promotional_price is 'Preço promocional (opcional)';
comment on column products.stock is 'Estoque atual da variante principal';
comment on column products.variant_id is 'ID da variante principal na plataforma externa';

-- ----------------------------------------------------------------------------
-- kits — cada kit é sincronizado como produto-kit na Nuvemshop
-- ----------------------------------------------------------------------------
create table if not exists kits (
  id uuid primary key default uuid_generate_v4(),
  store_id uuid not null references stores(id) on delete cascade,
  name text not null,
  description text,
  image_url text,
  -- Tipo de desconto:
  --   percent → discount_value é 0-100
  --   fixed   → discount_value em R$ subtraído da soma
  --   total   → discount_value é o preço final (ignora soma)
  discount_type text not null default 'percent' check (discount_type in ('percent', 'fixed', 'total')),
  discount_value numeric(10, 2) not null default 0,
  -- Produto-kit criado na Nuvemshop (populated após primeiro save)
  nuvemshop_product_id text,
  nuvemshop_variant_id text,
  nuvemshop_category_id text,
  nuvemshop_url text,
  -- Preços cacheados (calculados na hora do save)
  original_price numeric(10, 2),
  final_price numeric(10, 2),
  active boolean not null default true,
  last_synced_at timestamptz,
  sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists kits_store_active_idx on kits (store_id, active);
create index if not exists kits_nuvemshop_product_idx on kits (nuvemshop_product_id);

create trigger kits_updated_at before update on kits
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- kit_items — produtos que compõem o kit
-- ----------------------------------------------------------------------------
create table if not exists kit_items (
  id uuid primary key default uuid_generate_v4(),
  kit_id uuid not null references kits(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  quantity int not null default 1 check (quantity > 0),
  ordering int not null default 0,
  unique (kit_id, product_id)
);

create index if not exists kit_items_product_idx on kit_items (product_id);
create index if not exists kit_items_kit_ordering_idx on kit_items (kit_id, ordering);

-- ----------------------------------------------------------------------------
-- View: kits com contagem de itens e produtos incluídos (útil para listagens)
-- ----------------------------------------------------------------------------
create or replace view kits_with_items as
select
  k.*,
  count(ki.id) as items_count,
  coalesce(sum(ki.quantity), 0) as total_units
from kits k
left join kit_items ki on ki.kit_id = k.id
group by k.id;

-- ----------------------------------------------------------------------------
-- RLS: kits e kit_items — apenas admin (service_role) por enquanto.
-- Leitura pública será exposta via endpoint do widget.
-- ----------------------------------------------------------------------------
alter table kits enable row level security;
alter table kit_items enable row level security;
-- (sem políticas = ninguém acessa direto; service_role ignora RLS)
