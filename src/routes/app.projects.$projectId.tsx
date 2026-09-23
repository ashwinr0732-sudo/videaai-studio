import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Download,
  Film,
  Loader2,
  Maximize,
  Pause,
  Play,
  RefreshCw,
  Volume2,
  VolumeX,
} from "lucide-react";
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
  fetchMediaToken,
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
      {
        name: "description",
        content: "Preview, download or regenerate your AI video project.",
      },
      { property: "og:title", content: "Project — VideaAI" },
      {
        property: "og:description",
        content: "AI video project details on VideaAI.",
      },
    ],
  }),
  component: ProjectDetailPage,
});

const POLL_INTERVAL_MS = 6000;
const TIMEOUT_MS = 90 * 60 * 1000;

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
  const [mediaToken, setMediaToken] = useState<string | null>(null);

  // Local browser URL for reliable video playback/seek.
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [loadingVideo, setLoadingVideo] = useState(false);

  // Player state.
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playerContainerRef = useRef<HTMLDivElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  const startedAt = useRef<number | null>(null);

  // Get the short-lived media token.
  useEffect(() => {
    const token = job?.mediaToken;

    if (token) {
      setMediaToken(token);
      return;
    }

    if (!user || !jobId || mediaToken) return;

    let cancelled = false;

    void fetchMediaToken(jobId)
      .then((token) => {
        if (!cancelled) {
          setMediaToken(token);
        }
      })
      .catch((error) => {
        console.error("Failed to get media token", error);
      });

    return () => {
      cancelled = true;
    };
  }, [job?.mediaToken, user, jobId, mediaToken]);

  // Poll generation status.
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
              {
                description: `${state.error ?? "Provider error."} Credits have been refunded.`,
              },
            );
          } else {
            toast.success(
              `Your video is ready — ${formatDuration(state.actualDuration) ?? "verified"}.`,
            );
          }

          return;
        }

        if (Date.now() - (startedAt.current ?? Date.now()) > TIMEOUT_MS) {
          applyJobUpdate(active!.id, {
            status: "failed",
            error: "Generation timed out.",
          });

          toast.error("Generation timed out", {
            description: "Credits have been refunded.",
          });
        }
      } catch (error) {
        console.error(error);
      }
    }

    void poll();

    const timer = setInterval(() => {
      void poll();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, jobId, isRunning, active?.id]);

  const projectVideoUrl = project?.video_url ?? null;
  const cost = project ? creditCost(project.duration_seconds) : 0;
  const ready = project?.status === "ready" && !!projectVideoUrl;

  /*
   * Load the protected MP4 into a Blob.
   *
   * This avoids relying on the protected streaming endpoint supporting
   * every HTTP Range request correctly. Once the browser has the Blob,
   * normal video controls such as seeking work reliably.
   */
  useEffect(() => {
    if (!ready || !projectVideoUrl || !mediaToken) {
      setPlaybackUrl(null);
      return;
    }

    const videoUrl = projectVideoUrl;
    const token = mediaToken;

    let cancelled = false;
    let objectUrl: string | null = null;

    async function loadVideo() {
      setLoadingVideo(true);

      try {
        const url = videoSrc(videoUrl, token);

        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(`Video request failed with status ${response.status}`);
        }

        const blob = await response.blob();

        if (cancelled) return;

        objectUrl = URL.createObjectURL(blob);
        setPlaybackUrl(objectUrl);
      } catch (error) {
        console.error("Failed to load video for playback", error);

        if (!cancelled) {
          toast.error("Could not load video", {
            description: "The video was generated, but the preview could not be loaded.",
          });
        }
      } finally {
        if (!cancelled) {
          setLoadingVideo(false);
        }
      }
    }

    void loadVideo();

    return () => {
      cancelled = true;

      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }

      setPlaybackUrl(null);
    };
  }, [ready, projectVideoUrl, mediaToken]);

  function togglePlay() {
    const video = videoRef.current;

    if (!video) return;

    if (video.paused) {
      void video.play();
    } else {
      video.pause();
    }
  }

  function handleTimeUpdate() {
    const video = videoRef.current;

    if (!video) return;

    setCurrentTime(video.currentTime);
  }

  function handleLoadedMetadata() {
    const video = videoRef.current;

    if (!video) return;

    setDuration(video.duration);
    setCurrentTime(video.currentTime);
  }

  function handleSeek(event: React.ChangeEvent<HTMLInputElement>) {
    const video = videoRef.current;

    if (!video) return;

    const newTime = Number(event.target.value);

    video.currentTime = newTime;
    setCurrentTime(newTime);
  }

  function handleVolume(event: React.ChangeEvent<HTMLInputElement>) {
    const video = videoRef.current;

    if (!video) return;

    const newVolume = Number(event.target.value);

    video.volume = newVolume;
    setVolume(newVolume);

    if (newVolume === 0) {
      video.muted = true;
      setIsMuted(true);
    } else {
      video.muted = false;
      setIsMuted(false);
    }
  }

  function toggleMute() {
    const video = videoRef.current;

    if (!video) return;

    video.muted = !video.muted;
    setIsMuted(video.muted);
  }

  async function handleFullscreen() {
    const container = playerContainerRef.current;

    if (!container) return;

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await container.requestFullscreen();
      }
    } catch (error) {
      console.error("Fullscreen failed", error);
    }
  }

  function formatPlayerTime(seconds: number) {
    if (!Number.isFinite(seconds) || seconds < 0) {
      return "0:00";
    }

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
  }

  if (!project) {
    return (
      <DashboardShell title="Project not found">
        <div className="panel flex flex-col items-center gap-4 p-14 text-center">
          <p className="text-muted-foreground text-sm">
            This project doesn't exist or was removed.
          </p>

          <Link to="/app/projects">
            <Button variant="secondary">
              <ArrowLeft className="h-4 w-4" />
              Back to projects
            </Button>
          </Link>
        </div>
      </DashboardShell>
    );
  }

  async function handleRegenerate() {
    if (!project) return;

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
        prompt: project.prompt,
        duration: project.duration_seconds,
        aspectRatio: project.aspect_ratio,
        style: project.style,
        projectId,
      });

      linkGeneration(generation.id, result.generationId, result.provider);

      startedAt.current = Date.now();

      setProgress(0);
      setPhase("Preparing");
      setPlaybackUrl(null);
      setCurrentTime(0);
      setDuration(0);

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
    <DashboardShell
      title={project.title}
      description={`${project.style} · ${project.aspect_ratio}`}
    >
      <div className="space-y-6">
        <Link
          to="/app/projects"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-2 text-sm"
        >
          <ArrowLeft className="h-4 w-4" />
          All projects
        </Link>

        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <div className="panel overflow-hidden">
            <div
              ref={playerContainerRef}
              className="bg-black relative aspect-video overflow-hidden"
            >
              <div className="glow-top pointer-events-none absolute inset-0" />

              {ready ? (
                <>
                  {loadingVideo && !playbackUrl ? (
                    <div className="absolute inset-0 grid place-items-center">
                      <div className="text-center">
                        <Loader2 className="text-primary mx-auto h-8 w-8 animate-spin" />
                        <p className="text-muted-foreground mt-3 text-sm">Loading video…</p>
                      </div>
                    </div>
                  ) : playbackUrl ? (
                    <>
                      <video
                        ref={videoRef}
                        src={playbackUrl}
                        className="absolute inset-0 h-full w-full object-contain"
                        playsInline
                        preload="metadata"
                        onPlay={() => setIsPlaying(true)}
                        onPause={() => setIsPlaying(false)}
                        onEnded={() => setIsPlaying(false)}
                        onTimeUpdate={handleTimeUpdate}
                        onLoadedMetadata={handleLoadedMetadata}
                      />

                      {/* Custom controls */}
                      <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-4 pb-4 pt-10">
                        {/* Progress */}
                        <div className="mb-3 flex items-center gap-3">
                          <span className="w-10 text-xs text-white">
                            {formatPlayerTime(currentTime)}
                          </span>

                          <input
                            type="range"
                            min="0"
                            max={duration || 0}
                            step="0.01"
                            value={Math.min(currentTime, duration || 0)}
                            onChange={handleSeek}
                            className="h-1.5 flex-1 cursor-pointer accent-white"
                            aria-label="Video progress"
                          />

                          <span className="w-10 text-right text-xs text-white">
                            {formatPlayerTime(duration)}
                          </span>
                        </div>

                        {/* Buttons */}
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={togglePlay}
                            className="grid h-9 w-9 place-items-center rounded-full bg-white text-black transition hover:bg-white/90"
                            aria-label={isPlaying ? "Pause video" : "Play video"}
                          >
                            {isPlaying ? (
                              <Pause className="h-4 w-4" />
                            ) : (
                              <Play className="ml-0.5 h-4 w-4" />
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={toggleMute}
                            className="grid h-9 w-9 place-items-center rounded-full text-white transition hover:bg-white/10"
                            aria-label={isMuted ? "Unmute video" : "Mute video"}
                          >
                            {isMuted ? (
                              <VolumeX className="h-5 w-5" />
                            ) : (
                              <Volume2 className="h-5 w-5" />
                            )}
                          </button>

                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={isMuted ? 0 : volume}
                            onChange={handleVolume}
                            className="w-20 cursor-pointer accent-white"
                            aria-label="Volume"
                          />

                          <div className="flex-1" />

                          <button
                            type="button"
                            onClick={handleFullscreen}
                            className="grid h-9 w-9 place-items-center rounded-full text-white transition hover:bg-white/10"
                            aria-label="Fullscreen"
                          >
                            <Maximize className="h-5 w-5" />
                          </button>
                        </div>
                      </div>
                    </>
                  ) : null}
                </>
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
                <Button
                  variant="secondary"
                  disabled={!ready || !playbackUrl}
                  asChild={!!ready && !!playbackUrl}
                >
                  {ready && playbackUrl ? (
                    <a href={playbackUrl} download={`${project.title}.mp4`}>
                      <Download className="h-4 w-4" />
                      Download
                    </a>
                  ) : (
                    <span>
                      <Download className="h-4 w-4" />
                      Download
                    </span>
                  )}
                </Button>

                <Button
                  disabled={balance < cost || isRunning || restarting}
                  onClick={handleRegenerate}
                >
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

                ...(job?.fps ? ([["Frame rate", `${job.fps} fps`]] as [string, string][]) : []),

                ...(job?.videoCodec ? ([["Codec", job.videoCodec]] as [string, string][]) : []),

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
