-- Setores, múltiplos telefones e transferência auditável de conversas.

create table if not exists whatsapp_sectors (
  id uuid primary key default uuid_generate_v4(),
  store_id uuid not null references stores(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, name)
);

create table if not exists whatsapp_instances (
  id uuid primary key default uuid_generate_v4(),
  store_id uuid not null references stores(id) on delete cascade,
  sector_id uuid references whatsapp_sectors(id) on delete set null,
  instance_name text not null,
  label text not null,
  phone_number text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, instance_name)
);

create table if not exists whatsapp_sector_members (
  id uuid primary key default uuid_generate_v4(),
  store_id uuid not null references stores(id) on delete cascade,
  sector_id uuid not null references whatsapp_sectors(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (store_id, sector_id, user_id)
);

create table if not exists whatsapp_conversations (
  id uuid primary key default uuid_generate_v4(),
  store_id uuid not null references stores(id) on delete cascade,
  remote_jid text not null,
  current_instance_id uuid not null references whatsapp_instances(id) on delete restrict,
  contact_name text not null default 'Contato do WhatsApp',
  phone text,
  avatar_url text,
  last_message text,
  last_message_from_me boolean not null default false,
  last_message_at timestamptz,
  unread_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, remote_jid)
);

create table if not exists whatsapp_conversation_events (
  id uuid primary key default uuid_generate_v4(),
  store_id uuid not null references stores(id) on delete cascade,
  conversation_id uuid not null references whatsapp_conversations(id) on delete cascade,
  event_type text not null check (event_type in ('transfer')),
  from_instance_id uuid references whatsapp_instances(id) on delete set null,
  to_instance_id uuid references whatsapp_instances(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  actor_name text not null default 'Usuário',
  description text not null,
  customer_notice text,
  status text not null default 'completed'
    check (status in ('pending', 'completed', 'failed')),
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists whatsapp_instances_store_sector_idx
  on whatsapp_instances (store_id, sector_id, active);
create index if not exists whatsapp_sector_members_user_idx
  on whatsapp_sector_members (user_id, store_id, sector_id);
create index if not exists whatsapp_conversations_store_instance_idx
  on whatsapp_conversations (store_id, current_instance_id, last_message_at desc);
create index if not exists whatsapp_conversation_events_conversation_idx
  on whatsapp_conversation_events (conversation_id, created_at);

drop trigger if exists whatsapp_sectors_updated_at on whatsapp_sectors;
create trigger whatsapp_sectors_updated_at before update on whatsapp_sectors
  for each row execute function set_updated_at();
drop trigger if exists whatsapp_instances_updated_at on whatsapp_instances;
create trigger whatsapp_instances_updated_at before update on whatsapp_instances
  for each row execute function set_updated_at();
drop trigger if exists whatsapp_conversations_updated_at on whatsapp_conversations;
create trigger whatsapp_conversations_updated_at before update on whatsapp_conversations
  for each row execute function set_updated_at();

alter table whatsapp_sectors enable row level security;
alter table whatsapp_instances enable row level security;
alter table whatsapp_sector_members enable row level security;
alter table whatsapp_conversations enable row level security;
alter table whatsapp_conversation_events enable row level security;

-- Preserva o número já conectado: cria um setor Geral e concede o acesso atual.
insert into whatsapp_sectors (store_id, name)
select store.id, 'Geral'
from stores as store
on conflict (store_id, name) do nothing;

insert into whatsapp_instances (
  store_id,
  sector_id,
  instance_name,
  label,
  active
)
select
  settings.store_id,
  sector.id,
  settings.whatsapp_instance,
  'WhatsApp principal',
  true
from store_settings as settings
join whatsapp_sectors as sector
  on sector.store_id = settings.store_id
 and sector.name = 'Geral'
where nullif(settings.whatsapp_instance, '') is not null
on conflict (store_id, instance_name) do nothing;

insert into whatsapp_sector_members (store_id, sector_id, user_id)
select member.store_id, sector.id, member.user_id
from store_members as member
join whatsapp_sectors as sector on sector.store_id = member.store_id
on conflict (store_id, sector_id, user_id) do nothing;
