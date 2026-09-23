-- Ensure every authenticated account has exactly one 25-credit signup bonus.
-- This is a safety net for accounts created before/around deployment of the
-- auth trigger. It is idempotent and cannot be used to grant arbitrary credits.

CREATE OR REPLACE FUNCTION public.ensure_signup_bonus()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _balance integer;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.credit_transactions
    WHERE user_id = _user_id
      AND reason = 'signup_bonus'
  ) THEN
    INSERT INTO public.credit_transactions (user_id, amount, reason, note)
    VALUES (_user_id, 25, 'signup_bonus', 'Welcome bonus');
  END IF;

  SELECT COALESCE(SUM(amount), 0)::integer
    INTO _balance
    FROM public.credit_transactions
   WHERE user_id = _user_id;

  RETURN _balance;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_signup_bonus() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_signup_bonus() TO authenticated;
