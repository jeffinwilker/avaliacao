-- Instância Evolution criada e conectada pelo painel.
-- A URL e a chave global continuam somente nas variáveis do servidor.

alter table store_settings
  add column if not exists whatsapp_instance text;

