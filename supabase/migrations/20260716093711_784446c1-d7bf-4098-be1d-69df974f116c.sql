
-- 1) Move has_role out of exposed API schema to hide it from PostgREST/authenticated direct execution
CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;

-- Rebuild policies to use private.has_role, then drop public.has_role

-- orders
DROP POLICY IF EXISTS "admins read orders" ON public.orders;
CREATE POLICY "admins read orders" ON public.orders
  FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'admin'));

-- app_events
DROP POLICY IF EXISTS "admins read events" ON public.app_events;
CREATE POLICY "admins read events" ON public.app_events
  FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'admin'));

-- alert_rules
DROP POLICY IF EXISTS "admins manage alert_rules" ON public.alert_rules;
CREATE POLICY "admins manage alert_rules" ON public.alert_rules
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.has_role(auth.uid(), 'admin'));

-- vendors
DROP POLICY IF EXISTS "admins manage vendors" ON public.vendors;
CREATE POLICY "admins manage vendors" ON public.vendors
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.has_role(auth.uid(), 'admin'));

-- vendor_accounts
DROP POLICY IF EXISTS "users read own vendor_account" ON public.vendor_accounts;
CREATE POLICY "users read own vendor_account" ON public.vendor_accounts
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admins update vendor_accounts" ON public.vendor_accounts;
CREATE POLICY "admins update vendor_accounts" ON public.vendor_accounts
  FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admins delete vendor_accounts" ON public.vendor_accounts;
CREATE POLICY "admins delete vendor_accounts" ON public.vendor_accounts
  FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'));

DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);

-- 2) Orders: block any anon access explicitly; only authenticated admins (RLS) and service_role can read
REVOKE ALL ON public.orders FROM anon;

-- 3) Vendors: hide phone and whatsapp from public/anon reads via column-level grants.
--    Server-side code (service_role via supabaseAdmin) still sees all columns.
REVOKE ALL ON public.vendors FROM anon;
GRANT SELECT (id, name, quartier, brand, hours, lat, lng, stock, bottles, updated_at, type, delivery, is_open)
  ON public.vendors TO anon;

REVOKE ALL ON public.vendors FROM authenticated;
GRANT SELECT (id, name, quartier, brand, hours, lat, lng, stock, bottles, updated_at, type, delivery, is_open, phone, whatsapp)
  ON public.vendors TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.vendors TO authenticated;
