import { defineMcp } from "@lovable.dev/mcp-js";
import listVendorsTool from "./tools/list-vendors";
import getVendorTool from "./tools/get-vendor";
import findNearestVendorsTool from "./tools/find-nearest-vendors";

export default defineMcp({
  name: "gaz-bobo-mcp",
  title: "Gaz à Bobo MCP",
  version: "0.1.0",
  instructions:
    "Tools to explore butane gas vendors in Bobo-Dioulasso: list/filter vendors, get vendor details, and find nearest vendors by coordinates.",
  tools: [listVendorsTool, getVendorTool, findNearestVendorsTool],
});
