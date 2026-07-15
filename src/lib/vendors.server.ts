import type { Vendor, BottleSize, StockLevel } from "@/lib/vendors";

type Row = {
  id: string;
  name: string;
  quartier: string;
  brand: string;
  phone: string;
  whatsapp: string;
  hours: string;
  lat: number;
  lng: number;
  stock: string;
  bottles: unknown;
  type: string;
  delivery: boolean;
  is_open: boolean;
  updated_at: string;
};

function rowToVendor(row: Row): Vendor {
  return {
    id: row.id,
    name: row.name,
    quartier: row.quartier,
    brand: row.brand,
    phone: row.phone,
    whatsapp: row.whatsapp,
    hours: row.hours,
    lat: row.lat,
    lng: row.lng,
    stock: (row.is_open ? row.stock : "out") as StockLevel,
    bottles: ((row.bottles as { size: BottleSize; price: number; available: boolean }[]) ?? []).map((b) => ({
      size: b.size,
      price: b.price,
      available: row.is_open && b.available,
    })),
    updatedAt: row.updated_at,
    type: row.type as Vendor["type"],
    delivery: row.delivery,
  };
}

export async function loadVendors(): Promise<Vendor[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("vendors")
    .select("*")
    .order("id");
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Row[]).map(rowToVendor);
}

export async function loadVendor(id: string): Promise<Vendor | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("vendors")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToVendor(data as unknown as Row) : null;
}
