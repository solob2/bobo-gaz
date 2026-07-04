import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useMemo, useState, useEffect } from "react";
import { queryOptions, useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { Phone, MessageCircle, MapPin, Clock, Filter, Flame, Truck, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { QUARTIERS, BRANDS, stockLabel, type Vendor, type StockLevel } from "@/lib/vendors";
import { listVendorsViaMcp, getVendorViaMcp } from "@/lib/mcp-client.functions";

const vendorsQueryOptions = queryOptions({
  queryKey: ["mcp", "list_vendors"],
  queryFn: () => listVendorsViaMcp({ data: {} }),
  staleTime: 30_000,
});

const VendorMap = lazy(() =>
  import("@/components/VendorMap").then((m) => ({ default: m.VendorMap })),
);

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "GazMap Bobo — Carte du gaz butane à Bobo-Dioulasso" },
      {
        name: "description",
        content:
          "Localisez en temps réel les points de vente de gaz butane à Bobo-Dioulasso : stock, prix, contact direct et livraison.",
      },
      { property: "og:title", content: "GazMap Bobo — Carte du gaz butane" },
      {
        property: "og:description",
        content: "Trouvez du gaz butane disponible près de chez vous à Bobo-Dioulasso.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(vendorsQueryOptions),
  component: Index,
  errorComponent: ({ error }) => (
    <div className="p-8 text-center text-sm text-destructive">
      Erreur de chargement : {error.message}
    </div>
  ),
});

const STOCK_COLORS: Record<StockLevel, string> = {
  high: "bg-success text-success-foreground",
  low: "bg-warning text-warning-foreground",
  out: "bg-destructive text-destructive-foreground",
};

function Index() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [search, setSearch] = useState("");
  const [quartier, setQuartier] = useState<string>("all");
  const [brand, setBrand] = useState<string>("all");
  const [stockOnly, setStockOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: listData } = useSuspenseQuery(vendorsQueryOptions);
  const vendors: Vendor[] = listData.vendors;

  const filtered = useMemo(() => {
    return vendors.filter((v) => {
      if (quartier !== "all" && v.quartier !== quartier) return false;
      if (brand !== "all" && v.brand !== brand) return false;
      if (stockOnly && v.stock === "out") return false;
      if (search) {
        const s = search.toLowerCase();
        if (
          !v.name.toLowerCase().includes(s) &&
          !v.quartier.toLowerCase().includes(s) &&
          !v.brand.toLowerCase().includes(s)
        )
          return false;
      }
      return true;
    });
  }, [vendors, search, quartier, brand, stockOnly]);

  const stats = useMemo(() => {
    const high = vendors.filter((v) => v.stock === "high").length;
    const low = vendors.filter((v) => v.stock === "low").length;
    const out = vendors.filter((v) => v.stock === "out").length;
    return { total: vendors.length, high, low, out };
  }, [vendors]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* HEADER */}
      <header className="border-b border-border bg-card/80 backdrop-blur sticky top-0 z-30">
        <div className="container mx-auto flex items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg text-primary-foreground"
              style={{ background: "var(--gradient-hero)" }}
            >
              <Flame className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight">GazMap Bobo</h1>
              <p className="text-xs text-muted-foreground">
                Cartographie du gaz butane · Bobo-Dioulasso
              </p>
            </div>
          </div>
          <div className="hidden items-center gap-2 md:flex">
            <Badge variant="outline" className="gap-1">
              <span className="h-2 w-2 rounded-full bg-success" /> {stats.high} en stock
            </Badge>
            <Badge variant="outline" className="gap-1">
              <span className="h-2 w-2 rounded-full bg-warning" /> {stats.low} faible
            </Badge>
            <Badge variant="outline" className="gap-1">
              <span className="h-2 w-2 rounded-full bg-destructive" /> {stats.out} rupture
            </Badge>
          </div>
        </div>
      </header>

      {/* HERO BAND */}
      <section
        className="border-b border-border"
        style={{ background: "var(--gradient-hero)" }}
      >
        <div className="container mx-auto px-4 py-8 text-primary-foreground">
          <h2 className="text-2xl font-bold md:text-3xl">
            Trouvez du gaz disponible près de chez vous.
          </h2>
          <p className="mt-1 max-w-2xl text-sm opacity-90 md:text-base">
            Stock en temps réel, prix affichés, contact direct WhatsApp et livraison à
            domicile dans les quartiers de Bobo-Dioulasso.
          </p>
        </div>
      </section>

      {/* MAIN: filters + list + map */}
      <main className="container mx-auto flex-1 px-4 py-6">
        <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
          {/* LEFT PANEL */}
          <div className="flex flex-col gap-4">
            <Card className="p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Filter className="h-4 w-4 text-primary" />
                Filtres
              </div>
              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Rechercher un vendeur, marque…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Select value={quartier} onValueChange={setQuartier}>
                    <SelectTrigger><SelectValue placeholder="Quartier" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous quartiers</SelectItem>
                      {QUARTIERS.map((q) => (
                        <SelectItem key={q} value={q}>{q}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={brand} onValueChange={setBrand}>
                    <SelectTrigger><SelectValue placeholder="Marque" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Toutes marques</SelectItem>
                      {BRANDS.map((b) => (
                        <SelectItem key={b} value={b}>{b}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={stockOnly}
                    onChange={(e) => setStockOnly(e.target.checked)}
                    className="h-4 w-4 accent-[var(--color-primary)]"
                  />
                  Afficher uniquement les points en stock
                </label>
                {(quartier !== "all" || brand !== "all" || stockOnly || search) && (
                  <Button
                    variant="ghost" size="sm"
                    onClick={() => { setQuartier("all"); setBrand("all"); setStockOnly(false); setSearch(""); }}
                    className="w-full"
                  >
                    <X className="mr-1 h-3 w-3" /> Réinitialiser
                  </Button>
                )}
              </div>
            </Card>

            <Card className="flex-1 overflow-hidden p-0">
              <div className="border-b border-border px-4 py-3">
                <p className="text-sm font-semibold">
                  {filtered.length} point{filtered.length > 1 ? "s" : ""} de vente
                </p>
              </div>
              <ScrollArea className="h-[520px]">
                <div className="divide-y divide-border">
                  {filtered.map((v) => (
                    <VendorRow
                      key={v.id}
                      vendor={v}
                      selected={v.id === selectedId}
                      onClick={() => setSelectedId(v.id)}
                    />
                  ))}
                  {filtered.length === 0 && (
                    <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                      Aucun vendeur ne correspond aux filtres.
                    </p>
                  )}
                </div>
              </ScrollArea>
            </Card>
          </div>

          {/* MAP */}
          <Card className="h-[600px] overflow-hidden p-0 lg:h-[820px]">
            {mounted ? (
              <Suspense fallback={<MapSkeleton />}>
                <VendorMap
                  vendors={filtered}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                />
              </Suspense>
            ) : (
              <MapSkeleton />
            )}
          </Card>
        </div>

        {/* Legend / how-to */}
        <section className="mt-8 grid gap-4 md:grid-cols-3">
          <InfoCard
            icon={<MapPin className="h-5 w-5" />}
            title="Localiser"
            text="Visualisez tous les dépôts, boutiques et revendeurs autour de vous."
          />
          <InfoCard
            icon={<Flame className="h-5 w-5" />}
            title="Vérifier le stock"
            text="Statut en temps réel : en stock, faible ou rupture, mis à jour par les vendeurs."
          />
          <InfoCard
            icon={<Truck className="h-5 w-5" />}
            title="Contacter / commander"
            text="Appel direct, WhatsApp ou demande de livraison en un clic."
          />
        </section>
      </main>

      <footer className="border-t border-border bg-card">
        <div className="container mx-auto px-4 py-4 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} GazMap Bobo · Projet pilote Bobo-Dioulasso
        </div>
      </footer>

      {/* VENDOR DETAIL SHEET — fetched via MCP get_vendor */}
      <Sheet open={!!selectedId} onOpenChange={(o) => !o && setSelectedId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          {selectedId && <VendorDetailLoader id={selectedId} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function MapSkeleton() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-muted text-sm text-muted-foreground">
      Chargement de la carte…
    </div>
  );
}

function InfoCard({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <Card className="p-5">
      <div
        className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg text-primary-foreground"
        style={{ background: "var(--gradient-hero)" }}
      >
        {icon}
      </div>
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{text}</p>
    </Card>
  );
}

function VendorRow({
  vendor, selected, onClick,
}: { vendor: Vendor; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors hover:bg-muted/60 ${
        selected ? "bg-muted" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{vendor.name}</p>
          <p className="text-xs text-muted-foreground">
            {vendor.quartier} · {vendor.brand}
          </p>
        </div>
        <Badge className={`shrink-0 ${STOCK_COLORS[vendor.stock]}`}>
          {stockLabel(vendor.stock)}
        </Badge>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" /> {vendor.hours}
        </span>
        {vendor.delivery && (
          <span className="flex items-center gap-1 text-success">
            <Truck className="h-3 w-3" /> Livraison
          </span>
        )}
      </div>
    </button>
  );
}

function VendorDetailLoader({ id }: { id: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["mcp", "get_vendor", id],
    queryFn: () => getVendorViaMcp({ data: { id } }),
    staleTime: 30_000,
  });
  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
        Chargement du vendeur…
      </div>
    );
  }
  if (error || !data?.vendor) {
    return (
      <div className="p-6 text-sm text-destructive">
        Impossible de charger ce vendeur.
      </div>
    );
  }
  return <VendorDetail vendor={data.vendor} />;
}

function VendorDetail({ vendor }: { vendor: Vendor }) {
  const tel = `tel:+${vendor.phone}`;
  const wa = `https://wa.me/${vendor.whatsapp}?text=${encodeURIComponent(
    `Bonjour, je vous contacte via GazMap Bobo. Avez-vous du gaz disponible ?`,
  )}`;
  const order = `https://wa.me/${vendor.whatsapp}?text=${encodeURIComponent(
    `Bonjour, je souhaite commander une livraison de gaz (via GazMap Bobo).`,
  )}`;
  return (
    <>
      <SheetHeader>
        <div className="flex items-center gap-2">
          <Badge className={STOCK_COLORS[vendor.stock]}>{stockLabel(vendor.stock)}</Badge>
          <Badge variant="outline">{vendor.type}</Badge>
        </div>
        <SheetTitle className="text-xl">{vendor.name}</SheetTitle>
        <SheetDescription className="flex items-center gap-1">
          <MapPin className="h-3.5 w-3.5" /> {vendor.quartier} · {vendor.brand}
        </SheetDescription>
      </SheetHeader>

      <div className="mt-5 space-y-5">
        <div className="grid grid-cols-2 gap-2">
          <Button asChild>
            <a href={tel}><Phone className="mr-1 h-4 w-4" /> Appeler</a>
          </Button>
          <Button asChild variant="secondary" className="bg-success text-success-foreground hover:bg-success/90">
            <a href={wa} target="_blank" rel="noreferrer">
              <MessageCircle className="mr-1 h-4 w-4" /> WhatsApp
            </a>
          </Button>
        </div>

        {vendor.delivery && (
          <Button asChild variant="outline" className="w-full">
            <a href={order} target="_blank" rel="noreferrer">
              <Truck className="mr-1 h-4 w-4" /> Demander une livraison
            </a>
          </Button>
        )}

        <Separator />

        <div>
          <h4 className="mb-2 text-sm font-semibold">Bouteilles & prix</h4>
          <div className="space-y-2">
            {vendor.bottles.map((b) => (
              <div
                key={b.size}
                className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Flame className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{b.size}</p>
                    <p className="text-xs text-muted-foreground">
                      {b.price.toLocaleString("fr-FR")} FCFA
                    </p>
                  </div>
                </div>
                <Badge
                  className={
                    b.available
                      ? "bg-success text-success-foreground"
                      : "bg-destructive text-destructive-foreground"
                  }
                >
                  {b.available ? "Dispo" : "Rupture"}
                </Badge>
              </div>
            ))}
          </div>
        </div>

        <Separator />

        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="h-4 w-4" /> Horaires : <span className="text-foreground">{vendor.hours}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Phone className="h-4 w-4" /> Téléphone :{" "}
            <a href={tel} className="text-primary underline-offset-2 hover:underline">
              +{vendor.phone}
            </a>
          </div>
          <p className="text-xs text-muted-foreground">
            Dernière mise à jour : {new Date(vendor.updatedAt).toLocaleString("fr-FR")}
          </p>
        </div>
      </div>
    </>
  );
}
