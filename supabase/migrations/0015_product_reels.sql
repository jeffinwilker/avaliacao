-- Reels/stories de produto exibidos pelo widget na pagina do produto.
-- O backend usa service_role; o widget publico le pelos endpoints /api/widget.

create table if not exists product_reels (
  id uuid primary key default uuid_generate_v4(),
  store_id uuid not null references stores(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  title text not null,
  video_url text not null,
  storage_provider text not null default 'supabase'
    check (storage_provider in ('supabase', 'r2')),
  storage_path text,
  thumbnail_url text,
  active boolean not null default true,
  ordering int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists product_reels_store_product_idx
  on product_reels (store_id, product_id, active, ordering);

drop trigger if exists product_reels_updated_at on product_reels;
create trigger product_reels_updated_at before update on product_reels
  for each row execute function set_updated_at();

alter table product_reels enable row level security;

insert into storage.buckets (id, name, public)
values ('product-reels', 'product-reels', true)
on conflict (id) do update set public = true;
