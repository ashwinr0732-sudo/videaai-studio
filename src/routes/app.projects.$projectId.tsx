import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Download, Film, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { DashboardShell } from "@/components/dashboard-shell";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/lib/auth";
import { useData } from "@/lib/data-store";
import { creditCost } from "@/lib/types";
import {
  fetchJobStatus,
  formatDuration,
  phaseLabel,
  startGeneration,
  videoSrc,
  type JobStatusResult,
} from "@/lib/video/client";

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

const POLL_INTERVAL_MS = 6000;
/** Hard stop so a stuck provider job can't spin forever. */
const TIMEOUT_MS = 25 * 60 * 1000;

function ProjectDetailPage() {
  const { projectId } = Route.useParams();
  const { getProject, regenerate, balance, generationsFor, linkGeneration, applyJobUpdate } =
    useData();
  const { user } = useAuth();
  const project = getProject(projectId);
  const history = generationsFor(projectId);
  const active = history[0];
  const jobId = active?.provider_job_id ?? null;
  const isRunning = active?.status === "queued" || active?.status === "processing";

  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState("Preparing");
  const [job, setJob] = useState<JobStatusResult | null>(null);
  const [restarting, setRestarting] = useState(false);
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    if (!user || !jobId || !isRunning) return;
    startedAt.current ??= Date.now();
    let cancelled = false;

    async function poll() {
      if (cancelled || !user || !jobId) return;
      try {
        const state = await fetchJobStatus(jobId);
        if (cancelled) return;
        setJob(state);
        setProgress(state.status === "completed" ? 100 : state.progress);
        setPhase(phaseLabel(state));
        if (state.status === "completed" || state.status === "failed") {
          applyJobUpdate(active!.id, {
            status: state.status,
            videoUrl: state.videoUrl,
            error: state.error,
            actualDuration: state.actualDuration,
            refundCredits: state.refundCredits,
          });
          if (state.status === "failed") {
            toast.error(
              state.failedScene ? `Scene ${state.failedScene} failed` : "Generation failed",
              { description: `${state.error ?? "Provider error."} Credits have been refunded.` },
            );
          } else {
            toast.success(
              `Your video is ready — ${formatDuration(state.actualDuration) ?? "verified"}.`,
            );
          }
          return;
        }
        if (Date.now() - (startedAt.current ?? Date.now()) > TIMEOUT_MS) {
          applyJobUpdate(active!.id, { status: "failed", error: "Generation timed out." });
          toast.error("Generation timed out", { description: "Credits have been refunded." });
        }
      } catch (error) {
        // Transient read failures keep polling; only surface the message.
        console.error(error);
      }
    }

    void poll();
    const timer = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, jobId, isRunning, active?.id]);

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

  const cost = creditCost(project.duration_seconds);
  const ready = project.status === "ready" && project.video_url;

  async function handleRegenerate() {
    if (!user) {
      toast.error("Please sign in to generate videos.");
      return;
    }
    if (balance < cost) {
      toast.error("Not enough credits for this render.");
      return;
    }
    setRestarting(true);
    const generation = regenerate(projectId);
    if (!generation) {
      setRestarting(false);
      return;
    }
    try {
      const result = await startGeneration({
        prompt: project!.prompt,
        duration: project!.duration_seconds,
        aspectRatio: project!.aspect_ratio,
        style: project!.style,
        projectId,
      });
      linkGeneration(generation.id, result.generationId, result.provider);
      startedAt.current = Date.now();
      setProgress(0);
      setPhase("Preparing");
      toast.success("Regeneration started");
    } catch (error) {
      applyJobUpdate(generation.id, {
        status: "failed",
        error: error instanceof Error ? error.message : "Generation failed to start.",
      });
      toast.error("Could not start generation", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setRestarting(false);
    }
  }

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
                  src={
                    project.video_url && user ? videoSrc(project.video_url, user.id) : undefined
                  }
                />
              ) : (
                <div className="absolute inset-0 grid place-items-center gap-3 text-center">
                  <div className="w-full max-w-xs px-6">
                    {isRunning ? (
                      <>
                        <Loader2 className="text-primary mx-auto h-8 w-8 animate-spin" />
                        <p className="mt-3 text-sm font-medium">{phase}</p>
                        <Progress value={Math.max(progress, 5)} className="mt-3" />
                        <p className="text-muted-foreground mt-2 text-xs">
                          {job && job.sceneCount > 1
                            ? `${job.sceneCount} scenes are generated in sequence, then stitched and verified. This takes a few minutes.`
                            : "Rendering usually takes 1–3 minutes."}
                        </p>
                      </>
                    ) : (
                      <>
                        <Film className="text-muted-foreground mx-auto h-8 w-8" />
                        <p className="mt-3 text-sm font-medium">
                          {project.status === "failed" ? "Generation failed" : "No video yet"}
                        </p>
                        <p className="text-muted-foreground mt-1 text-xs">
                          {active?.error_message ?? "Start a render to see your video here."}
                        </p>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
              <StatusBadge status={project.status} />
              <div className="flex gap-2">
                <Button variant="secondary" disabled={!ready} asChild={!!ready}>
                  {ready && user ? (
                    <a
                      href={videoSrc(project.video_url!, user.id, true)}
                      download={`${project.title}.mp4`}
                    >
                      <Download className="h-4 w-4" /> Download
                    </a>
                  ) : (
                    <span>
                      <Download className="h-4 w-4" /> Download
                    </span>
                  )}
                </Button>
                <Button disabled={balance < cost || isRunning || restarting} onClick={handleRegenerate}>
                  {restarting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Regenerate
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
                [
                  "Duration",
                  project.actual_duration_seconds
                    ? `${formatDuration(project.actual_duration_seconds)} (verified)`
                    : `${project.duration_seconds}s requested`,
                ],
                ...(job?.width && job?.height
                  ? ([["Resolution", `${job.width}x${job.height}`]] as [string, string][])
                  : []),
                ...(job?.fps
                  ? ([["Frame rate", `${job.fps} fps`]] as [string, string][])
                  : []),
                ...(job?.videoCodec
                  ? ([["Codec", job.videoCodec]] as [string, string][])
                  : []),
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
