-- ============================================================================
-- Solicitação de avaliação: um dia após a confirmação de entrega
-- ============================================================================

alter table store_settings
  alter column request_delay_days set default 1,
  alter column review_request_delay_minutes set default 1440;

update store_settings
set request_delay_days = 1,
    review_request_delay_minutes = 1440;

-- Solicitações antigas eram calculadas a partir do pagamento. Elas não devem
-- sair antes da entrega; o webhook de entrega reativa cada solicitação.
update review_requests
set status = 'cancelled',
    error_message = 'Aguardando confirmação de entrega'
where status = 'scheduled';

