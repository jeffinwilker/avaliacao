-- Usuários da equipe vinculados à loja.
-- Somente o backend com service_role acessa esta tabela.

create table if not exists store_members (
  id uuid primary key default uuid_generate_v4(),
  store_id uuid not null references stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  email text not null,
  role text not null default 'member'
    check (role in ('owner', 'member')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, user_id),
  unique (store_id, email)
);

create index if not exists store_members_user_idx
  on store_members (user_id, store_id);

drop trigger if exists store_members_updated_at on store_members;
create trigger store_members_updated_at before update on store_members
  for each row execute function set_updated_at();

alter table store_members enable row level security;

-- O projeto possui uma loja. Ao instalar a migration, a primeira conta criada
-- no Supabase passa a ser a administradora dessa loja.
insert into store_members (store_id, user_id, name, email, role, created_by)
select
  store.id,
  account.id,
  coalesce(
    nullif(account.raw_user_meta_data ->> 'name', ''),
    split_part(account.email, '@', 1),
    'Administrador'
  ),
  lower(account.email),
  'owner',
  account.id
from (
  select id
  from stores
  order by created_at asc
  limit 1
) as store
cross join lateral (
  select id, email, raw_user_meta_data
  from auth.users
  where email is not null
  order by created_at asc
  limit 1
) as account
on conflict (store_id, user_id) do nothing;
