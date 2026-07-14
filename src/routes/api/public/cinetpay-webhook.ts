import { createFileRoute } from "@tanstack/react-router";

// Webhook CinetPay. La notif ne fait que déclencher une revérification
// authoritative via /v2/payment/check — on ne fait pas confiance au body.
export const Route = createFileRoute("/api/public/cinetpay-webhook")({
  server: {
    handlers: {
      GET: async () => new Response("cinetpay-webhook up", { status: 200 }),
      POST: async ({ request }) => {
        let transactionId: string | undefined;

        const contentType = request.headers.get("content-type") ?? "";
        try {
          if (contentType.includes("application/json")) {
            const body = (await request.json()) as Record<string, unknown>;
            transactionId =
              (body.cpm_trans_id as string | undefined) ??
              (body.transaction_id as string | undefined);
          } else {
            const form = await request.formData();
            transactionId =
              (form.get("cpm_trans_id") as string | null) ??
              (form.get("transaction_id") as string | null) ??
              undefined;
          }
        } catch {
          // fall through
        }

        if (!transactionId) {
          return new Response("missing transaction_id", { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { checkPayment } = await import("@/lib/cinetpay.server");

        const { data: order } = await supabaseAdmin
          .from("orders")
          .select("id, status")
          .eq("cinetpay_transaction_id", transactionId)
          .maybeSingle();

        if (!order) return new Response("order not found", { status: 404 });
        if (order.status === "paid") return new Response("already paid", { status: 200 });

        const result = await checkPayment(transactionId);

        let newStatus: "pending" | "paid" | "failed" | "cancelled" = order.status as never;
        if (result.status === "ACCEPTED") newStatus = "paid";
        else if (result.status === "REFUSED") newStatus = "failed";
        else if (result.status === "CANCELLED") newStatus = "cancelled";

        await supabaseAdmin
          .from("orders")
          .update({
            status: newStatus,
            cinetpay_payment_method: result.paymentMethod ?? null,
            cinetpay_operator_id: result.operatorId ?? null,
            cinetpay_last_event: result.raw as never,
            paid_at: newStatus === "paid" ? new Date().toISOString() : null,
          })
          .eq("id", order.id);

        await supabaseAdmin.from("app_events").insert({
          level: newStatus === "failed" ? "error" : "info",
          source: "cinetpay-webhook",
          message: `Commande ${order.id.slice(0, 8)} → ${newStatus}`,
          metadata: { orderId: order.id, transactionId, status: newStatus },
        });

        return new Response("ok", { status: 200 });
      },
    },
  },
});
