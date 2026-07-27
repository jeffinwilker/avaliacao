-- ============================================================================
-- Helpers e funções RPC usadas pelo painel admin
-- ============================================================================

create or replace function avg_rating_for_store(p_store uuid)
returns table(avg numeric)
language sql stable as $$
  select round(avg(rating)::numeric, 2) as avg
  from reviews
  where store_id = p_store and status = 'approved';
$$;

create or replace function moderate_review(
  p_review_id uuid,
  p_status text,
  p_note text default null
)
returns void
language plpgsql as $$
begin
  if p_status not in ('approved', 'rejected', 'pending') then
    raise exception 'invalid status: %', p_status;
  end if;

  update reviews
  set status = p_status,
      moderated_at = now(),
      moderation_note = p_note
  where id = p_review_id;
end;
$$;

create or replace function reply_to_review(
  p_review_id uuid,
  p_reply text
)
returns void
language plpgsql as $$
begin
  update reviews
  set reply = p_reply,
      replied_at = now()
  where id = p_review_id;
end;
$$;
