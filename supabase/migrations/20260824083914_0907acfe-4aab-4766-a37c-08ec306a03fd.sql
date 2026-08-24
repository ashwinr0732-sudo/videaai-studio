REVOKE ALL ON FUNCTION public.credit_balance(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_balance(uuid) TO service_role;