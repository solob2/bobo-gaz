import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { CheckCircle2, ArrowLeft, MessageCircle, MapPin, Phone, Receipt, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getOrder } from "@/lib/payments.functions";

const q = (id: string) =>
  queryOptions({ queryKey: ["order", id], queryFn: () => getOrder({ data: { id } }) });

export const Route = createFileRoute("/commande_/$id/confirmation")({
  head: ({ params }) => ({
    meta: [
      { title: `Commande confirmée ${params.id.slice(0, 8)} · GazMap Bobo` },
      { name: "description", content: "Récapitulatif de votre commande de gaz payée." },
      { property: "og:title", content: "Commande confirmée · GazMap Bobo" },
      { property: "og:description", content: "Récapitulatif de votre commande de gaz payée." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: ({ params, context }) => context.queryClient.ensureQueryData(q(params.id)),
  component: ConfirmationPage,
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-lg p-8 text-center">
      <p className="text-destructive">Impossible de charger cette commande.</p>
      <p className="mt-1 text-xs text-muted-foreground">{(error as Error).message}</p>
      <Button asChild variant="outline" className="mt-4"><Link to="/">Retour</Link></Button>
    </div>
  ),
  notFoundComponent: () => <div className="p-8 text-center">Commande introuvable.</div>,
});

const fmt = (n: number) => n.toLocaleString("fr-FR") + " FCFA";

function ConfirmationPage() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(q(id));
  const o = data.order;
  const ref = o.id.slice(0, 8).toUpperCase();

  if (o.status !== "paid") {
    return (
      <div className="mx-auto max-w-lg p-8 text-center space-y-4">
        <Clock className="mx-auto h-10 w-10 text-muted-foreground" />
        <p>Le paiement de cette commande n'est pas encore confirmé.</p>
        <Button asChild><Link to="/commande/$id" params={{ id }}>Suivre ma commande</Link></Button>
      </div>
    );
  }

  const message = [
    `Bonjour ${o.vendor_name},`,
    `J'ai payé une commande via GazMap Bobo.`,
    ``,
    `Réf : #${ref}`,
    `Bouteille : ${o.bottle_size} × ${o.quantity}`,
    `Total payé : ${fmt(o.amount)}${o.cinetpay_payment_method ? ` (${o.cinetpay_payment_method})` : ""}`,
    ``,
    `Client : ${o.customer_name}`,
    `Tél : ${o.customer_phone}`,
    `Adresse : ${o.customer_address}`,
    o.notes ? `Notes : ${o.notes}` : "",
    ``,
    `Merci de confirmer l'heure de livraison.`,
  ].filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n");
  const wa = `https://wa.me/${o.vendor_whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`;

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-2xl px-4 py-8">
        <Link to="/" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Retour à la carte
        </Link>

        <Card className="overflow-hidden p-0">
          <div className="bg-success/10 p-6 text-center border-b border-border">
            <CheckCircle2 className="mx-auto h-14 w-14 text-success" />
            <h1 className="mt-3 text-2xl font-bold">Merci, commande confirmée !</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Paiement reçu{o.paid_at ? ` le ${new Date(o.paid_at).toLocaleString("fr-FR")}` : ""} · Réf #{ref}
            </p>
          </div>

          <div className="space-y-5 p-5">
            <div>
              <h2 className="mb-2 flex items-center gap-1 text-sm font-semibold text-muted-foreground">
                <Receipt className="h-4 w-4" /> Récapitulatif
              </h2>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span>Vendeur</span><span className="font-medium">{o.vendor_name}</span></div>
                <div className="flex justify-between"><span>Bouteille {o.bottle_size} × {o.quantity}</span><span>{fmt(o.unit_price * o.quantity)}</span></div>
                <div className="flex justify-between text-muted-foreground"><span>Livraison</span><span>{o.delivery_fee === 0 ? "—" : fmt(o.delivery_fee)}</span></div>
                <Separator className="my-1" />
                <div className="flex justify-between font-semibold"><span>Total payé</span><span>{fmt(o.amount)}</span></div>
                {o.cinetpay_payment_method && (
                  <div className="flex justify-between text-xs text-muted-foreground"><span>Moyen de paiement</span><span>{o.cinetpay_payment_method}</span></div>
                )}
              </div>
            </div>

            <Separator />

            <div className="space-y-1 text-sm">
              <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Livraison</h2>
              <p className="font-medium">{o.customer_name}</p>
              <p className="flex items-center gap-1 text-muted-foreground"><Phone className="h-3 w-3" /> {o.customer_phone}</p>
              <p className="flex items-center gap-1 text-muted-foreground"><MapPin className="h-3 w-3" /> {o.customer_address}</p>
              {o.notes && <p className="italic text-muted-foreground">« {o.notes} »</p>}
            </div>

            <Separator />

            <div>
              <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Message au vendeur</h2>
              <pre className="whitespace-pre-wrap rounded-md border border-border bg-muted p-3 text-xs font-sans">{message}</pre>
            </div>

            <Button asChild size="lg" className="w-full bg-success text-success-foreground hover:bg-success/90">
              <a href={wa} target="_blank" rel="noreferrer">
                <MessageCircle className="mr-1 h-4 w-4" /> Envoyer sur WhatsApp au vendeur
              </a>
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
