-- Cupom exclusivo e de uso único para mensagens de carrinho abandonado.

alter table automation_messages
  add column if not exists coupon_id bigint,
  add column if not exists coupon_code text,
  add column if not exists coupon_applied_at timestamptz;

create index if not exists automation_messages_coupon_code_idx
  on automation_messages (store_id, coupon_code)
  where coupon_code is not null;
