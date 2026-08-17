import type { ProjectStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const LABEL: Record<ProjectStatus, string> = {
  draft: "Draft",
  queued: "Queued",
  processing: "Processing",
  ready: "Ready",
  failed: "Failed",
};

const TONE: Record<ProjectStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  queued: "bg-gold/15 text-gold",
  processing: "bg-primary/15 text-primary",
  ready: "bg-success/15 text-success",
  failed: "bg-destructive/15 text-destructive",
};

export function StatusBadge({ status, className }: { status: ProjectStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        TONE[status],
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {LABEL[status]}
    </span>
  );
}
