import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { VENDORS, type BottleSize } from "@/lib/vendors";

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

export default defineTool({
  name: "find_nearest_vendors",
  title: "Find nearest vendors",
  description:
    "Find gas vendors nearest to a lat/lng in Bobo-Dioulasso, optionally requiring a specific bottle size in stock.",
  inputSchema: {
    lat: z.number().describe("Latitude."),
    lng: z.number().describe("Longitude."),
    bottleSize: z
      .enum(["3kg", "6kg", "12.5kg", "38kg"])
      .optional()
      .describe("Require this bottle size available."),
    limit: z.number().int().min(1).max(20).default(5),
    inStockOnly: z.boolean().default(true).describe("Exclude vendors marked out of stock."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ lat, lng, bottleSize, limit, inStockOnly }) => {
    const size = bottleSize as BottleSize | undefined;
    const ranked = VENDORS.filter((v) => (!inStockOnly || v.stock !== "out"))
      .filter((v) => !size || v.bottles.some((b) => b.size === size && b.available))
      .map((v) => ({ vendor: v, distanceKm: haversineKm([lat, lng], [v.lat, v.lng]) }))
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, limit);
    return {
      content: [{ type: "text", text: JSON.stringify(ranked, null, 2) }],
      structuredContent: { results: ranked },
    };
  },
});
