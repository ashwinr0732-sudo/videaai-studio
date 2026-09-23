import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { useData } from "@/lib/data-store";

export const Route = createFileRoute("/app/settings")({
  head: () => ({
    meta: [
      { title: "Settings — VideaAI" },
      { name: "description", content: "Manage your VideaAI account, credits and workspace." },
      { property: "og:title", content: "Settings — VideaAI" },
      { property: "og:description", content: "Account and workspace settings." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user, signOut } = useAuth();
  const { balance, credits } = useData();
  const navigate = useNavigate();

  return (
    <DashboardShell title="Settings" description="Account and workspace preferences.">
      <div className="grid max-w-3xl gap-6">
        <div className="panel space-y-4 p-6">
          <h2 className="font-semibold">Profile</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Full name</Label>
              <Input id="name" defaultValue={user?.full_name ?? ""} className="bg-surface-2" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" defaultValue={user?.email ?? ""} disabled className="bg-surface-2" />
            </div>
          </div>
          <p className="text-muted-foreground text-xs">
            Profile changes are saved once the account backend is connected.
          </p>
        </div>

        <div className="panel space-y-3 p-6">
          <h2 className="font-semibold">Credits</h2>
          <p className="font-display text-3xl font-semibold">{balance}</p>
          <div className="space-y-2 text-sm">
            {credits.slice(0, 5).map((entry) => (
              <div key={entry.id} className="text-muted-foreground flex justify-between">
                <span>{entry.reason.replace("_", " ")}</span>
                <span className={entry.amount > 0 ? "text-success" : ""}>
                  {entry.amount > 0 ? "+" : ""}
                  {entry.amount}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel space-y-3 p-6">
          <h2 className="font-semibold">Session</h2>
          <Button
            variant="secondary"
            onClick={async () => {
              await signOut();
              navigate({ to: "/", replace: true });
            }}
          >
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </div>
      </div>
    </DashboardShell>
  );
}
