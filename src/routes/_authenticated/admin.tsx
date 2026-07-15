import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  getAdminStatus,
  claimFirstAdmin,
  getAdminDashboard,
  getSystemHealth,
  queryEvents,
  listAlertRules,
  upsertAlertRule,
  deleteAlertRule,
  testAlertRule,
} from "@/lib/admin.functions";

import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Activity,
  AlertTriangle,
  Bell,
  CheckCircle2,
  Database,
  KeyRound,
  LogOut,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  XCircle,
  Zap,
} from "lucide-react";


export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
  head: () => ({
    meta: [
      { title: "Admin — Gaz à Bobo" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

const fmtXof = (n: number) => new Intl.NumberFormat("fr-FR").format(n) + " XOF";
const fmtDate = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—";

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    paid: "bg-emerald-100 text-emerald-800",
    pending: "bg-amber-100 text-amber-800",
    failed: "bg-red-100 text-red-800",
    cancelled: "bg-gray-100 text-gray-700",
  };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium ${variants[status] ?? "bg-gray-100"}`}>
      {status}
    </span>
  );
}

function AdminPage() {
  const navigate = useNavigate();
  const status = useServerFn(getAdminStatus);
  const claim = useServerFn(claimFirstAdmin);
  const dashboard = useServerFn(getAdminDashboard);
  const health = useServerFn(getSystemHealth);

  const statusQ = useQuery({ queryKey: ["admin-status"], queryFn: () => status() });

  const dashQ = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: () => dashboard(),
    enabled: statusQ.data?.isAdmin === true,
    refetchInterval: 15000,
  });

  const healthQ = useQuery({
    queryKey: ["admin-health"],
    queryFn: () => health(),
    enabled: statusQ.data?.isAdmin === true,
    refetchInterval: 30000,
  });

  const claimMut = useMutation({
    mutationFn: () => claim(),
    onSuccess: () => {
      toast.success("Vous êtes maintenant admin");
      statusQ.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  if (statusQ.isLoading) {
    return <div className="p-10 text-center text-muted-foreground">Chargement…</div>;
  }

  if (statusQ.data && !statusQ.data.isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Accès refusé</CardTitle>
            <CardDescription>Votre compte ({statusQ.data.email}) n'a pas le rôle admin.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!statusQ.data.adminExists ? (
              <>
                <p className="text-sm">Aucun admin n'est encore configuré. Vous pouvez réclamer ce rôle.</p>
                <Button onClick={() => claimMut.mutate()} disabled={claimMut.isPending} className="w-full">
                  {claimMut.isPending ? "..." : "Devenir admin"}
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Contactez un admin existant pour obtenir l'accès.
              </p>
            )}
            <Button variant="outline" onClick={signOut} className="w-full">
              <LogOut className="w-4 h-4 mr-2" /> Se déconnecter
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const d = dashQ.data;
  const h = healthQ.data;

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b bg-background">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ShieldCheck className="w-6 h-6" /> Admin
            </h1>
            <p className="text-sm text-muted-foreground">{statusQ.data?.email}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { dashQ.refetch(); healthQ.refetch(); }}>
              <RefreshCw className="w-4 h-4 mr-1" /> Rafraîchir
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to="/">Site</Link>
            </Button>
            <Button variant="outline" size="sm" onClick={signOut}>
              <LogOut className="w-4 h-4 mr-1" /> Déconnexion
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 space-y-6">
        {/* Alertes */}
        {d && d.alerts.length > 0 && (
          <Card className="border-amber-300">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-amber-700">
                <AlertTriangle className="w-5 h-5" /> Alertes ({d.alerts.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {d.alerts.map((a) => (
                <div key={a.id} className="flex items-center gap-2 text-sm">
                  <Badge variant={a.level === "critical" ? "destructive" : "secondary"}>{a.level}</Badge>
                  <span>{a.message}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Commandes total" value={d?.stats.totalOrders ?? "…"} />
          <StatCard label="Payées (24h)" value={d?.stats.paid24h ?? "…"} tone="success" />
          <StatCard label="En attente (24h)" value={d?.stats.pending24h ?? "…"} tone="warn" />
          <StatCard label="Échouées (24h)" value={d?.stats.failed24h ?? "…"} tone="danger" />
          <StatCard label="Revenu total" value={d ? fmtXof(d.stats.revenueXof) : "…"} wide />
          <StatCard label="Revenu 7j" value={d ? fmtXof(d.stats.revenue7d) : "…"} wide />
          <StatCard
            label="Pending >30min"
            value={d?.stats.stuckPending ?? "…"}
            tone={(d?.stats.stuckPending ?? 0) > 0 ? "warn" : undefined}
          />
          <StatCard
            label="Santé DB"
            value={h ? (h.db.ok ? `${h.db.latencyMs}ms` : "KO") : "…"}
            tone={h?.db.ok ? "success" : "danger"}
          />
        </div>

        <Tabs defaultValue="orders">
          <TabsList>
            <TabsTrigger value="orders">Commandes</TabsTrigger>
            <TabsTrigger value="logs">Logs</TabsTrigger>
            <TabsTrigger value="alert-rules">Règles d'alertes</TabsTrigger>
            <TabsTrigger value="security">Secrets & sécurité</TabsTrigger>
            <TabsTrigger value="health">Santé système</TabsTrigger>

          </TabsList>

          <TabsContent value="orders">
            <Card>
              <CardHeader>
                <CardTitle>Commandes récentes</CardTitle>
                <CardDescription>20 dernières commandes CinetPay</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Vendeur</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Bouteille</TableHead>
                      <TableHead className="text-right">Montant</TableHead>
                      <TableHead>Statut</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(d?.recentOrders ?? []).map((o) => (
                      <TableRow key={o.id}>
                        <TableCell className="text-xs">{fmtDate(o.created_at)}</TableCell>
                        <TableCell className="text-sm">{o.vendor_name}</TableCell>
                        <TableCell className="text-sm">
                          {o.customer_name}
                          <div className="text-xs text-muted-foreground">{o.customer_phone}</div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {o.quantity}× {o.bottle_size}
                        </TableCell>
                        <TableCell className="text-right text-sm">{fmtXof(o.amount)}</TableCell>
                        <TableCell>
                          <StatusBadge status={o.status} />
                        </TableCell>
                      </TableRow>
                    ))}
                    {d && d.recentOrders.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                          Aucune commande
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="logs">
            <LogsPanel />
          </TabsContent>

          <TabsContent value="alert-rules">
            <AlertRulesPanel />
          </TabsContent>




          <TabsContent value="security">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <KeyRound className="w-5 h-5" /> Secrets configurés
                </CardTitle>
                <CardDescription>
                  Les valeurs ne sont jamais exposées. Seule leur présence est vérifiée côté serveur.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nom</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Statut</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(h?.secrets ?? []).map((s) => (
                      <TableRow key={s.name}>
                        <TableCell className="font-mono text-sm">{s.name}</TableCell>
                        <TableCell>
                          {s.sensitive ? (
                            <Badge variant="destructive">Secret</Badge>
                          ) : (
                            <Badge variant="secondary">Config</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {s.configured ? (
                            <span className="text-emerald-700 inline-flex items-center gap-1">
                              <CheckCircle2 className="w-4 h-4" /> Configuré
                            </span>
                          ) : (
                            <span className="text-red-700 inline-flex items-center gap-1">
                              <XCircle className="w-4 h-4" /> Manquant
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="mt-4 text-xs text-muted-foreground">
                  Le scanner de sécurité Lovable analyse automatiquement le code. Consultez l'onglet
                  <strong> Security </strong>du projet pour les résultats détaillés.
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="health">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="w-5 h-5" /> Santé système
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <HealthRow
                  label="Base de données"
                  ok={h?.db.ok}
                  detail={h ? `${h.db.latencyMs} ms${h.db.error ? ` — ${h.db.error}` : ""}` : "…"}
                />
                <HealthRow label="Runtime" ok={true} detail={h?.runtime.node ?? "edge worker"} />
                <HealthRow
                  label="Horodatage serveur"
                  ok={true}
                  detail={h ? fmtDate(h.runtime.now) : "…"}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
  wide,
}: {
  label: string;
  value: string | number;
  tone?: "success" | "warn" | "danger";
  wide?: boolean;
}) {
  const toneClasses =
    tone === "success"
      ? "text-emerald-700"
      : tone === "warn"
      ? "text-amber-700"
      : tone === "danger"
      ? "text-red-700"
      : "text-foreground";
  return (
    <Card className={wide ? "md:col-span-2" : ""}>
      <CardContent className="pt-6">
        <div className="text-xs uppercase text-muted-foreground">{label}</div>
        <div className={`text-2xl font-bold mt-1 ${toneClasses}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function HealthRow({ label, ok, detail }: { label: string; ok: boolean | undefined; detail: string }) {
  return (
    <div className="flex items-center justify-between border-b pb-2">
      <span>{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">{detail}</span>
        {ok === true ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
        ) : ok === false ? (
          <XCircle className="w-4 h-4 text-red-600" />
        ) : null}
      </div>
    </div>
  );
}

function LogsPanel() {
  const runQuery = useServerFn(queryEvents);
  const [q, setQ] = useState("");
  const [level, setLevel] = useState("all");
  const [source, setSource] = useState("all");
  const [sinceHours, setSinceHours] = useState<string>("168"); // 7j

  const filters = { q: q.trim() || undefined, level, source, sinceHours: Number(sinceHours), limit: 200 };
  const eventsQ = useQuery({
    queryKey: ["admin-events", filters],
    queryFn: () => runQuery({ data: filters }),
    refetchInterval: 20000,
  });

  const events = eventsQ.data?.events ?? [];
  const sources = eventsQ.data?.sources ?? [];

  const resetFilters = () => {
    setQ("");
    setLevel("all");
    setSource("all");
    setSinceHours("168");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="w-5 h-5" /> Événements applicatifs
        </CardTitle>
        <CardDescription>
          Recherchez et filtrez pour retrouver un incident (max 200 résultats)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
          <Input
            placeholder="Rechercher dans le message…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="md:col-span-5"
          />
          <Select value={level} onValueChange={setLevel}>
            <SelectTrigger className="md:col-span-2">
              <SelectValue placeholder="Niveau" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous niveaux</SelectItem>
              <SelectItem value="info">Info</SelectItem>
              <SelectItem value="warn">Warn</SelectItem>
              <SelectItem value="error">Error</SelectItem>
            </SelectContent>
          </Select>
          <Select value={source} onValueChange={setSource}>
            <SelectTrigger className="md:col-span-2">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous types</SelectItem>
              {sources.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sinceHours} onValueChange={setSinceHours}>
            <SelectTrigger className="md:col-span-2">
              <SelectValue placeholder="Période" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Dernière heure</SelectItem>
              <SelectItem value="24">24 heures</SelectItem>
              <SelectItem value="168">7 jours</SelectItem>
              <SelectItem value="720">30 jours</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={resetFilters} className="md:col-span-1">
            Reset
          </Button>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {eventsQ.isFetching ? "Recherche…" : `${events.length} événement(s)`}
          </span>
          <Button size="sm" variant="ghost" onClick={() => eventsQ.refetch()}>
            Rafraîchir
          </Button>
        </div>

        <div className="space-y-1 font-mono text-xs max-h-[500px] overflow-y-auto">
          {events.map((e) => (
            <div
              key={e.id}
              className={`px-2 py-1 rounded flex gap-2 ${
                e.level === "error"
                  ? "bg-red-50"
                  : e.level === "warn"
                  ? "bg-amber-50"
                  : "bg-muted/40"
              }`}
            >
              <span className="text-muted-foreground shrink-0">{fmtDate(e.created_at)}</span>
              <span className="uppercase shrink-0 w-12">{e.level}</span>
              <span className="shrink-0 w-32 truncate">{e.source}</span>
              <span className="flex-1 break-all">{e.message}</span>
            </div>
          ))}
          {!eventsQ.isFetching && events.length === 0 && (
            <p className="text-muted-foreground text-center py-6">Aucun événement trouvé</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
