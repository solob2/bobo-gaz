import { createServerFn } from "@tanstack/react-start";
import { getRequestHost } from "@tanstack/react-start/server";
import { z } from "zod";
import { VENDORS, type Vendor } from "@/lib/vendors";

// Frais de livraison fixes par vendeur (déterministes, basés sur l'id).
export function getDeliveryFee(vendor: Pick<Vendor, "id" | "delivery">): number {
  if (!vendor.delivery) return 0;
  const n = Number(vendor.id.replace(/\D/g, "")) || 1;
  // 500 / 750 / 1000 / 1250 / 1500 FCFA
  return 500 + (n % 5) * 250;
}

const initSchema = z.object({
  vendorId: z.string().min(1),
  bottleSize: z.string().min(1),
  quantity: z.number().int().min(1).max(20),
  customerName: z.string().trim().min(2).max(80),
  customerPhone: z.string().trim().min(8).max(20),
  customerAddress: z.string().trim().min(3).max(200),
  notes: z.string().trim().max(500).optional(),
});

export type InitOrderPaymentInput = z.infer<typeof initSchema>;

function getAppOrigin(): string {
  // 1. Prefer explicit env (allows overriding for CinetPay callbacks).
  const envUrl = process.env.PUBLIC_APP_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");
  // 2. Fall back to the current request host.
  try {
    const host = getRequestHost();
    if (host) return `https://${host}`;
  } catch {
    // getRequestHost throws outside a request context
  }
  return "http://localhost:8080";
}

export const initOrderPayment = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => initSchema.parse(data))
  .handler(async ({ data }) => {
    const vendor = VENDORS.find((v) => v.id === data.vendorId);
    if (!vendor) throw new Error("Vendeur introuvable.");

    const bottle = vendor.bottles.find((b) => b.size === data.bottleSize);
    if (!bottle) throw new Error("Bouteille indisponible chez ce vendeur.");
    if (!bottle.available) throw new Error("Cette bouteille est en rupture.");

    const deliveryFee = getDeliveryFee(vendor);
    const subtotal = bottle.price * data.quantity;
    const amount = subtotal + deliveryFee;

    if (amount < 100) throw new Error("Montant trop faible.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { initPayment } = await import("@/lib/cinetpay.server");

    // Transaction ID unique et lisible (max 20 chars conseillé par CinetPay).
    const transactionId = `GB${Date.now().toString(36).toUpperCase()}${Math.random()
      .toString(36)
      .slice(2, 6)
      .toUpperCase()}`;

    // Split "Nom Prénom" for CinetPay.
    const [firstName, ...rest] = data.customerName.trim().split(/\s+/);
    const surname = rest.join(" ") || firstName;

    const origin = getAppOrigin();
    const notifyUrl = `${origin}/api/public/cinetpay-webhook`;

    const { data: order, error: insertErr } = await supabaseAdmin
      .from("orders")
      .insert({
        vendor_id: vendor.id,
        vendor_name: vendor.name,
        vendor_phone: vendor.phone,
        vendor_whatsapp: vendor.whatsapp,
        bottle_size: data.bottleSize,
        quantity: data.quantity,
        unit_price: bottle.price,
        delivery_fee: deliveryFee,
        amount,
        currency: "XOF",
        customer_name: data.customerName,
        customer_phone: data.customerPhone,
        customer_address: data.customerAddress,
        notes: data.notes ?? null,
        status: "pending",
        cinetpay_transaction_id: transactionId,
      })
      .select("id")
      .single();

    if (insertErr || !order) {
      throw new Error(`Impossible d'enregistrer la commande: ${insertErr?.message ?? "?"}`);
    }

    const returnUrl = `${origin}/commande/${order.id}`;

    try {
      const { paymentUrl, paymentToken } = await initPayment({
        transactionId,
        amount,
        description: `Gaz ${data.bottleSize} x${data.quantity} - ${vendor.name}`,
        customerName: firstName,
        customerSurname: surname,
        customerPhone: data.customerPhone,
        notifyUrl,
        returnUrl,
        metadata: order.id,
      });

      await supabaseAdmin
        .from("orders")
        .update({ cinetpay_payment_url: paymentUrl })
        .eq("id", order.id);

      return { orderId: order.id, paymentUrl, paymentToken };
    } catch (err) {
      await supabaseAdmin
        .from("orders")
        .update({ status: "failed", cinetpay_last_event: { init_error: String(err) } })
        .eq("id", order.id);
      throw err;
    }
  });

const getOrderSchema = z.object({ id: z.string().uuid() });

export const getOrder = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => getOrderSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select(
        "id, vendor_name, vendor_whatsapp, bottle_size, quantity, unit_price, delivery_fee, amount, currency, customer_name, customer_phone, customer_address, notes, status, cinetpay_payment_url, cinetpay_payment_method, paid_at, created_at",
      )
      .eq("id", data.id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!order) throw new Error("Commande introuvable");
    return { order };
  });

// Re-check status via CinetPay (useful on the return page if webhook is delayed).
export const refreshOrderStatus = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => getOrderSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { checkPayment } = await import("@/lib/cinetpay.server");

    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, status, cinetpay_transaction_id")
      .eq("id", data.id)
      .maybeSingle();

    if (!order) throw new Error("Commande introuvable");
    if (order.status === "paid") return { status: "paid" as const };

    const result = await checkPayment(order.cinetpay_transaction_id);

    let newStatus: "pending" | "paid" | "failed" | "cancelled" = "pending";
    if (result.status === "ACCEPTED") newStatus = "paid";
    else if (result.status === "REFUSED") newStatus = "failed";
    else if (result.status === "CANCELLED") newStatus = "cancelled";

    if (newStatus !== order.status) {
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
    }
    return { status: newStatus };
  });
