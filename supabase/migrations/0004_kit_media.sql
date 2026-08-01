-- ============================================================================
-- Galeria de imagens + descrição para produtos e kits
-- ============================================================================

-- Produtos: guardar descrição e todas as imagens (pra puxar no kit)
alter table products
  add column if not exists description text,
  add column if not exists images jsonb not null default '[]'::jsonb;

comment on column products.description is 'Descrição HTML do produto (da plataforma)';
comment on column products.images is 'Array de URLs de imagens do produto';

-- Kits: galeria de imagens (image_url continua sendo a principal/thumbnail)
alter table kits
  add column if not exists images jsonb not null default '[]'::jsonb;

comment on column kits.images is 'Galeria do kit. image_url = primeira imagem.';

-- ----------------------------------------------------------------------------
-- Bucket de storage para imagens de kit (upload manual do lojista)
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('kit-media', 'kit-media', true)
on conflict (id) do nothing;
