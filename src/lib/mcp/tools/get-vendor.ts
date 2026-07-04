import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { VENDORS } from "@/lib/vendors";

export default defineTool({
  name: "get_vendor",
  title: "Get vendor details",
  description: "Get full details for a single gas vendor by ID, including bottles and contact info.",
  inputSchema: {
    id: z.string().min(1).describe("Vendor ID, e.g. 'v1'."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ id }) => {
    const vendor = VENDORS.find((v) => v.id === id);
    if (!vendor) {
      return { content: [{ type: "text", text: `No vendor found with id ${id}` }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(vendor, null, 2) }],
      structuredContent: { vendor },
    };
  },
});
