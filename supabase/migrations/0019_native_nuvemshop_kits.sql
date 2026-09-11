-- ============================================================================
-- Identifica kits nativos da Nuvemshop importados para o catálogo local.
-- O recurso Kit da Nuvemshop é somente leitura: criação/edição continuam no
-- painel da plataforma; o aplicativo mantém apenas um espelho para o widget.
-- ============================================================================

alter table kits
  add column if not exists source text not null default 'app';

alter table kits
  drop constraint if exists kits_source_check;

alter table kits
  add constraint kits_source_check
  check (source in ('app', 'nuvemshop_native'));

comment on column kits.source is
  'app = produto-kit legado criado pelo aplicativo; nuvemshop_native = kit nativo espelhado da Nuvemshop';

create unique index if not exists kits_store_native_product_unique
  on kits (store_id, nuvemshop_product_id)
  where source = 'nuvemshop_native' and nuvemshop_product_id is not null;

-- Recria a view para expor a origem e, principalmente, a soma das unidades.
-- O drop é necessário porque a nova coluna `source` entra antes das colunas
-- calculadas da view; CREATE OR REPLACE não aceita essa mudança de posição.
drop view if exists kits_with_items;

create view kits_with_items as
select
  k.*,
  count(ki.id) as items_count,
  coalesce(sum(ki.quantity), 0) as total_units
from kits k
left join kit_items ki on ki.kit_id = k.id
group by k.id;
