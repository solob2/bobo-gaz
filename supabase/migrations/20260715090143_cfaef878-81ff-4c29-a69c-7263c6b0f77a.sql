
CREATE OR REPLACE FUNCTION public.is_vendor_owner(_user_id uuid, _vendor_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.vendor_accounts
    WHERE user_id = _user_id AND vendor_id = _vendor_id AND status = 'approved'
  )
$$;
