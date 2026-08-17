import { createFileRoute, Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { ProjectCard } from "@/components/project-card";
import { Button } from "@/components/ui/button";
import { useData } from "@/lib/data-store";

export const Route = createFileRoute("/app/projects/")({
  head: () => ({
    meta: [
      { title: "My Projects — VideaAI" },
      { name: "description", content: "Browse every video project in your VideaAI workspace." },
      { property: "og:title", content: "My Projects — VideaAI" },
      { property: "og:description", content: "Your AI video projects, statuses and exports." },
    ],
  }),
  component: ProjectsPage,
});

function ProjectsPage() {
  const { projects } = useData();

  return (
    <DashboardShell title="My Projects" description={`${projects.length} project(s)`}>
      {projects.length === 0 ? (
        <div className="panel flex flex-col items-center gap-4 p-14 text-center">
          <h2 className="text-lg font-semibold">No projects yet</h2>
          <p className="text-muted-foreground max-w-sm text-sm">
            Every video you generate shows up here with its status, settings and exports.
          </p>
          <Link to="/app/create">
            <Button>
              <Sparkles className="h-4 w-4" /> Create your first video
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </div>
      )}
    </DashboardShell>
  );
}
