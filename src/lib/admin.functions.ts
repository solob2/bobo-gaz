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

export const getAdminStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ count: adminCount }, { data: mine }] = await Promise.all([
      supabaseAdmin.from("user_roles").select("id", { count: "exact", head: true }).eq("role", "admin"),
      supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", context.userId)
        .eq("role", "admin")
        .maybeSingle(),
    ]);
    return {
      isAdmin: Boolean(mine),
      adminExists: (adminCount ?? 0) > 0,
      userId: context.userId,
      email: (context.claims as { email?: string })?.email ?? null,
    };
  });

export const claimFirstAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin
      .from("user_roles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");
    if ((count ?? 0) > 0) throw new Error("Un admin existe déjà");
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: context.userId, role: "admin" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getAdminDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

    const [ordersAll, orders24h, recentOrders, recentEvents, stuckPending] = await Promise.all([
      supabaseAdmin.from("orders").select("status, amount, currency, created_at, paid_at"),
      supabaseAdmin.from("orders").select("status, amount").gte("created_at", since24h),
      supabaseAdmin
        .from("orders")
        .select("id, vendor_name, customer_name, customer_phone, amount, currency, status, bottle_size, quantity, created_at, paid_at")
        .order("created_at", { ascending: false })
        .limit(20),
      supabaseAdmin
        .from("app_events")
        .select("id, level, source, message, metadata, created_at")
        .order("created_at", { ascending: false })
        .limit(50),
      supabaseAdmin
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
        .lt("created_at", new Date(Date.now() - 30 * 60 * 1000).toISOString()),
    ]);

    const all = ordersAll.data ?? [];
    const totalOrders = all.length;
    const byStatus = all.reduce<Record<string, number>>((acc, o) => {
      acc[o.status] = (acc[o.status] ?? 0) + 1;
      return acc;
    }, {});
    const revenueXof = all
      .filter((o) => o.status === "paid" && o.currency === "XOF")
      .reduce((s, o) => s + (o.amount ?? 0), 0);

    const last7dOrders = all.filter((o) => o.created_at >= since7d);
    const revenue7d = last7dOrders
      .filter((o) => o.status === "paid" && o.currency === "XOF")
      .reduce((s, o) => s + (o.amount ?? 0), 0);

    const last24 = orders24h.data ?? [];
    const failed24h = last24.filter((o) => o.status === "failed").length;
    const paid24h = last24.filter((o) => o.status === "paid").length;
    const pending24h = last24.filter((o) => o.status === "pending").length;

    const lastPaid = all
      .filter((o) => o.paid_at)
      .sort((a, b) => (b.paid_at ?? "").localeCompare(a.paid_at ?? ""))[0];
    const lastWebhookEvent = (recentEvents.data ?? []).find((e) => e.source === "cinetpay-webhook");

    const alerts: Array<{ id: string; level: "warning" | "critical" | "info"; message: string }> = [];
    if (failed24h >= 3)
      alerts.push({ id: "failed-24h", level: "warning", message: `${failed24h} paiements échoués sur 24h` });
    if ((stuckPending.count ?? 0) > 0)
      alerts.push({
        id: "stuck-pending",
        level: "warning",
        message: `${stuckPending.count} commandes en attente depuis >30 min`,
      });
    if (lastPaid && Date.now() - new Date(lastPaid.paid_at as string).getTime() > 6 * 3600 * 1000)
      alerts.push({
        id: "no-recent-paid",
        level: "info",
        message: "Aucun paiement réussi depuis plus de 6h",
      });
    if (!lastWebhookEvent && paid24h > 0)
      alerts.push({
        id: "webhook-silent",
        level: "warning",
        message: "Aucun webhook CinetPay reçu récemment",
      });

    return {
      stats: {
        totalOrders,
        byStatus,
        revenueXof,
        revenue7d,
        failed24h,
        paid24h,
        pending24h,
        stuckPending: stuckPending.count ?? 0,
      },
      recentOrders: recentOrders.data ?? [],
      recentEvents: recentEvents.data ?? [],
      alerts,
    };
  });

export const getSystemHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const expectedSecrets = [
      "SUPABASE_URL",
      "SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "LOVABLE_API_KEY",
      "CINETPAY_API_KEY",
      "CINETPAY_SITE_ID",
      "CINETPAY_SECRET_KEY",
    ];
    const secrets = expectedSecrets.map((name) => ({
      name,
      configured: Boolean(process.env[name]),
      sensitive: !name.endsWith("_URL") && !name.endsWith("_ID"),
    }));

    const dbStart = Date.now();
    const { error: dbErr } = await supabaseAdmin.from("orders").select("id", { head: true, count: "exact" });
    const dbLatency = Date.now() - dbStart;

    return {
      db: { ok: !dbErr, latencyMs: dbLatency, error: dbErr?.message ?? null },
      secrets,
      runtime: {
        now: new Date().toISOString(),
        node: typeof process !== "undefined" ? process.version ?? null : null,
      },
    };
  });

const queryEventsSchema = z.object({
  q: z.string().trim().max(200).optional(),
  level: z.string().max(20).optional(),
  source: z.string().max(60).optional(),
  sinceHours: z.number().int().min(1).max(24 * 30).optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

export const queryEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => queryEventsSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let query = supabaseAdmin
      .from("app_events")
      .select("id, level, source, message, metadata, created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 100);

    if (data.level && data.level !== "all") query = query.eq("level", data.level);
    if (data.source && data.source !== "all") query = query.eq("source", data.source);
    if (data.sinceHours) {
      const since = new Date(Date.now() - data.sinceHours * 3600 * 1000).toISOString();
      query = query.gte("created_at", since);
    }
    if (data.q) query = query.ilike("message", `%${data.q}%`);

    const { data: events, error } = await query;
    if (error) throw new Error(error.message);

    // Distinct sources for filter dropdown (from a wider recent window)
    const { data: sourcesRows } = await supabaseAdmin
      .from("app_events")
      .select("source")
      .order("created_at", { ascending: false })
      .limit(500);
    const sources = Array.from(new Set((sourcesRows ?? []).map((r) => r.source))).sort();

    return { events: events ?? [], sources };
  });

const alertRuleSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  enabled: z.boolean(),
  level: z.enum(["all", "info", "warn", "error"]),
  source: z.string().trim().max(60).optional().nullable(),
  message_contains: z.string().trim().max(200).optional().nullable(),
  threshold: z.number().int().min(1).max(10000),
  window_minutes: z.number().int().min(1).max(60 * 24 * 30),
});

export const listAlertRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("alert_rules")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    // Evaluate current status for each enabled rule
    const results = await Promise.all(
      (data ?? []).map(async (r) => {
        if (!r.enabled) return { rule: r, matches: 0, triggered: false };
        const since = new Date(Date.now() - r.window_minutes * 60 * 1000).toISOString();
        let q = supabaseAdmin
          .from("app_events")
          .select("id", { count: "exact", head: true })
          .gte("created_at", since);
        if (r.level !== "all") q = q.eq("level", r.level);
        if (r.source) q = q.eq("source", r.source);
        if (r.message_contains) q = q.ilike("message", `%${r.message_contains}%`);
        const { count } = await q;
        const matches = count ?? 0;
        return { rule: r, matches, triggered: matches >= r.threshold };
      })
    );
    return { rules: results };
  });

export const upsertAlertRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => alertRuleSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payload = {
      name: data.name,
      enabled: data.enabled,
      level: data.level,
      source: data.source || null,
      message_contains: data.message_contains || null,
      threshold: data.threshold,
      window_minutes: data.window_minutes,
      created_by: context.userId,
    };
    if (data.id) {
      const { error } = await supabaseAdmin.from("alert_rules").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: inserted, error } = await supabaseAdmin
      .from("alert_rules")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: inserted.id };
  });

export const deleteAlertRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("alert_rules").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const testAlertRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    alertRuleSchema.omit({ id: true, enabled: true, name: true }).parse(data)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const since = new Date(Date.now() - data.window_minutes * 60 * 1000).toISOString();
    let q = supabaseAdmin
      .from("app_events")
      .select("id, level, source, message, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(20);
    if (data.level !== "all") q = q.eq("level", data.level);
    if (data.source) q = q.eq("source", data.source);
    if (data.message_contains) q = q.ilike("message", `%${data.message_contains}%`);
    const { data: sample, error } = await q;
    if (error) throw new Error(error.message);

    // Get exact count
    let cq = supabaseAdmin
      .from("app_events")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since);
    if (data.level !== "all") cq = cq.eq("level", data.level);
    if (data.source) cq = cq.eq("source", data.source);
    if (data.message_contains) cq = cq.ilike("message", `%${data.message_contains}%`);
    const { count } = await cq;

    // Emit a synthetic test event so the ops trail shows the check
    await supabaseAdmin.from("app_events").insert({
      level: "info",
      source: "alert-rules",
      message: `Test règle d'alerte: ${count ?? 0} correspondance(s) sur ${data.window_minutes}min (seuil ${data.threshold})`,
      metadata: { data, matches: count ?? 0 },
    });

    return {
      matches: count ?? 0,
      threshold: data.threshold,
      triggered: (count ?? 0) >= data.threshold,
      sample: sample ?? [],
    };
  });

