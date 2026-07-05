import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { queryOptions, useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { CheckCircle2, XCircle, Clock, ArrowLeft, MessageCircle, MapPin, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { getOrder, refreshOrderStatus } from "@/lib/payments.functions";

const orderQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ["order", id],
    queryFn: () => getOrder({ data: { id } }),
    refetchInterval: (q) => {
      const s = q.state.data?.order.status;
      return s === "pending" ? 3000 : false;
    },
  });

export const Route = createFileRoute("/commande/$id")({
  head: ({ params }) => ({
    meta: [
      { title: `Commande ${params.id.slice(0, 8)} · GazMap Bobo` },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: ({ params, context }) =>
    context.queryClient.ensureQueryData(orderQueryOptions(params.id)),
  component: OrderPage,
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-lg p-8 text-center">
      <p className="text-destructive">Impossible de charger cette commande.</p>
      <p className="mt-1 text-xs text-muted-foreground">{error.message}</p>
      <Button asChild variant="outline" className="mt-4">
        <Link to="/"><ArrowLeft className="mr-1 h-4 w-4" /> Retour</Link>
      </Button>
    </div>
  ),
  notFoundComponent: () => <div className="p-8 text-center">Commande introuvable.</div>,
});

const fmt = (n: number) => n.toLocaleString("fr-FR") + " FCFA";

function OrderPage() {
  const { id } = Route.useParams();
  const { data, refetch } = useSuspenseQuery(orderQueryOptions(id));
  const order = data.order;

  // Re-vérification immédiate côté CinetPay au retour du checkout (webhook peut arriver après).
  const refresh = useQuery({
    queryKey: ["order-refresh", id],
    queryFn: () => refreshOrderStatus({ data: { id } }),
    enabled: order.status === "pending",
    refetchInterval: order.status === "pending" ? 4000 : false,
  });

  useEffect(() => {
    if (refresh.data && refresh.data.status !== order.status) refetch();
  }, [refresh.data, order.status, refetch]);

  const wa = `https://wa.me/${order.vendor_whatsapp}?text=${encodeURIComponent(
    `Bonjour, j'ai payé une commande de gaz via GazMap Bobo (réf ${order.id.slice(0, 8)}). Merci de confirmer la livraison à : ${order.customer_address}`,
  )}`;

  const statusMeta = {
    pending: { icon: Clock, label: "En attente de paiement", color: "bg-warning text-warning-foreground" },
    paid: { icon: CheckCircle2, label: "Payé", color: "bg-success text-success-foreground" },
    failed: { icon: XCircle, label: "Paiement échoué", color: "bg-destructive text-destructive-foreground" },
    cancelled: { icon: XCircle, label: "Annulé", color: "bg-muted text-muted-foreground" },
  }[order.status as "pending" | "paid" | "failed" | "cancelled"];

  const StatusIcon = statusMeta.icon;

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-2xl px-4 py-8">
        <Link to="/" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Retour à la carte
        </Link>

        <Card className="overflow-hidden p-0">
          <div className="flex items-center gap-3 border-b border-border bg-card p-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <StatusIcon className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <Badge className={statusMeta.color}>{statusMeta.label}</Badge>
              <h1 className="mt-1 text-lg font-bold">Commande #{order.id.slice(0, 8).toUpperCase()}</h1>
              <p className="text-xs text-muted-foreground">
                {new Date(order.created_at).toLocaleString("fr-FR")}
              </p>
            </div>
          </div>

          <div className="space-y-5 p-5">
            {order.status === "pending" && (
              <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
                Nous vérifions la confirmation de votre paiement… Cette page se met à jour automatiquement.
                {order.cinetpay_payment_url && (
                  <>
                    <br />
                    <a href={order.cinetpay_payment_url} className="text-primary underline">
                      Reprendre le paiement
                    </a>
                  </>
                )}
              </div>
            )}

            {order.status === "paid" && (
              <div className="rounded-md border border-success/40 bg-success/10 p-3 text-sm">
                Paiement confirmé. Le vendeur va vous contacter pour la livraison.
              </div>
            )}

            {(order.status === "failed" || order.status === "cancelled") && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
                Le paiement n'a pas été finalisé. Vous pouvez réessayer depuis la fiche vendeur.
              </div>
            )}

            <div>
              <h2 className="text-sm font-semibold text-muted-foreground">Vendeur</h2>
              <p className="mt-1 font-medium">{order.vendor_name}</p>
            </div>

            <Separator />

            <div>
              <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Détails de la commande</h2>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span>Bouteille {order.bottle_size} × {order.quantity}</span><span>{fmt(order.unit_price * order.quantity)}</span></div>
                <div className="flex justify-between text-muted-foreground"><span>Livraison</span><span>{order.delivery_fee === 0 ? "—" : fmt(order.delivery_fee)}</span></div>
                <Separator className="my-1" />
                <div className="flex justify-between font-semibold"><span>Total</span><span>{fmt(order.amount)}</span></div>
                {order.cinetpay_payment_method && (
                  <div className="flex justify-between text-xs text-muted-foreground pt-1">
                    <span>Moyen de paiement</span><span>{order.cinetpay_payment_method}</span>
                  </div>
                )}
              </div>
            </div>

            <Separator />

            <div>
              <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Livraison</h2>
              <div className="space-y-1 text-sm">
                <p className="font-medium">{order.customer_name}</p>
                <p className="flex items-center gap-1 text-muted-foreground"><Phone className="h-3 w-3" /> {order.customer_phone}</p>
                <p className="flex items-center gap-1 text-muted-foreground"><MapPin className="h-3 w-3" /> {order.customer_address}</p>
                {order.notes && <p className="text-muted-foreground italic">« {order.notes} »</p>}
              </div>
            </div>

            {order.status === "paid" && (
              <Button asChild className="w-full bg-success text-success-foreground hover:bg-success/90">
                <a href={wa} target="_blank" rel="noreferrer">
                  <MessageCircle className="mr-1 h-4 w-4" /> Contacter le vendeur sur WhatsApp
                </a>
              </Button>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
