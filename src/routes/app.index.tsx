import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Film, Sparkles, Zap } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { ProjectCard } from "@/components/project-card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useData } from "@/lib/data-store";

export const Route = createFileRoute("/app/")({
  head: () => ({
    meta: [
      { title: "Dashboard — VideaAI" },
      { name: "description", content: "Your VideaAI workspace: credits, recent projects and more." },
      { property: "og:title", content: "Dashboard — VideaAI" },
      { property: "og:description", content: "Your VideaAI workspace overview." },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { user } = useAuth();
  const { projects, balance, generations } = useData();
  const recent = projects.slice(0, 6);

  const stats = [
    { label: "Credits available", value: balance, icon: Zap },
    { label: "Projects", value: projects.length, icon: Film },
    { label: "Generations", value: generations.length, icon: Sparkles },
  ];

  return (
    <DashboardShell
      title={`Welcome back, ${user?.full_name ?? "creator"}`}
      description="Here's what's happening in your workspace."
    >
      <div className="space-y-8">
        <div className="grid gap-4 sm:grid-cols-3">
          {stats.map((s) => (
            <div key={s.label} className="panel p-5">
              <div className="flex items-center justify-between">
                <p className="text-muted-foreground text-sm">{s.label}</p>
                <s.icon className="text-primary h-4 w-4" />
              </div>
              <p className="font-display mt-3 text-3xl font-semibold">{s.value}</p>
            </div>
          ))}
        </div>

        <div className="panel glow-top flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Start a new video</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Describe a scene and VideaAI handles the rest.
            </p>
          </div>
          <Link to="/app/create">
            <Button>
              Create video <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>

        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recent projects</h2>
            <Link to="/app/projects" className="text-primary text-sm hover:underline">
              View all
            </Link>
          </div>
          {recent.length === 0 ? (
            <div className="panel text-muted-foreground p-10 text-center text-sm">
              No projects yet — your first video is one prompt away.
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {recent.map((p) => (
                <ProjectCard key={p.id} project={p} />
              ))}
            </div>
          )}
        </section>
      </div>
    </DashboardShell>
  );
}
