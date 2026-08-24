-- 1. Lock down SECURITY DEFINER / trigger functions
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_video_jobs_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.credit_balance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.credit_balance(uuid) TO authenticated, service_role;

-- 2. Bootstrap: first ever account becomes admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _has_admin boolean;
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)))
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user') ON CONFLICT DO NOTHING;

  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') INTO _has_admin;
  IF NOT _has_admin THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
  END IF;

  INSERT INTO public.credit_transactions (user_id, amount, reason, note)
  VALUES (NEW.id, 25, 'signup_bonus', 'Welcome bonus');
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- 3. Helpful indexes for admin dashboard queries
CREATE INDEX IF NOT EXISTS credit_transactions_user_created_idx ON public.credit_transactions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS credit_transactions_created_idx ON public.credit_transactions (created_at DESC);
CREATE INDEX IF NOT EXISTS video_jobs_user_ref_idx ON public.video_jobs (user_ref);