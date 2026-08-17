import { useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { CreditCard, LayoutGrid, LogOut, Menu, Settings, Sparkles, Zap } from "lucide-react";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/lib/auth";
import { useData } from "@/lib/data-store";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/app/create", label: "Create", icon: Sparkles },
  { to: "/app/projects", label: "My Projects", icon: LayoutGrid },
  { to: "/app/pricing", label: "Pricing", icon: CreditCard },
  { to: "/app/settings", label: "Settings", icon: Settings },
] as const;

function CreditPill() {
  const { balance } = useData();
  return (
    <div className="border-border/80 bg-surface-2 flex items-center justify-between rounded-xl border p-3">
      <div>
        <p className="text-muted-foreground text-xs">Credits</p>
        <p className="font-display text-xl font-semibold">{balance}</p>
      </div>
      <span className="bg-primary/15 text-primary grid h-9 w-9 place-items-center rounded-lg">
        <Zap className="h-4 w-4" />
      </span>
    </div>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: (() => void) | undefined }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="space-y-1">
      {NAV.map((item) => {
        const active = pathname === item.to || pathname.startsWith(item.to + "/");
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarBody({ onNavigate }: { onNavigate?: (() => void) | undefined }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <Logo />
      <Link to="/app/create" onClick={onNavigate}>
        <Button className="w-full">
          <Sparkles className="h-4 w-4" /> New video
        </Button>
      </Link>
      <NavLinks onNavigate={onNavigate} />
      <div className="mt-auto space-y-3">
        <CreditPill />
        <div className="flex items-center gap-3 px-1">
          <span className="bg-surface-2 grid h-8 w-8 place-items-center rounded-full text-xs font-semibold">
            {(user?.full_name ?? user?.email ?? "?").charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{user?.full_name ?? "Guest"}</p>
            <p className="text-muted-foreground truncate text-xs">{user?.email}</p>
          </div>
          <button
            aria-label="Sign out"
            className="text-muted-foreground hover:text-foreground"
            onClick={async () => {
              await signOut();
              navigate({ to: "/", replace: true });
            }}
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function DashboardShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { balance } = useData();

  return (
    <div className="bg-background flex min-h-screen">
      <aside className="bg-sidebar border-sidebar-border hidden w-64 shrink-0 border-r lg:block">
        <div className="sticky top-0 h-screen">
          <SidebarBody />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-border/70 bg-background/80 sticky top-0 z-20 flex items-center gap-3 border-b px-4 py-3 backdrop-blur lg:px-8">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="bg-sidebar w-72 p-0">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <SidebarBody onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold sm:text-lg">{title}</h1>
            {description && (
              <p className="text-muted-foreground hidden truncate text-sm sm:block">
                {description}
              </p>
            )}
          </div>
          <span className="bg-surface-2 text-primary flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium">
            <Zap className="h-3.5 w-3.5" /> {balance}
          </span>
        </header>
        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
