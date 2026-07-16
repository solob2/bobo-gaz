import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

export type FindingState = "open" | "fixed" | "ignored" | "wont_fix";
export type FindingSeverity = "info" | "low" | "medium" | "high" | "critical";

export type Finding = {
  id: string;
  title: string;
  severity: FindingSeverity;
  state: FindingState;
  category?: string | null;
  description?: string | null;
  explanation?: string | null;
  updated_at?: string;
};

const severityEnum = z.enum(["info", "low", "medium", "high", "critical"]);
const stateEnum = z.enum(["open", "fixed", "ignored", "wont_fix"]);

const findingSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(200),
  severity: severityEnum,
  state: stateEnum,
  category: z.string().trim().max(80).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  explanation: z.string().trim().max(2000).nullable().optional(),
  updated_at: z.string().optional(),
});

function summarize(findings: Finding[]) {
  const bySeverity: Record<string, number> = {};
  const byState: Record<string, number> = {};
  for (const f of findings) {
    bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
    byState[f.state] = (byState[f.state] ?? 0) + 1;
  }
  return { total: findings.length, bySeverity, byState };
}

export const listSecurityScans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("security_scans")
      .select("id, created_at, label, notes, findings")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return (data ?? []).map((s) => {
      const findings = (s.findings as unknown as Finding[]) ?? [];
      return {
        id: s.id,
        created_at: s.created_at,
        label: s.label,
        notes: s.notes,
        summary: summarize(findings),
      };
    });
  });

export const getSecurityScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("security_scans")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Scan introuvable");
    const findings = (row.findings as unknown as Finding[]) ?? [];
    return { ...row, findings, summary: summarize(findings) };
  });

export const createSecurityScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        label: z.string().trim().max(120).optional().nullable(),
        notes: z.string().trim().max(2000).optional().nullable(),
        findings: z.array(findingSchema).max(500),
      })
      .parse(data)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();
    const findings = data.findings.map((f) => ({ ...f, updated_at: f.updated_at ?? now }));
    const { data: inserted, error } = await supabaseAdmin
      .from("security_scans")
      .insert({
        label: data.label ?? null,
        notes: data.notes ?? null,
        findings: findings as unknown as never,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("app_events").insert({
      level: "info",
      source: "security-scan",
      message: `Nouveau scan enregistré (${findings.length} findings)`,
      metadata: { scanId: inserted.id, summary: summarize(findings) },
    });
    return { id: inserted.id };
  });

export const updateFindingState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        scanId: z.string().uuid(),
        findingId: z.string().min(1),
        state: stateEnum,
        explanation: z.string().trim().max(2000).optional().nullable(),
      })
      .parse(data)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("security_scans")
      .select("findings")
      .eq("id", data.scanId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Scan introuvable");
    const findings = ((row.findings as unknown as Finding[]) ?? []).map((f) =>
      f.id === data.findingId
        ? {
            ...f,
            state: data.state,
            explanation: data.explanation ?? f.explanation ?? null,
            updated_at: new Date().toISOString(),
          }
        : f
    );
    const { error: upErr } = await supabaseAdmin
      .from("security_scans")
      .update({ findings: findings as unknown as never })
      .eq("id", data.scanId);
    if (upErr) throw new Error(upErr.message);
    return { ok: true };
  });

export const deleteSecurityScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("security_scans").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
