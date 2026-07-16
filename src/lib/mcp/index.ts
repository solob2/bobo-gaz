import { defineMcp, auth } from "@lovable.dev/mcp-js";
import listVendorsTool from "./tools/list-vendors";
import getVendorTool from "./tools/get-vendor";
import findNearestVendorsTool from "./tools/find-nearest-vendors";

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";

export default defineMcp({
  name: "gaz-bobo-mcp",
  title: "Gaz à Bobo MCP",
  version: "0.1.0",
  instructions:
    "Tools to explore butane gas vendors in Bobo-Dioulasso: list/filter vendors, get vendor details, and find nearest vendors by coordinates.",
  tools: [listVendorsTool, getVendorTool, findNearestVendorsTool],
  auth: auth.oauth.issuer({
    issuer: `${SUPABASE_URL}/auth/v1`,
    acceptedAudiences: ["authenticated"],
    resourceName: "Gaz à Bobo MCP",
  }),
});
