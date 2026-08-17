import { Link } from "@tanstack/react-router";
import { Clock, Film } from "lucide-react";
import type { Project } from "@/lib/types";
import { StatusBadge } from "@/components/status-badge";

const RATIO_CLASS: Record<Project["aspect_ratio"], string> = {
  "9:16": "aspect-[9/16]",
  "16:9": "aspect-video",
  "1:1": "aspect-square",
};

export function ProjectCard({ project }: { project: Project }) {
  return (
    <Link
      to="/app/projects/$projectId"
      params={{ projectId: project.id }}
      className="panel hover:border-primary/50 group overflow-hidden transition-colors"
    >
      <div className="bg-surface-2 relative aspect-video overflow-hidden">
        <div className="glow-top absolute inset-0" />
        <div className="absolute inset-0 grid place-items-center">
          <div
            className={`border-border/70 bg-background/40 grid h-[76%] place-items-center rounded-lg border ${RATIO_CLASS[project.aspect_ratio]}`}
          >
            <Film className="text-muted-foreground h-6 w-6" />
          </div>
        </div>
        <span className="bg-background/70 text-muted-foreground absolute top-3 left-3 rounded-full px-2 py-1 text-xs backdrop-blur">
          {project.style}
        </span>
      </div>
      <div className="space-y-3 p-4">
        <h3 className="group-hover:text-primary line-clamp-1 font-medium transition-colors">
          {project.title}
        </h3>
        <div className="flex items-center justify-between">
          <StatusBadge status={project.status} />
          <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <Clock className="h-3.5 w-3.5" />
            {new Date(project.created_at).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
        </div>
      </div>
    </Link>
  );
}
