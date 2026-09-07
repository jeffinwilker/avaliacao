-- Remove a restrição legada que permitia somente uma mensagem por carrinho.
-- O nome gerado automaticamente pelo Postgres foi abreviado para preservar o
-- sufixo _key, por isso a tentativa de remoção da migration 0007 não o encontrou.

do $$
declare
  legacy_constraint record;
begin
  for legacy_constraint in
    select constraint_row.conname
    from pg_constraint as constraint_row
    where constraint_row.conrelid = 'public.automation_messages'::regclass
      and constraint_row.contype = 'u'
      and (
        select array_agg(attribute_row.attname::text order by key_column.ordinality)
        from unnest(constraint_row.conkey) with ordinality
          as key_column(attnum, ordinality)
        join pg_attribute as attribute_row
          on attribute_row.attrelid = constraint_row.conrelid
         and attribute_row.attnum = key_column.attnum
      ) = array['store_id', 'automation_type', 'external_reference']::text[]
  loop
    execute format(
      'alter table public.automation_messages drop constraint %I',
      legacy_constraint.conname
    );
  end loop;
end;
$$;

create unique index if not exists automation_messages_store_type_reference_step_unique
  on public.automation_messages (
    store_id,
    automation_type,
    external_reference,
    routine_step_key
  );

-- Reinicia a vigência das rotinas ativas. Assim, ao liberar a fila, mensagens
-- atrasadas pelo erro não são disparadas de uma vez para carrinhos antigos.
update public.store_settings as settings
set abandoned_cart_sequence = (
  select coalesce(
    jsonb_agg(
      case
        when coalesce(item.step ->> 'enabled', 'true') <> 'false'
          then jsonb_set(
            item.step,
            '{active_since}',
            to_jsonb(now()::text),
            true
          )
        else item.step
      end
      order by item.position
    ),
    '[]'::jsonb
  )
  from jsonb_array_elements(settings.abandoned_cart_sequence)
    with ordinality as item(step, position)
)
where settings.abandoned_cart_enabled = true
  and jsonb_typeof(settings.abandoned_cart_sequence) = 'array';
