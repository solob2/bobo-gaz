import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { VENDORS, type Vendor } from "@/lib/vendors";

// These server functions mirror the MCP `list_vendors` / `get_vendor` tools
// but run the logic directly in-process. Doing a loopback fetch to `/mcp`
// during SSR fails in the Worker runtime ("fetch failed"), so we skip HTTP.
// The MCP endpoint itself stays available for external agents.

const listInput = z.object({
  quartier: z.string().optional(),
  brand: z.string().optional(),
  stock: z.enum(["high", "low", "out"]).optional(),
  delivery: z.boolean().optional(),
});

function filterVendors(f: z.infer<typeof listInput>): Vendor[] {
  return VENDORS.filter(
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
    const vendors = filterVendors(data);
    return { count: vendors.length, vendors };
  });

export const getVendorViaMcp = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    const vendor = VENDORS.find((v) => v.id === data.id);
    if (!vendor) throw new Error(`No vendor found with id ${data.id}`);
    return { vendor };
  });
