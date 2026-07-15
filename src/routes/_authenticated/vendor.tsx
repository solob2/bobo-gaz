import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  getMyVendorAccount,
  requestVendorAccess,
  updateMyVendorStock,
} from "@/lib/vendor.functions";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { LogOut, Store, Clock, CheckCircle2, XCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/vendor")({
  component: VendorPortal,
  head: () => ({
    meta: [
      { title: "Espace vendeur — Gaz à Bobo" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

type Bottle = { size: "3kg" | "6kg" | "12.5kg" | "38kg"; price: number; available: boolean };
const ALL_SIZES: Bottle["size"][] = ["3kg", "6kg", "12.5kg", "38kg"];

function VendorPortal() {
  const navigate = useNavigate();
  const getAccount = useServerFn(getMyVendorAccount);
  const requestAccess = useServerFn(requestVendorAccess);
  const updateStock = useServerFn(updateMyVendorStock);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["vendor-account"],
    queryFn: () => getAccount(),
    refetchInterval: 30_000,
  });

  const account = data?.account ?? null;
  const vendor = data?.vendor ?? null;

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Store className="h-6 w-6" /> Espace vendeur
            </h1>
            <p className="text-sm text-muted-foreground">
              Gérez votre stock et votre disponibilité.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/">← Site</Link>
            </Button>
            <Button variant="outline" size="sm" onClick={signOut}>
              <LogOut className="h-4 w-4 mr-1" /> Déconnexion
            </Button>
          </div>
        </div>

        {isLoading ? (
          <Card><CardContent className="py-8 text-center text-muted-foreground">Chargement…</CardContent></Card>
        ) : !account ? (
          <RequestAccessForm
            onSubmit={async (payload) => {
              await requestAccess({ data: payload });
              toast.success("Demande envoyée. Un admin va la valider.");
              refetch();
            }}
          />
        ) : account.status === "pending" ? (
          <PendingCard account={account} />
        ) : account.status === "rejected" ? (
          <RejectedCard
            onResubmit={async (payload) => {
              await requestAccess({ data: payload });
              toast.success("Demande renvoyée.");
              refetch();
            }}
          />
        ) : vendor ? (
          <ApprovedPanel
            vendor={{
              id: vendor.id,
              name: vendor.name,
              quartier: vendor.quartier,
              is_open: vendor.is_open,
              stock: vendor.stock,
              bottles: (vendor.bottles as unknown as Bottle[]) ?? [],
            }}
            onSave={async (payload) => {
              await updateStock({ data: payload });
              toast.success("Stock mis à jour.");
              refetch();
            }}
          />

        ) : (
          <Card><CardContent className="py-8 text-center text-muted-foreground">Compte approuvé mais aucun vendeur lié. Contactez l'admin.</CardContent></Card>
        )}
      </div>
    </div>
  );
}

function RequestAccessForm({
  onSubmit,
}: {
  onSubmit: (p: { requestedName: string; requestedPhone: string; requestedQuartier: string; note?: string }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [quartier, setQuartier] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSubmit({
        requestedName: name,
        requestedPhone: phone,
        requestedQuartier: quartier,
        note: note || undefined,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Demander un accès vendeur</CardTitle>
        <CardDescription>Remplissez ce formulaire — un administrateur validera votre compte et l'associera à votre point de vente.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="rn">Nom du point de vente</Label>
            <Input id="rn" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex : Boutique Mariam" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="rp">Téléphone</Label>
              <Input id="rp" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="226..." />
            </div>
            <div>
              <Label htmlFor="rq">Quartier</Label>
              <Input id="rq" required value={quartier} onChange={(e) => setQuartier(e.target.value)} placeholder="Accart-Ville" />
            </div>
          </div>
          <div>
            <Label htmlFor="rnote">Message (facultatif)</Label>
            <Textarea id="rnote" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Marque, horaires, formats proposés…" />
          </div>
          <Button type="submit" disabled={loading}>
            {loading ? "Envoi…" : "Envoyer la demande"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function PendingCard({ account }: { account: { requested_name: string | null; created_at: string } }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-amber-600" /> Demande en attente
        </CardTitle>
        <CardDescription>Votre demande pour <strong>{account.requested_name}</strong> a été envoyée le {new Date(account.created_at).toLocaleDateString("fr-FR")}.</CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        Un administrateur va lier votre compte à votre point de vente. Revenez sur cette page pour vérifier — elle se rafraîchit automatiquement.
      </CardContent>
    </Card>
  );
}

function RejectedCard({ onResubmit }: { onResubmit: (p: { requestedName: string; requestedPhone: string; requestedQuartier: string; note?: string }) => Promise<void> }) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-destructive" /> Demande refusée
          </CardTitle>
          <CardDescription>Votre précédente demande a été refusée. Vous pouvez la modifier et la renvoyer.</CardDescription>
        </CardHeader>
      </Card>
      <RequestAccessForm onSubmit={onResubmit} />
    </>
  );
}

function ApprovedPanel({
  vendor,
  onSave,
}: {
  vendor: { id: string; name: string; quartier: string; is_open: boolean; bottles: Bottle[]; stock: string };
  onSave: (p: { isOpen: boolean; bottles: Bottle[] }) => Promise<void>;
}) {
  const [isOpen, setIsOpen] = useState(vendor.is_open);
  const [bottles, setBottles] = useState<Bottle[]>(() => {
    // Ensure at least one row.
    return vendor.bottles.length ? vendor.bottles : [{ size: "6kg", price: 3500, available: true }];
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setIsOpen(vendor.is_open);
    setBottles(vendor.bottles.length ? vendor.bottles : [{ size: "6kg", price: 3500, available: true }]);
  }, [vendor.id, vendor.is_open, vendor.bottles]);

  const setBottle = (i: number, patch: Partial<Bottle>) =>
    setBottles((prev) => prev.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  const addBottle = () => {
    const used = new Set(bottles.map((b) => b.size));
    const next = ALL_SIZES.find((s) => !used.has(s));
    if (!next) return;
    setBottles([...bottles, { size: next, price: 3500, available: true }]);
  };
  const removeBottle = (i: number) => setBottles(bottles.filter((_, idx) => idx !== i));

  const save = async () => {
    // Deduplicate by size.
    const seen = new Set<string>();
    const clean: Bottle[] = [];
    for (const b of bottles) {
      if (seen.has(b.size)) continue;
      seen.add(b.size);
      clean.push({ ...b, price: Math.max(0, Math.round(b.price)) });
    }
    if (!clean.length) {
      toast.error("Ajoutez au moins un format.");
      return;
    }
    setSaving(true);
    try {
      await onSave({ isOpen, bottles: clean });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" /> {vendor.name}
            </CardTitle>
            <CardDescription>{vendor.quartier} · ID {vendor.id}</CardDescription>
          </div>
          <Badge variant={isOpen ? "default" : "secondary"}>{isOpen ? "Ouvert" : "Fermé"}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <Label htmlFor="open" className="text-base">Point de vente ouvert</Label>
            <p className="text-xs text-muted-foreground">Décochez si vous êtes temporairement fermé — vous n'apparaîtrez plus comme disponible.</p>
          </div>
          <Switch id="open" checked={isOpen} onCheckedChange={setIsOpen} />
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Bouteilles & prix</h3>
            <Button size="sm" variant="outline" onClick={addBottle} disabled={bottles.length >= ALL_SIZES.length}>
              + Ajouter un format
            </Button>
          </div>
          <div className="space-y-3">
            {bottles.map((b, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-end rounded-md border p-3">
                <div className="col-span-3">
                  <Label className="text-xs">Format</Label>
                  <select
                    className="w-full h-9 rounded-md border bg-background px-2 text-sm"
                    value={b.size}
                    onChange={(e) => setBottle(i, { size: e.target.value as Bottle["size"] })}
                  >
                    {ALL_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="col-span-4">
                  <Label className="text-xs">Prix (FCFA)</Label>
                  <Input
                    type="number"
                    min={0}
                    step={50}
                    value={b.price}
                    onChange={(e) => setBottle(i, { price: Number(e.target.value) })}
                  />
                </div>
                <div className="col-span-3 flex items-center gap-2 pb-2">
                  <Switch checked={b.available} onCheckedChange={(v) => setBottle(i, { available: v })} />
                  <span className="text-sm">{b.available ? "En stock" : "Rupture"}</span>
                </div>
                <div className="col-span-2 text-right">
                  <Button size="sm" variant="ghost" onClick={() => removeBottle(i)} disabled={bottles.length <= 1}>
                    Retirer
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <Separator />
        <div className="flex justify-end">
          <Button onClick={save} disabled={saving}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
