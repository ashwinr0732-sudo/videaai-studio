import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ArrowLeft, Loader2, Search, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/status-badge";
import { useAuth } from "@/lib/auth";
import {
  adminAdjustCredits,
  adminListJobs,
  adminListTransactions,
  adminListUsers,
  adminOverview,
  adminUserDetail,
} from "@/lib/admin.functions";

export const Route = createFileRoute("/admin")({
  // The real gate is server-side: every admin server function re-checks the
  // caller's role in the database. This only avoids rendering an empty shell.
  ssr: false,
  head: () => ({
    meta: [
      { title: "Admin — VideaAI" },
      { name: "description", content: "Operations console for VideaAI users, credits and renders." },
      { property: "og:title", content: "Admin — VideaAI" },
      { property: "og:description", content: "Supervise users, credits and video generations." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="panel p-5">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="font-display mt-1 text-2xl font-semibold">{value}</p>
      {hint && <p className="text-muted-foreground mt-1 text-xs">{hint}</p>}
    </div>
  );
}

function Denied({ message }: { message: string }) {
  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="panel max-w-md p-10 text-center">
        <AlertTriangle className="text-muted-foreground mx-auto h-8 w-8" />
        <h1 className="mt-4 text-lg font-semibold">Admin access required</h1>
        <p className="text-muted-foreground mt-2 text-sm">{message}</p>
        <Link to="/app" className="mt-6 inline-block">
          <Button variant="secondary">
            <ArrowLeft className="h-4 w-4" /> Back to app
          </Button>
        </Link>
      </div>
    </div>
  );
}

function OverviewTab() {
  const fn = useServerFn(adminOverview);
  const { data, isLoading, error } = useQuery({ queryKey: ["admin", "overview"], queryFn: () => fn({}) });

  if (isLoading) return <Loader2 className="text-primary h-6 w-6 animate-spin" />;
  if (error || !data) return <p className="text-destructive text-sm">{(error as Error)?.message}</p>;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Total users" value={data.totalUsers} hint={`${data.admins} admin(s)`} />
        <Stat label="Active (30 days)" value={data.activeUsers} hint="Users who started a render" />
        <Stat
          label="Generations"
          value={data.totalGenerations}
          hint={`${data.completed} done · ${data.failed} failed · ${data.running} running`}
        />
        <Stat
          label="Credits consumed"
          value={data.creditsConsumed}
          hint={`${data.creditsGranted} granted · ${data.creditsOutstanding} outstanding`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="panel p-5">
          <h2 className="text-sm font-semibold">Plans</h2>
          <div className="mt-3 space-y-2 text-sm">
            {Object.entries(data.planCounts).map(([plan, count]) => (
              <div key={plan} className="flex justify-between">
                <span className="text-muted-foreground capitalize">{plan}</span>
                <span>{count}</span>
              </div>
            ))}
            <p className="text-muted-foreground pt-2 text-xs">
              Revenue reporting appears here once payments are connected.
            </p>
          </div>
        </div>

        <div className="panel p-5">
          <h2 className="text-sm font-semibold">Recent failures</h2>
          <div className="mt-3 space-y-3 text-sm">
            {data.recentErrors.length === 0 && (
              <p className="text-muted-foreground text-xs">No failed renders. </p>
            )}
            {data.recentErrors.map((e) => (
              <div key={e.id} className="border-border/70 rounded-lg border p-3">
                <p className="text-destructive text-xs">{e.message}</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {e.email ?? "unknown"} · {new Date(e.created_at).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="panel p-5">
        <h2 className="text-sm font-semibold">Admin activity log</h2>
        <div className="mt-3 space-y-2 text-sm">
          {data.recentActivity.length === 0 && (
            <p className="text-muted-foreground text-xs">No admin actions recorded yet.</p>
          )}
          {data.recentActivity.map((a) => (
            <div key={a.id} className="flex flex-wrap justify-between gap-2">
              <span>
                <span className="font-medium">{a.action}</span>{" "}
                <span className="text-muted-foreground">
                  {a.details.amount != null ? `${a.details.amount} credits` : ""}{" "}
                  {a.details.reason ?? ""}
                </span>
              </span>
              <span className="text-muted-foreground text-xs">
                {a.admin_email ?? "admin"} · {new Date(a.created_at).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function UsersTab() {
  const listFn = useServerFn(adminListUsers);
  const detailFn = useServerFn(adminUserDetail);
  const adjustFn = useServerFn(adminAdjustCredits);
  const queryClient = useQueryClient();

  const [term, setTerm] = useState("");
  const [search, setSearch] = useState("");
  const [openUser, setOpenUser] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  const users = useQuery({
    queryKey: ["admin", "users", search],
    queryFn: () => listFn({ data: { search } }),
  });

  const detail = useQuery({
    queryKey: ["admin", "user", openUser],
    enabled: Boolean(openUser),
    queryFn: () => detailFn({ data: { userId: openUser! } }),
  });

  const adjust = useMutation({
    mutationFn: (vars: { userId: string; amount: number; reason: string }) =>
      adjustFn({ data: vars }),
    onSuccess: (res) => {
      toast.success(`Balance updated — now ${res.balance} credits.`);
      setAmount("");
      setReason("");
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e) => toast.error("Adjustment failed", { description: (e as Error).message }),
  });

  return (
    <div className="space-y-4">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(term);
        }}
      >
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search by email or name"
          className="bg-surface-2 max-w-sm"
        />
        <Button type="submit" variant="secondary">
          <Search className="h-4 w-4" /> Search
        </Button>
      </form>

      <div className="panel overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-muted-foreground border-border/70 border-b text-xs">
            <tr>
              <th className="p-3">User</th>
              <th className="p-3">Plan</th>
              <th className="p-3">Role</th>
              <th className="p-3">Credits</th>
              <th className="p-3">Renders</th>
              <th className="p-3">Joined</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {users.isLoading && (
              <tr>
                <td colSpan={7} className="text-muted-foreground p-4">
                  Loading users…
                </td>
              </tr>
            )}
            {users.error && (
              <tr>
                <td colSpan={7} className="text-destructive p-4">
                  {(users.error as Error).message}
                </td>
              </tr>
            )}
            {(users.data ?? []).map((u) => (
              <tr key={u.id} className="border-border/60 border-b last:border-0">
                <td className="p-3">
                  <p className="font-medium">{u.full_name ?? "—"}</p>
                  <p className="text-muted-foreground text-xs">{u.email}</p>
                </td>
                <td className="p-3 capitalize">{u.plan}</td>
                <td className="p-3">{u.role}</td>
                <td className="p-3">{u.balance}</td>
                <td className="p-3">
                  {u.generations}
                  {u.failed > 0 && (
                    <span className="text-destructive text-xs"> ({u.failed} failed)</span>
                  )}
                </td>
                <td className="p-3 text-xs">{new Date(u.created_at).toLocaleDateString()}</td>
                <td className="p-3">
                  <Button size="sm" variant="secondary" onClick={() => setOpenUser(u.id)}>
                    Manage
                  </Button>
                </td>
              </tr>
            ))}
            {users.data?.length === 0 && (
              <tr>
                <td colSpan={7} className="text-muted-foreground p-4">
                  No users match that search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={Boolean(openUser)} onOpenChange={(o) => !o && setOpenUser(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{detail.data?.profile?.email ?? "User"}</DialogTitle>
            <DialogDescription>
              Account details, balance and generation history.
            </DialogDescription>
          </DialogHeader>

          {detail.isLoading && <Loader2 className="h-5 w-5 animate-spin" />}
          {detail.data && (
            <div className="space-y-5 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Balance" value={detail.data.balance} />
                <Stat label="Role" value={detail.data.role} />
              </div>

              <div className="space-y-3">
                <h3 className="font-semibold">Adjust credits</h3>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="amount">Amount (+/-)</Label>
                    <Input
                      id="amount"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="25 or -10"
                      className="bg-surface-2 w-32"
                    />
                  </div>
                  <div className="min-w-[12rem] flex-1 space-y-1">
                    <Label htmlFor="reason">Reason (audited)</Label>
                    <Input
                      id="reason"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Goodwill top-up"
                      className="bg-surface-2"
                    />
                  </div>
                  <Button
                    disabled={adjust.isPending}
                    onClick={() =>
                      adjust.mutate({
                        userId: openUser!,
                        amount: Number(amount),
                        reason,
                      })
                    }
                  >
                    {adjust.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Apply
                  </Button>
                </div>
              </div>

              <div>
                <h3 className="font-semibold">Recent generations</h3>
                <div className="mt-2 space-y-2">
                  {detail.data.jobs.length === 0 && (
                    <p className="text-muted-foreground text-xs">No renders yet.</p>
                  )}
                  {detail.data.jobs.slice(0, 10).map((j: any) => (
                    <div key={j.id} className="border-border/70 rounded-lg border p-3">
                      <p className="line-clamp-2 text-xs">{j.prompt}</p>
                      <p className="text-muted-foreground mt-1 text-xs">
                        {j.status} · {j.requested_duration}s · {j.style} · {j.aspect_ratio} ·{" "}
                        {new Date(j.created_at).toLocaleString()}
                      </p>
                      {j.error_message && (
                        <p className="text-destructive mt-1 text-xs">{j.error_message}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="font-semibold">Credit history</h3>
                <div className="mt-2 space-y-1">
                  {detail.data.transactions.slice(0, 15).map((t: any) => (
                    <div key={t.id} className="flex justify-between text-xs">
                      <span className="text-muted-foreground">
                        {t.reason} · {new Date(t.created_at).toLocaleString()}
                      </span>
                      <span className={t.amount < 0 ? "text-destructive" : "text-primary"}>
                        {t.amount > 0 ? "+" : ""}
                        {t.amount}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

const JOB_FILTERS = ["all", "queued", "processing", "completed", "failed"] as const;

function JobsTab() {
  const fn = useServerFn(adminListJobs);
  const [status, setStatus] = useState<string>("all");
  const jobs = useQuery({
    queryKey: ["admin", "jobs", status],
    queryFn: () => fn({ data: { status } }),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {JOB_FILTERS.map((f) => (
          <Button
            key={f}
            size="sm"
            variant={status === f ? "default" : "secondary"}
            onClick={() => setStatus(f)}
            className="capitalize"
          >
            {f}
          </Button>
        ))}
      </div>

      <div className="space-y-3">
        {jobs.isLoading && <Loader2 className="h-5 w-5 animate-spin" />}
        {jobs.error && <p className="text-destructive text-sm">{(jobs.error as Error).message}</p>}
        {(jobs.data ?? []).map((j) => (
          <div key={j.id} className="panel space-y-2 p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <StatusBadge
                status={
                  j.status === "completed"
                    ? "ready"
                    : j.status === "failed"
                      ? "failed"
                      : j.status === "queued"
                        ? "queued"
                        : "processing"
                }
              />
              <span className="text-muted-foreground text-xs">
                {j.email ?? j.user_ref} · {new Date(j.created_at).toLocaleString()}
              </span>
            </div>
            <p className="line-clamp-2">{j.prompt}</p>
            <p className="text-muted-foreground text-xs">
              {j.phase} · {j.progress}% · {j.requested_duration}s requested
              {j.actual_duration_seconds ? ` · ${j.actual_duration_seconds}s delivered` : ""} ·{" "}
              {j.style} · {j.aspect_ratio} · {j.credits_spent} credits
            </p>
            {j.error_message && (
              <p className="text-destructive text-xs">
                {j.failed_scene ? `Scene ${j.failed_scene}: ` : ""}
                {j.error_message}
              </p>
            )}
          </div>
        ))}
        {jobs.data?.length === 0 && (
          <p className="text-muted-foreground text-sm">No renders in this state.</p>
        )}
      </div>
    </div>
  );
}

function CreditsTab() {
  const fn = useServerFn(adminListTransactions);
  const tx = useQuery({ queryKey: ["admin", "transactions"], queryFn: () => fn({}) });

  return (
    <div className="panel overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-muted-foreground border-border/70 border-b text-xs">
          <tr>
            <th className="p-3">When</th>
            <th className="p-3">User</th>
            <th className="p-3">Amount</th>
            <th className="p-3">Reason</th>
            <th className="p-3">Admin</th>
            <th className="p-3">Note</th>
          </tr>
        </thead>
        <tbody>
          {tx.isLoading && (
            <tr>
              <td colSpan={6} className="text-muted-foreground p-4">
                Loading transactions…
              </td>
            </tr>
          )}
          {(tx.data ?? []).map((t) => (
            <tr key={t.id} className="border-border/60 border-b last:border-0">
              <td className="p-3 text-xs">{new Date(t.created_at).toLocaleString()}</td>
              <td className="p-3 text-xs">{t.email ?? t.user_id}</td>
              <td className={`p-3 ${t.amount < 0 ? "text-destructive" : "text-primary"}`}>
                {t.amount > 0 ? "+" : ""}
                {t.amount}
              </td>
              <td className="p-3">{t.reason}</td>
              <td className="p-3 text-xs">{t.admin_email ?? "—"}</td>
              <td className="text-muted-foreground max-w-[18rem] truncate p-3 text-xs">
                {t.note ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AdminPage() {
  const { user, loading, isAdmin } = useAuth();

  if (loading) {
    return (
      <div className="text-muted-foreground grid min-h-screen place-items-center text-sm">
        Checking permissions…
      </div>
    );
  }
  if (!user) return <Denied message="Sign in with an admin account to open this console." />;
  if (!isAdmin) return <Denied message="This account doesn't have admin permissions." />;

  return (
    <div className="bg-background min-h-screen px-4 py-8 lg:px-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display flex items-center gap-2 text-2xl font-semibold">
              <ShieldCheck className="text-primary h-6 w-6" /> Admin console
            </h1>
            <p className="text-muted-foreground text-sm">
              Supervise users, credits, renders and system health.
            </p>
          </div>
          <Link to="/app">
            <Button variant="secondary">
              <ArrowLeft className="h-4 w-4" /> Back to app
            </Button>
          </Link>
        </div>

        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="jobs">Generations</TabsTrigger>
            <TabsTrigger value="credits">Credits</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="mt-6">
            <OverviewTab />
          </TabsContent>
          <TabsContent value="users" className="mt-6">
            <UsersTab />
          </TabsContent>
          <TabsContent value="jobs" className="mt-6">
            <JobsTab />
          </TabsContent>
          <TabsContent value="credits" className="mt-6">
            <CreditsTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
