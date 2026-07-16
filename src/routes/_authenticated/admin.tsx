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
import {
  listVendorAccountsAdmin,
  listVendorsAdmin,
  approveVendorAccount,
  rejectVendorAccount,
} from "@/lib/vendor.functions";
import {
  listSecurityScans,
  getSecurityScan,
  createSecurityScan,
  updateFindingState,
  deleteSecurityScan,
  type Finding,
  type FindingSeverity,
  type FindingState,
} from "@/lib/security.functions";


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
  Shield,
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
            <TabsTrigger value="vendors">Vendeurs</TabsTrigger>
          </TabsList>
          <TabsContent value="vendors"><VendorAccountsPanel /></TabsContent>


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

type RuleForm = {
  id?: string;
  name: string;
  enabled: boolean;
  level: "all" | "info" | "warn" | "error";
  source: string;
  message_contains: string;
  threshold: number;
  window_minutes: number;
};

const emptyRule: RuleForm = {
  name: "",
  enabled: true,
  level: "error",
  source: "",
  message_contains: "",
  threshold: 3,
  window_minutes: 60,
};

function AlertRulesPanel() {
  const list = useServerFn(listAlertRules);
  const upsert = useServerFn(upsertAlertRule);
  const remove = useServerFn(deleteAlertRule);
  const test = useServerFn(testAlertRule);

  const [form, setForm] = useState<RuleForm>(emptyRule);
  const [testResult, setTestResult] = useState<{
    matches: number;
    threshold: number;
    triggered: boolean;
    sample: Array<{ id: string; level: string; source: string; message: string; created_at: string }>;
  } | null>(null);

  const listQ = useQuery({
    queryKey: ["alert-rules"],
    queryFn: () => list(),
    refetchInterval: 30000,
  });

  const saveMut = useMutation({
    mutationFn: () =>
      upsert({
        data: {
          ...(form.id ? { id: form.id } : {}),
          name: form.name,
          enabled: form.enabled,
          level: form.level,
          source: form.source.trim() || null,
          message_contains: form.message_contains.trim() || null,
          threshold: Number(form.threshold),
          window_minutes: Number(form.window_minutes),
        },
      }),
    onSuccess: () => {
      toast.success(form.id ? "Règle mise à jour" : "Règle créée");
      setForm(emptyRule);
      listQ.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  const testMut = useMutation({
    mutationFn: () =>
      test({
        data: {
          level: form.level,
          source: form.source.trim() || null,
          message_contains: form.message_contains.trim() || null,
          threshold: Number(form.threshold),
          window_minutes: Number(form.window_minutes),
        },
      }),
    onSuccess: (res) => {
      setTestResult(res);
      toast[res.triggered ? "warning" : "success"](
        res.triggered
          ? `Alerte déclenchée: ${res.matches}/${res.threshold}`
          : `OK: ${res.matches}/${res.threshold} correspondance(s)`
      );
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Règle supprimée");
      listQ.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  const rules = listQ.data?.rules ?? [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5" /> {form.id ? "Modifier la règle" : "Nouvelle règle"}
          </CardTitle>
          <CardDescription>
            Déclenche une alerte quand N événements correspondants surviennent dans la fenêtre.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Nom</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ex: Trop d'erreurs webhook CinetPay"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Niveau</Label>
              <Select
                value={form.level}
                onValueChange={(v) => setForm({ ...form, level: v as RuleForm["level"] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="warn">Warn</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Type d'événement (source)</Label>
              <Input
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value })}
                placeholder="cinetpay-webhook (vide = tous)"
              />
            </div>
          </div>
          <div>
            <Label>Le message contient</Label>
            <Input
              value={form.message_contains}
              onChange={(e) => setForm({ ...form, message_contains: e.target.value })}
              placeholder="Filtre optionnel (ex: timeout)"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Seuil (occurrences)</Label>
              <Input
                type="number"
                min={1}
                value={form.threshold}
                onChange={(e) => setForm({ ...form, threshold: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>Fenêtre (minutes)</Label>
              <Input
                type="number"
                min={1}
                value={form.window_minutes}
                onChange={(e) => setForm({ ...form, window_minutes: Number(e.target.value) })}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="rule-enabled"
              checked={form.enabled}
              onCheckedChange={(v) => setForm({ ...form, enabled: v })}
            />
            <Label htmlFor="rule-enabled">Activée</Label>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending || !form.name.trim()}
            >
              {form.id ? <Pencil className="w-4 h-4 mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
              {saveMut.isPending ? "…" : form.id ? "Mettre à jour" : "Créer"}
            </Button>
            <Button
              variant="outline"
              onClick={() => testMut.mutate()}
              disabled={testMut.isPending}
            >
              <Zap className="w-4 h-4 mr-1" />
              {testMut.isPending ? "…" : "Tester"}
            </Button>
            {form.id && (
              <Button variant="ghost" onClick={() => setForm(emptyRule)}>
                Annuler
              </Button>
            )}
          </div>

          {testResult && (
            <div
              className={`rounded-md border p-3 text-sm space-y-2 ${
                testResult.triggered
                  ? "border-amber-300 bg-amber-50"
                  : "border-emerald-300 bg-emerald-50"
              }`}
            >
              <div className="font-medium">
                {testResult.triggered ? "🔔 Alerte déclenchée" : "✅ Sous le seuil"} —{" "}
                {testResult.matches} / {testResult.threshold} correspondance(s)
              </div>
              {testResult.sample.length > 0 && (
                <div className="max-h-40 overflow-y-auto space-y-1 font-mono text-xs">
                  {testResult.sample.map((s) => (
                    <div key={s.id} className="truncate">
                      <span className="text-muted-foreground">{fmtDate(s.created_at)}</span>{" "}
                      <span className="uppercase">[{s.level}]</span> {s.source}: {s.message}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Règles configurées ({rules.length})</CardTitle>
          <CardDescription>Statut évalué en temps réel sur la fenêtre de chaque règle.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {rules.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">
              Aucune règle. Créez-en une à gauche.
            </p>
          )}
          {rules.map(({ rule, matches, triggered }) => (
            <div
              key={rule.id}
              className={`border rounded-md p-3 space-y-1 ${
                triggered ? "border-amber-400 bg-amber-50" : ""
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {rule.enabled ? (
                    <Badge variant="default">ON</Badge>
                  ) : (
                    <Badge variant="secondary">OFF</Badge>
                  )}
                  <span className="font-medium truncate">{rule.name}</span>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setForm({
                        id: rule.id,
                        name: rule.name,
                        enabled: rule.enabled,
                        level: rule.level as RuleForm["level"],
                        source: rule.source ?? "",
                        message_contains: rule.message_contains ?? "",
                        threshold: rule.threshold,
                        window_minutes: rule.window_minutes,
                      })
                    }
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (confirm(`Supprimer la règle "${rule.name}" ?`)) deleteMut.mutate(rule.id);
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
              <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
                <span>niveau: {rule.level}</span>
                {rule.source && <span>source: {rule.source}</span>}
                {rule.message_contains && <span>msg~ {rule.message_contains}</span>}
                <span>
                  seuil: {rule.threshold} / {rule.window_minutes}min
                </span>
              </div>
              {rule.enabled && (
                <div className="text-xs">
                  {triggered ? (
                    <span className="text-amber-700 font-medium">
                      🔔 {matches} événement(s) — au-dessus du seuil
                    </span>
                  ) : (
                    <span className="text-muted-foreground">
                      {matches} événement(s) — sous le seuil
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function VendorAccountsPanel() {
  const list = useServerFn(listVendorAccountsAdmin);
  const listV = useServerFn(listVendorsAdmin);
  const approve = useServerFn(approveVendorAccount);
  const reject = useServerFn(rejectVendorAccount);
  const accounts = useQuery({ queryKey: ["vendor-accounts"], queryFn: () => list(), refetchInterval: 30_000 });
  const vendors = useQuery({ queryKey: ["vendors-admin"], queryFn: () => listV() });
  const [picks, setPicks] = useState<Record<string, string>>({});

  const doApprove = async (accountId: string) => {
    const vendorId = picks[accountId];
    if (!vendorId) return toast.error("Choisissez un vendeur à lier.");
    try {
      await approve({ data: { accountId, vendorId } });
      toast.success("Compte approuvé.");
      accounts.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  };
  const doReject = async (accountId: string) => {
    try {
      await reject({ data: { accountId } });
      toast.success("Refusé.");
      accounts.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Comptes vendeurs</CardTitle>
        <CardDescription>Approuvez les demandes et liez chaque compte à une fiche vendeur.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {accounts.isLoading ? <div>Chargement…</div> : (accounts.data ?? []).length === 0 ? (
          <div className="text-sm text-muted-foreground">Aucune demande.</div>
        ) : (
          (accounts.data ?? []).map((a) => (
            <div key={a.id} className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="font-medium">{a.requested_name ?? "—"} <span className="text-xs text-muted-foreground">({a.email ?? "?"})</span></div>
                  <div className="text-xs text-muted-foreground">
                    {a.requested_quartier} · {a.requested_phone} · demandé {new Date(a.created_at).toLocaleDateString("fr-FR")}
                  </div>
                  {a.note && <div className="text-xs mt-1 italic">« {a.note} »</div>}
                </div>
                <Badge variant={a.status === "approved" ? "default" : a.status === "rejected" ? "destructive" : "secondary"}>
                  {a.status}
                </Badge>
              </div>
              {a.status === "approved" && a.vendor_name && (
                <div className="text-xs text-emerald-700">✓ lié à <strong>{a.vendor_name}</strong> ({a.vendor_id})</div>
              )}
              {a.status === "pending" && (
                <div className="flex gap-2 items-center">
                  <select
                    className="h-9 rounded-md border bg-background px-2 text-sm flex-1"
                    value={picks[a.id] ?? ""}
                    onChange={(e) => setPicks({ ...picks, [a.id]: e.target.value })}
                  >
                    <option value="">Lier à un vendeur…</option>
                    {(vendors.data ?? []).map((v) => (
                      <option key={v.id} value={v.id}>{v.name} — {v.quartier} ({v.id})</option>
                    ))}
                  </select>
                  <Button size="sm" onClick={() => doApprove(a.id)}>Approuver</Button>
                  <Button size="sm" variant="outline" onClick={() => doReject(a.id)}>Refuser</Button>
                </div>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

