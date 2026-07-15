import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Vendor } from "@/lib/vendors";

// Server-side vendor reads go through the DB (see src/lib/vendors.server.ts).
// This mirrors the MCP `list_vendors` / `get_vendor` / `find_nearest_vendors`
// tools while running in-process to avoid loopback fetch during SSR.

const listInput = z.object({
  quartier: z.string().optional(),
  brand: z.string().optional(),
  stock: z.enum(["high", "low", "out"]).optional(),
  delivery: z.boolean().optional(),
});

function filterVendors(all: Vendor[], f: z.infer<typeof listInput>): Vendor[] {
  return all.filter(
    (v) =>
      (!f.quartier || v.quartier.toLowerCase() === f.quartier.toLowerCase()) &&
      (!f.brand || v.brand.toLowerCase() === f.brand.toLowerCase()) &&
      (!f.stock || v.stock === f.stock) &&
      (f.delivery === undefined || v.delivery === f.delivery),
  );
}

export const listVendorsViaMcp = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => listInput.parse(data ?? {}))
  .handler(async ({ data }) => {
    const { loadVendors } = await import("@/lib/vendors.server");
    const all = await loadVendors();
    const vendors = filterVendors(all, data);
    return { count: vendors.length, vendors };
  });

export const getVendorViaMcp = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    const { loadVendor } = await import("@/lib/vendors.server");
    const vendor = await loadVendor(data.id);
    if (!vendor) throw new Error(`No vendor found with id ${data.id}`);
    return { vendor };
  });

const nearestInput = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  bottleSize: z.enum(["3kg", "6kg", "12.5kg", "38kg"]).optional(),
  limit: z.number().int().min(1).max(50).default(10),
  inStockOnly: z.boolean().default(true),
});

function haversineKm(a: [number, number], b: [number, number]) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export const findNearestVendorsViaMcp = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => nearestInput.parse(data))
  .handler(async ({ data }) => {
    const { loadVendors } = await import("@/lib/vendors.server");
    const all = await loadVendors();
    const ranked = all
      .filter((v) => !data.inStockOnly || v.stock !== "out")
      .filter(
        (v) =>
          !data.bottleSize ||
          v.bottles.some((b) => b.size === data.bottleSize && b.available),
      )
      .map((v) => ({ vendor: v, distanceKm: haversineKm([data.lat, data.lng], [v.lat, v.lng]) }))
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, data.limit);
    return { count: ranked.length, results: ranked };
  });

