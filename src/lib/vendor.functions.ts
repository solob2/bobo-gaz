import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---- VENDOR SIDE (self-service) ----

export const getMyVendorAccount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: account } = await supabaseAdmin
      .from("vendor_accounts")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();

    let vendor = null;
    if (account?.vendor_id && account.status === "approved") {
      const { data: v } = await supabaseAdmin
        .from("vendors")
        .select("*")
        .eq("id", account.vendor_id)
        .maybeSingle();
      vendor = v;
    }
    return { account, vendor };
  });

const requestSchema = z.object({
  requestedName: z.string().trim().min(2).max(120),
  requestedPhone: z.string().trim().min(6).max(30),
  requestedQuartier: z.string().trim().min(2).max(80),
  note: z.string().trim().max(500).optional(),
});

export const requestVendorAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => requestSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("vendor_accounts")
      .select("id, status")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (existing) {
      const { error } = await supabaseAdmin
        .from("vendor_accounts")
        .update({
          requested_name: data.requestedName,
          requested_phone: data.requestedPhone,
          requested_quartier: data.requestedQuartier,
          note: data.note ?? null,
          status: existing.status === "rejected" ? "pending" : existing.status,
        })
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("vendor_accounts").insert({
        user_id: context.userId,
        requested_name: data.requestedName,
        requested_phone: data.requestedPhone,
        requested_quartier: data.requestedQuartier,
        note: data.note ?? null,
        status: "pending",
      });
      if (error) throw new Error(error.message);
    }
    await supabaseAdmin.from("app_events").insert({
      level: "info",
      source: "vendor-account",
      message: `Demande d'accès vendeur: ${data.requestedName}`,
      metadata: { userId: context.userId, requestedQuartier: data.requestedQuartier },
    });
    return { ok: true };
  });

const updateStockSchema = z.object({
  isOpen: z.boolean(),
  bottles: z.array(
    z.object({
      size: z.enum(["3kg", "6kg", "12.5kg", "38kg"]),
      price: z.number().int().min(0).max(1_000_000),
      available: z.boolean(),
    }),
  ).min(1).max(10),
});

export const updateMyVendorStock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => updateStockSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: account } = await supabaseAdmin
      .from("vendor_accounts")
      .select("vendor_id, status")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!account || account.status !== "approved" || !account.vendor_id) {
      throw new Error("Compte vendeur non approuvé.");
    }

    // Compute stock level from availability.
    const anyAvail = data.bottles.some((b) => b.available);
    const allAvail = data.bottles.every((b) => b.available);
    const stock = !anyAvail ? "out" : allAvail ? "high" : "low";

    const { error } = await supabaseAdmin
      .from("vendors")
      .update({
        is_open: data.isOpen,
        bottles: data.bottles,
        stock,
      })
      .eq("id", account.vendor_id);
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("app_events").insert({
      level: "info",
      source: "vendor-stock",
      message: `Stock mis à jour par vendeur ${account.vendor_id}`,
      metadata: { vendorId: account.vendor_id, isOpen: data.isOpen, stock },
    });
    return { ok: true, stock };
  });

// ---- ADMIN SIDE ----

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Forbidden");
}

export const listVendorAccountsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("vendor_accounts")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    // Enrich with vendor names and user emails.
    const vendorIds = Array.from(new Set((data ?? []).map((r) => r.vendor_id).filter(Boolean))) as string[];
    const userIds = (data ?? []).map((r) => r.user_id);

    const [{ data: vendors }, usersResp] = await Promise.all([
      vendorIds.length
        ? supabaseAdmin.from("vendors").select("id, name").in("id", vendorIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      supabaseAdmin.auth.admin.listUsers({ perPage: 200 }),
    ]);

    const vendorMap = new Map((vendors ?? []).map((v) => [v.id, v.name]));
    const emailMap = new Map(usersResp.data?.users.filter((u) => userIds.includes(u.id)).map((u) => [u.id, u.email ?? ""]) ?? []);

    return (data ?? []).map((row) => ({
      ...row,
      vendor_name: row.vendor_id ? vendorMap.get(row.vendor_id) ?? null : null,
      email: emailMap.get(row.user_id) ?? null,
    }));
  });

export const listVendorsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("vendors")
      .select("id, name, quartier, is_open, stock")
      .order("id");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const decisionSchema = z.object({
  accountId: z.string().uuid(),
  vendorId: z.string().min(1),
});

export const approveVendorAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => decisionSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Ensure vendor is not already linked to another approved account.
    const { data: conflict } = await supabaseAdmin
      .from("vendor_accounts")
      .select("id, user_id")
      .eq("vendor_id", data.vendorId)
      .eq("status", "approved")
      .maybeSingle();
    if (conflict) throw new Error("Ce vendeur est déjà lié à un compte.");

    const { error } = await supabaseAdmin
      .from("vendor_accounts")
      .update({
        status: "approved",
        vendor_id: data.vendorId,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.accountId);
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("app_events").insert({
      level: "info",
      source: "vendor-account",
      message: `Compte vendeur approuvé → ${data.vendorId}`,
      metadata: { accountId: data.accountId, vendorId: data.vendorId, by: context.userId },
    });
    return { ok: true };
  });

export const rejectVendorAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ accountId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("vendor_accounts")
      .update({
        status: "rejected",
        vendor_id: null,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.accountId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
