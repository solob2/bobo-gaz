import { createServerFn } from "@tanstack/react-start";
import { getStartContext } from "@tanstack/start-storage-context";
import { z } from "zod";
import type { Vendor } from "@/lib/vendors";

// Minimal MCP Streamable HTTP client. Handles initialize handshake, tracks
// the session ID, and parses either JSON or SSE responses.
const PROTOCOL_VERSION = "2025-06-18";

async function parseMcpResponse(res: Response): Promise<unknown> {
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("text/event-stream")) {
    const text = await res.text();
    // Grab the last `data:` line — that's the JSON-RPC response.
    const lines = text.split(/\r?\n/).filter((l) => l.startsWith("data:"));
    if (!lines.length) throw new Error("Empty SSE response from MCP");
    return JSON.parse(lines[lines.length - 1].slice(5).trim());
  }
  return await res.json();
}

async function callMcpTool(origin: string, name: string, args: Record<string, unknown>) {
  const url = `${origin}/mcp`;
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };

  // 1. initialize
  const initRes = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "gaz-bobo-app", version: "0.1.0" },
      },
    }),
  });
  if (!initRes.ok) throw new Error(`MCP initialize failed: ${initRes.status}`);
  await parseMcpResponse(initRes);
  const sessionId = initRes.headers.get("mcp-session-id");
  const sessionHeaders: Record<string, string> = { ...headers };
  if (sessionId) sessionHeaders["Mcp-Session-Id"] = sessionId;

  // 2. notifications/initialized
  await fetch(url, {
    method: "POST",
    headers: sessionHeaders,
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  });

  // 3. tools/call
  const callRes = await fetch(url, {
    method: "POST",
    headers: sessionHeaders,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  if (!callRes.ok) throw new Error(`MCP tools/call failed: ${callRes.status}`);
  const parsed = (await parseMcpResponse(callRes)) as {
    error?: { message: string };
    result?: { structuredContent?: unknown; content?: Array<{ type: string; text: string }>; isError?: boolean };
  };
  if (parsed.error) throw new Error(parsed.error.message);
  if (parsed.result?.isError) {
    const msg = parsed.result.content?.[0]?.text ?? "MCP tool returned an error";
    throw new Error(msg);
  }
  // Prefer structuredContent, fall back to parsing the text content.
  if (parsed.result?.structuredContent !== undefined) return parsed.result.structuredContent;
  const text = parsed.result?.content?.[0]?.text;
  return text ? JSON.parse(text) : null;
}

function getOrigin(): string {
  try {
    const ctx = getStartContext({ throwIfNotFound: false });
    if (ctx?.request?.url) return new URL(ctx.request.url).origin;
  } catch {
    // context may not be available at import time
  }
  return process.env.LOVABLE_APP_URL ?? "http://localhost:8080";
}

const listInput = z.object({
  quartier: z.string().optional(),
  brand: z.string().optional(),
  stock: z.enum(["high", "low", "out"]).optional(),
  delivery: z.boolean().optional(),
});

export const listVendorsViaMcp = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => listInput.parse(data ?? {}))
  .handler(async ({ data }) => {
    const result = (await callMcpTool(getOrigin(), "list_vendors", data)) as {
      count: number;
      vendors: Vendor[];
    };
    return result;
  });

export const getVendorViaMcp = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    const result = (await callMcpTool(getOrigin(), "get_vendor", { id: data.id })) as {
      vendor: Vendor;
    };
    return result;
  });
