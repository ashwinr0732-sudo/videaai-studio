-- Idempotency guard: one ledger row per (user, note)
CREATE UNIQUE INDEX IF NOT EXISTS credit_transactions_user_note_uniq
  ON public.credit_transactions (user_id, note)
  WHERE note IS NOT NULL;

-- Atomic debit: serialize per-user, verify balance, never go negative.
CREATE OR REPLACE FUNCTION public.spend_credits(_user_id uuid, _amount integer, _note text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _bal integer;
BEGIN
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'invalid amount';
  END IF;
  IF _note IS NULL OR length(_note) = 0 THEN
    RAISE EXCEPTION 'note required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_user_id::text, 42));

  -- already charged for this note: idempotent no-op
  IF EXISTS (SELECT 1 FROM public.credit_transactions WHERE user_id = _user_id AND note = _note) THEN
    SELECT COALESCE(SUM(amount), 0)::int INTO _bal FROM public.credit_transactions WHERE user_id = _user_id;
    RETURN _bal;
  END IF;

  SELECT COALESCE(SUM(amount), 0)::int INTO _bal
  FROM public.credit_transactions WHERE user_id = _user_id;

  IF _bal < _amount THEN
    RAISE EXCEPTION 'insufficient_credits' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.credit_transactions (user_id, amount, reason, note)
  VALUES (_user_id, -_amount, 'generation', _note);

  RETURN _bal - _amount;
END;
$$;

-- Idempotent refund keyed on the render id.
CREATE OR REPLACE FUNCTION public.refund_credits(_user_id uuid, _amount integer, _note text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _bal integer;
BEGIN
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'invalid amount';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_user_id::text, 42));

  IF NOT EXISTS (SELECT 1 FROM public.credit_transactions WHERE user_id = _user_id AND note = _note) THEN
    INSERT INTO public.credit_transactions (user_id, amount, reason, note)
    VALUES (_user_id, _amount, 'refund', _note);
  END IF;

  SELECT COALESCE(SUM(amount), 0)::int INTO _bal
  FROM public.credit_transactions WHERE user_id = _user_id;
  RETURN _bal;
END;
$$;

REVOKE ALL ON FUNCTION public.spend_credits(uuid, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refund_credits(uuid, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.spend_credits(uuid, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_credits(uuid, integer, text) TO service_role;

-- Render jobs: owners (and admins) may read; all writes stay with trusted server code.
GRANT SELECT ON public.video_jobs TO authenticated;
GRANT ALL ON public.video_jobs TO service_role;
REVOKE ALL ON public.video_jobs FROM anon;
REVOKE ALL ON public.credit_transactions FROM anon;
REVOKE ALL ON public.profiles FROM anon;
REVOKE ALL ON public.user_roles FROM anon;