
CREATE TABLE public.orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vendor_id TEXT NOT NULL,
  vendor_name TEXT NOT NULL,
  vendor_phone TEXT NOT NULL,
  vendor_whatsapp TEXT NOT NULL,
  bottle_size TEXT NOT NULL,
  quantity INT NOT NULL CHECK (quantity > 0 AND quantity <= 20),
  unit_price INT NOT NULL CHECK (unit_price >= 0),
  delivery_fee INT NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
  amount INT NOT NULL CHECK (amount >= 100),
  currency TEXT NOT NULL DEFAULT 'XOF',
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_address TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','cancelled')),
  cinetpay_transaction_id TEXT NOT NULL UNIQUE,
  cinetpay_payment_url TEXT,
  cinetpay_payment_method TEXT,
  cinetpay_operator_id TEXT,
  cinetpay_last_event JSONB,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX orders_status_idx ON public.orders(status);
CREATE INDEX orders_created_at_idx ON public.orders(created_at DESC);

GRANT ALL ON public.orders TO service_role;
-- No grant to anon/authenticated: table is only accessed server-side via supabaseAdmin.

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role manages orders"
  ON public.orders FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_orders_updated_at
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
