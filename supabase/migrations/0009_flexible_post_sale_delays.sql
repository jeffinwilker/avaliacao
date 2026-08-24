-- Atrasos flexíveis para as automações de pós-venda.
-- Minutos são a fonte de verdade; os campos antigos permanecem por compatibilidade.

alter table store_settings
  add column if not exists review_request_delay_minutes int,
  add column if not exists post_purchase_delay_minutes int;

update store_settings
set review_request_delay_minutes = greatest(
      10,
      least(129600, coalesce(request_delay_days, 7) * 1440)
    )
where review_request_delay_minutes is null;

update store_settings
set post_purchase_delay_minutes = greatest(
      0,
      least(43200, coalesce(post_purchase_delay_hours, 24) * 60)
    )
where post_purchase_delay_minutes is null;

alter table store_settings
  alter column review_request_delay_minutes set default 10080,
  alter column review_request_delay_minutes set not null,
  alter column post_purchase_delay_minutes set default 0,
  alter column post_purchase_delay_minutes set not null;

do $$
begin
  alter table store_settings
    add constraint store_settings_review_request_delay_minutes_check
    check (review_request_delay_minutes between 10 and 129600);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table store_settings
    add constraint store_settings_post_purchase_delay_minutes_check
    check (post_purchase_delay_minutes between 0 and 43200);
exception
  when duplicate_object then null;
end $$;
