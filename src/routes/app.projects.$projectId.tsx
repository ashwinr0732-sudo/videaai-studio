import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Download, Film, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { DashboardShell } from "@/components/dashboard-shell";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { useData } from "@/lib/data-store";
import { CREDIT_COST } from "@/lib/types";

export const Route = createFileRoute("/app/projects/$projectId")({
  head: () => ({
    meta: [
      { title: "Project — VideaAI" },
      { name: "description", content: "Preview, download or regenerate your AI video project." },
      { property: "og:title", content: "Project — VideaAI" },
      { property: "og:description", content: "AI video project details on VideaAI." },
    ],
  }),
  component: ProjectDetailPage,
});

function ProjectDetailPage() {
  const { projectId } = Route.useParams();
  const { getProject, regenerate, balance, generationsFor } = useData();
  const project = getProject(projectId);

  if (!project) {
    return (
      <DashboardShell title="Project not found">
        <div className="panel flex flex-col items-center gap-4 p-14 text-center">
          <p className="text-muted-foreground text-sm">
            This project doesn't exist or was removed.
          </p>
          <Link to="/app/projects">
            <Button variant="secondary">
              <ArrowLeft className="h-4 w-4" /> Back to projects
            </Button>
          </Link>
        </div>
      </DashboardShell>
    );
  }

  const history = generationsFor(project.id);
  const cost = CREDIT_COST[project.duration_seconds];
  const ready = project.status === "ready" && project.video_url;

  return (
    <DashboardShell title={project.title} description={`${project.style} · ${project.aspect_ratio}`}>
      <div className="space-y-6">
        <Link
          to="/app/projects"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-2 text-sm"
        >
          <ArrowLeft className="h-4 w-4" /> All projects
        </Link>

        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <div className="panel overflow-hidden">
            <div className="bg-surface-2 relative aspect-video">
              <div className="glow-top absolute inset-0" />
              {ready ? (
                <video
                  controls
                  className="h-full w-full object-contain"
                  src={project.video_url ?? undefined}
                />
              ) : (
                <div className="absolute inset-0 grid place-items-center gap-3 text-center">
                  <div>
                    <Film className="text-muted-foreground mx-auto h-8 w-8" />
                    <p className="mt-3 text-sm font-medium">Video not rendered yet</p>
                    <p className="text-muted-foreground mx-auto mt-1 max-w-xs text-xs">
                      Playback appears here once a generation provider is connected to the
                      workspace.
                    </p>
                  </div>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
              <StatusBadge status={project.status} />
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  disabled={!ready}
                  onClick={() => toast("Download available once the video is rendered.")}
                >
                  <Download className="h-4 w-4" /> Download
                </Button>
                <Button
                  disabled={balance < cost}
                  onClick={() => {
                    regenerate(project.id);
                    toast.success("Regeneration queued", {
                      description: `${cost} credit(s) reserved.`,
                    });
                  }}
                >
                  <RefreshCw className="h-4 w-4" /> Regenerate
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="panel p-5">
              <h2 className="text-sm font-semibold">Prompt</h2>
              <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{project.prompt}</p>
            </div>
            <div className="panel space-y-3 p-5 text-sm">
              <h2 className="font-semibold">Details</h2>
              {[
                ["Duration", `${project.duration_seconds}s`],
                ["Aspect ratio", project.aspect_ratio],
                ["Style", project.style],
                ["Created", new Date(project.created_at).toLocaleString()],
                ["Generations", String(history.length)],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-muted-foreground">{label}</span>
                  <span>{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
