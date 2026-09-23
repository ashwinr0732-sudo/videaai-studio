CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL,
  target_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.admin_audit_log TO authenticated;
GRANT ALL ON public.admin_audit_log TO service_role;

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_audit_select_admin ON public.admin_audit_log;
CREATE POLICY admin_audit_select_admin ON public.admin_audit_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_admin_audit_created_at ON public.admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_tx_created_at ON public.credit_transactions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_video_jobs_created_at ON public.video_jobs (created_at DESC);

-- Admin-only credit adjustment: validates the caller's admin role inside the
-- database so the ledger can never be moved by a regular user.
CREATE OR REPLACE FUNCTION public.admin_adjust_credits(
  _admin_id uuid, _user_id uuid, _amount integer, _note text
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _bal integer;
BEGIN
  IF NOT public.has_role(_admin_id, 'admin'::app_role) THEN
    RAISE EXCEPTION 'not_admin';
  END IF;
  IF _amount IS NULL OR _amount = 0 THEN
    RAISE EXCEPTION 'invalid amount';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_user_id::text, 42));

  SELECT COALESCE(SUM(amount), 0)::int INTO _bal
  FROM public.credit_transactions WHERE user_id = _user_id;

  IF _amount < 0 AND _bal + _amount < 0 THEN
    RAISE EXCEPTION 'insufficient_credits' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.credit_transactions (user_id, amount, reason, note, admin_id)
  VALUES (_user_id, _amount, 'admin_adjustment', _note, _admin_id);

  RETURN _bal + _amount;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_adjust_credits(uuid, uuid, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_adjust_credits(uuid, uuid, integer, text) TO service_role;