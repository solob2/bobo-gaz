
-- 1) VENDORS TABLE
CREATE TABLE public.vendors (
  id text PRIMARY KEY,
  name text NOT NULL,
  quartier text NOT NULL,
  brand text NOT NULL,
  phone text NOT NULL,
  whatsapp text NOT NULL,
  hours text NOT NULL DEFAULT '07h – 19h',
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  stock text NOT NULL DEFAULT 'high' CHECK (stock IN ('high','low','out')),
  bottles jsonb NOT NULL DEFAULT '[]'::jsonb,
  type text NOT NULL DEFAULT 'Boutique',
  delivery boolean NOT NULL DEFAULT false,
  is_open boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.vendors TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendors TO authenticated;
GRANT ALL ON public.vendors TO service_role;

ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read vendors" ON public.vendors FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admins manage vendors" ON public.vendors FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_vendors_updated_at
  BEFORE UPDATE ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) VENDOR ACCOUNTS
CREATE TABLE public.vendor_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  vendor_id text REFERENCES public.vendors(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  requested_name text,
  requested_phone text,
  requested_quartier text,
  note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.vendor_accounts TO authenticated;
GRANT ALL ON public.vendor_accounts TO service_role;

ALTER TABLE public.vendor_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own vendor_account" ON public.vendor_accounts
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "users create own vendor_account" ON public.vendor_accounts
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND status = 'pending' AND vendor_id IS NULL);
CREATE POLICY "admins update vendor_accounts" ON public.vendor_accounts
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admins delete vendor_accounts" ON public.vendor_accounts
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_vendor_accounts_updated_at
  BEFORE UPDATE ON public.vendor_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) helper to check vendor ownership (used by app code, not policies)
CREATE OR REPLACE FUNCTION public.is_vendor_owner(_user_id uuid, _vendor_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.vendor_accounts
    WHERE user_id = _user_id AND vendor_id = _vendor_id AND status = 'approved'
  )
$$;

-- allow vendors to update their own row
CREATE POLICY "vendor updates own row" ON public.vendors FOR UPDATE TO authenticated
  USING (public.is_vendor_owner(auth.uid(), id))
  WITH CHECK (public.is_vendor_owner(auth.uid(), id));

-- 4) Seed vendors
INSERT INTO public.vendors (id,name,quartier,brand,phone,whatsapp,hours,lat,lng,stock,bottles,type,delivery) VALUES
('v1','Dépôt Sodigaz Accart','Accart-Ville','Sodigaz','22670112233','22670112233','07h – 19h',11.1825,-4.2912,'high','[{"size":"6kg","price":3500,"available":true},{"size":"12.5kg","price":6500,"available":true},{"size":"38kg","price":19500,"available":true}]','Dépôt officiel',true),
('v2','Boutique Mariam – Bolomakoté','Bolomakoté','Total Énergies','22675223344','22675223344','06h30 – 21h',11.1689,-4.3105,'low','[{"size":"6kg","price":3700,"available":true},{"size":"12.5kg","price":6800,"available":false}]','Boutique',false),
('v3','Revendeur Issouf – Colma','Colma','Indépendant','22678334455','22678334455','08h – 20h',11.1932,-4.2840,'high','[{"size":"3kg","price":2200,"available":true},{"size":"6kg","price":3600,"available":true}]','Revendeur',true),
('v4','Station Oryx Dafra','Dafra','Oryx','22670445566','22670445566','24h/24',11.1602,-4.2755,'out','[{"size":"12.5kg","price":6700,"available":false},{"size":"38kg","price":19800,"available":false}]','Dépôt officiel',true),
('v5','Boutique Salif – Diaradougou','Diaradougou','Sodigaz','22676556677','22676556677','07h – 20h',11.1545,-4.3025,'high','[{"size":"6kg","price":3500,"available":true},{"size":"12.5kg","price":6500,"available":true}]','Boutique',false),
('v6','Revendeur Aminata – Dogona','Dogona','Pétrofa','22677667788','22677667788','06h – 22h',11.2010,-4.3180,'low','[{"size":"3kg","price":2300,"available":true},{"size":"6kg","price":3700,"available":true},{"size":"12.5kg","price":6900,"available":false}]','Revendeur',true),
('v7','Dépôt Total Farakan','Farakan','Total Énergies','22670778899','22670778899','07h – 19h',11.1480,-4.2880,'high','[{"size":"6kg","price":3600,"available":true},{"size":"12.5kg","price":6700,"available":true},{"size":"38kg","price":19700,"available":true}]','Dépôt officiel',true),
('v8','Boutique Koko Centre','Koko','Sodigaz','22675889900','22675889900','07h30 – 20h',11.1750,-4.3050,'high','[{"size":"6kg","price":3500,"available":true},{"size":"12.5kg","price":6500,"available":true}]','Boutique',false),
('v9','Revendeur Ali – Sarfalao','Sarfalao','Indépendant','22678990011','22678990011','06h – 21h',11.1390,-4.3210,'low','[{"size":"3kg","price":2200,"available":true},{"size":"6kg","price":3800,"available":false}]','Revendeur',false),
('v10','Dépôt Sikasso-Cira','Sikasso-Cira','Sodigaz','22670101112','22670101112','07h – 19h',11.1850,-4.3220,'high','[{"size":"6kg","price":3500,"available":true},{"size":"12.5kg","price":6500,"available":true},{"size":"38kg","price":19500,"available":true}]','Dépôt officiel',true),
('v11','Boutique Bindougousso','Bindougousso','Oryx','22677212223','22677212223','06h30 – 21h30',11.2110,-4.2950,'out','[{"size":"6kg","price":3700,"available":false},{"size":"12.5kg","price":6800,"available":false}]','Boutique',false),
('v12','Revendeur Ouezzin','Ouezzin-Ville','Pétrofa','22676323334','22676323334','07h – 20h',11.1690,-4.2730,'high','[{"size":"3kg","price":2250,"available":true},{"size":"6kg","price":3650,"available":true},{"size":"12.5kg","price":6750,"available":true}]','Revendeur',true),
('v13','Boutique Fatim – Accart','Accart-Ville','Total Énergies','22675434445','22675434445','07h – 20h',11.1880,-4.2965,'low','[{"size":"6kg","price":3700,"available":true},{"size":"12.5kg","price":6800,"available":true}]','Boutique',true),
('v14','Revendeur Bolomakoté Sud','Bolomakoté','Sodigaz','22678545556','22678545556','06h – 22h',11.1620,-4.3150,'high','[{"size":"3kg","price":2200,"available":true},{"size":"6kg","price":3500,"available":true}]','Revendeur',false),
('v15','Dépôt Koko Nord','Koko','Oryx','22670656667','22670656667','07h – 19h',11.1800,-4.3110,'high','[{"size":"12.5kg","price":6700,"available":true},{"size":"38kg","price":19800,"available":true}]','Dépôt officiel',true),
('v16','Boutique Diaradougou Marché','Diaradougou','Indépendant','22677767778','22677767778','07h – 21h',11.1510,-4.2990,'low','[{"size":"6kg","price":3800,"available":true}]','Boutique',false),
('v17','Station Total Dafra Est','Dafra','Total Énergies','22670878889','22670878889','24h/24',11.1650,-4.2700,'high','[{"size":"6kg","price":3600,"available":true},{"size":"12.5kg","price":6700,"available":true},{"size":"38kg","price":19700,"available":true}]','Dépôt officiel',true),
('v18','Revendeur Farakan Marché','Farakan','Sodigaz','22676989900','22676989900','06h – 21h',11.1450,-4.2920,'high','[{"size":"3kg","price":2200,"available":true},{"size":"6kg","price":3500,"available":true},{"size":"12.5kg","price":6500,"available":true}]','Revendeur',true),
('v19','Boutique Colma Nord','Colma','Pétrofa','22678101011','22678101011','07h – 20h',11.1980,-4.2790,'out','[{"size":"6kg","price":3700,"available":false}]','Boutique',false),
('v20','Dépôt Sarfalao Centre','Sarfalao','Sodigaz','22670121213','22670121213','07h – 19h',11.1420,-4.3150,'high','[{"size":"6kg","price":3500,"available":true},{"size":"12.5kg","price":6500,"available":true},{"size":"38kg","price":19500,"available":true}]','Dépôt officiel',true);
