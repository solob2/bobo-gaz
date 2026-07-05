import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CreditCard, Loader2, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import type { Vendor } from "@/lib/vendors";
import { initOrderPayment, type InitOrderPaymentInput } from "@/lib/payments.functions";

// Frais de livraison fixes par vendeur (miroir client de getDeliveryFee).
function feeForVendor(v: Vendor): number {
  if (!v.delivery) return 0;
  const n = Number(v.id.replace(/\D/g, "")) || 1;
  return 500 + (n % 5) * 250;
}

const fmt = (n: number) => n.toLocaleString("fr-FR") + " FCFA";

export function CheckoutForm({ vendor, onClose }: { vendor: Vendor; onClose: () => void }) {
  const available = vendor.bottles.filter((b) => b.available);
  const [bottleSize, setBottleSize] = useState<string>(available[0]?.size ?? "");
  const [quantity, setQuantity] = useState<number>(1);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const bottle = vendor.bottles.find((b) => b.size === bottleSize);
  const deliveryFee = feeForVendor(vendor);
  const subtotal = (bottle?.price ?? 0) * quantity;
  const total = subtotal + deliveryFee;

  const mutation = useMutation({
    mutationFn: (input: Parameters<typeof initOrderPayment>[0]["data"]) =>
      initOrderPayment({ data: input }),
    onSuccess: ({ paymentUrl }) => {
      // Redirection vers la page de paiement CinetPay.
      window.location.href = paymentUrl;
    },
    onError: (err: Error) => setError(err.message),
  });

  const canSubmit =
    bottleSize &&
    quantity > 0 &&
    customerName.trim().length >= 2 &&
    customerPhone.trim().length >= 8 &&
    customerAddress.trim().length >= 3 &&
    !mutation.isPending;

  if (available.length === 0) {
    return (
      <div className="rounded-md border border-border bg-muted p-4 text-sm text-muted-foreground">
        Aucune bouteille en stock chez ce vendeur pour le moment.
        <Button variant="ghost" size="sm" onClick={onClose} className="mt-2">Fermer</Button>
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        mutation.mutate({
          vendorId: vendor.id,
          bottleSize,
          quantity,
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          customerAddress: customerAddress.trim(),
          notes: notes.trim() || undefined,
        });
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label htmlFor="bottle">Bouteille</Label>
          <Select value={bottleSize} onValueChange={setBottleSize}>
            <SelectTrigger id="bottle"><SelectValue /></SelectTrigger>
            <SelectContent>
              {available.map((b) => (
                <SelectItem key={b.size} value={b.size}>
                  {b.size} — {fmt(b.price)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="qty">Quantité</Label>
          <Input
            id="qty" type="number" min={1} max={20}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
          />
        </div>
        <div>
          <Label>Total</Label>
          <div className="flex h-9 items-center rounded-md border border-input bg-muted px-3 text-sm font-semibold">
            {fmt(total)}
          </div>
        </div>
      </div>

      <Separator />

      <div className="space-y-3">
        <div>
          <Label htmlFor="name">Votre nom complet</Label>
          <Input id="name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Ex. Aminata Ouédraogo" maxLength={80} />
        </div>
        <div>
          <Label htmlFor="phone">Téléphone (Orange Money / Moov)</Label>
          <Input id="phone" inputMode="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Ex. 70 00 00 00" maxLength={20} />
        </div>
        <div>
          <Label htmlFor="addr">Adresse de livraison</Label>
          <Input id="addr" value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} placeholder="Quartier, rue, point de repère" maxLength={200} />
        </div>
        <div>
          <Label htmlFor="notes">Notes (optionnel)</Label>
          <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Consigne ancienne bouteille, horaire, etc." maxLength={500} rows={2} />
        </div>
      </div>

      <div className="rounded-md border border-border bg-card p-3 text-sm space-y-1">
        <div className="flex justify-between"><span>Sous-total</span><span>{fmt(subtotal)}</span></div>
        <div className="flex justify-between text-muted-foreground">
          <span className="flex items-center gap-1"><Truck className="h-3 w-3" /> Livraison</span>
          <span>{deliveryFee === 0 ? "—" : fmt(deliveryFee)}</span>
        </div>
        <Separator className="my-1" />
        <div className="flex justify-between font-semibold"><span>Total à payer</span><span>{fmt(total)}</span></div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-2">
          <Badge variant="outline">Orange Money</Badge>
          <Badge variant="outline">Moov</Badge>
          <Badge variant="outline">Visa</Badge>
        </span>
        <span>Paiement sécurisé via CinetPay</span>
      </div>

      <div className="flex gap-2">
        <Button type="button" variant="ghost" onClick={onClose} className="flex-1">Annuler</Button>
        <Button type="submit" disabled={!canSubmit} className="flex-1">
          {mutation.isPending ? (
            <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Redirection…</>
          ) : (
            <><CreditCard className="mr-1 h-4 w-4" /> Payer {fmt(total)}</>
          )}
        </Button>
      </div>
    </form>
  );
}
