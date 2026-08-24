-- Biblioteca de imagens e anexos das automações de WhatsApp.

insert into storage.buckets (id, name, public)
values ('automation-media', 'automation-media', true)
on conflict (id) do update set public = true;

alter table store_settings
  add column if not exists whatsapp_attachment_type text not null default 'none',
  add column if not exists whatsapp_attachment_url text,
  add column if not exists post_purchase_attachment_type text not null default 'none',
  add column if not exists post_purchase_attachment_url text;

alter table automation_messages
  add column if not exists attachment_type text not null default 'none',
  add column if not exists attachment_url text;

do $$
begin
  alter table store_settings
    add constraint store_settings_whatsapp_attachment_type_check
    check (whatsapp_attachment_type in ('none', 'product_image', 'library'));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table store_settings
    add constraint store_settings_post_purchase_attachment_type_check
    check (post_purchase_attachment_type in ('none', 'product_image', 'library'));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table automation_messages
    add constraint automation_messages_attachment_type_check
    check (attachment_type in ('none', 'image'));
exception
  when duplicate_object then null;
end $$;
