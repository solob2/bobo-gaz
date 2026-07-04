import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { VENDORS } from "@/lib/vendors";

export default defineTool({
  name: "list_vendors",
  title: "List gas vendors",
  description:
    "List butane gas vendors in Bobo-Dioulasso. Optionally filter by quartier, brand, or stock level.",
  inputSchema: {
    quartier: z.string().optional().describe("Filter by neighborhood (quartier)."),
    brand: z.string().optional().describe("Filter by brand (e.g. Sodigaz, Total Énergies)."),
    stock: z
      .enum(["high", "low", "out"])
      .optional()
      .describe("Filter by stock level: high, low, or out."),
    delivery: z.boolean().optional().describe("If true, only vendors offering delivery."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ quartier, brand, stock, delivery }) => {
    const results = VENDORS.filter(
      (v) =>
        (!quartier || v.quartier.toLowerCase() === quartier.toLowerCase()) &&
        (!brand || v.brand.toLowerCase() === brand.toLowerCase()) &&
        (!stock || v.stock === stock) &&
        (delivery === undefined || v.delivery === delivery),
    );
    return {
      content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
      structuredContent: { count: results.length, vendors: results },
    };
  },
});
