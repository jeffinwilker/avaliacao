-- ============================================================================
-- Peso e dimensões para produtos e kits (cálculo de frete)
-- ============================================================================

-- Produtos: peso (kg) e dimensões (cm) da variante principal
alter table products
  add column if not exists weight numeric(10, 3),
  add column if not exists depth numeric(10, 2),
  add column if not exists width numeric(10, 2),
  add column if not exists height numeric(10, 2);

comment on column products.weight is 'Peso em kg';
comment on column products.depth is 'Comprimento em cm';
comment on column products.width is 'Largura em cm';
comment on column products.height is 'Altura em cm';

-- Kits: regra de dimensão + valores custom (usados quando rule = 'custom')
alter table kits
  add column if not exists dimension_rule text not null default 'auto'
    check (dimension_rule in ('auto', 'custom')),
  add column if not exists weight numeric(10, 3),
  add column if not exists depth numeric(10, 2),
  add column if not exists width numeric(10, 2),
  add column if not exists height numeric(10, 2);

comment on column kits.dimension_rule is 'auto = soma peso + maior dimensão; custom = valores abaixo';
