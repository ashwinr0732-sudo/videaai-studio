import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2, Sparkles, Zap } from "lucide-react";
import { toast } from "sonner";
import { DashboardShell } from "@/components/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/lib/auth";
import { useData } from "@/lib/data-store";
import { startGeneration } from "@/lib/video/client";
import { creditCost, SCENE_PLAN, type AspectRatio, type DurationSeconds, type VideoStyle } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/create")({
  head: () => ({
    meta: [
      { title: "Create a video — VideaAI" },
      { name: "description", content: "Describe a scene and generate an AI video with VideaAI." },
      { property: "og:title", content: "Create a video — VideaAI" },
      { property: "og:description", content: "Turn a text prompt into an AI-generated video." },
    ],
  }),
  component: CreatePage,
});

const DURATIONS: DurationSeconds[] = [10, 15, 30];
const RATIOS: AspectRatio[] = ["9:16", "16:9", "1:1"];
const STYLES: VideoStyle[] = ["Cinematic", "Realistic", "Anime", "3D", "Animation"];

function OptionGroup<T extends string | number>({
  label,
  options,
  value,
  onChange,
  render,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  render?: (v: T) => string;
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={String(option)}
            type="button"
            onClick={() => onChange(option)}
            className={cn(
              "rounded-lg border px-4 py-2 text-sm transition-colors",
              option === value
                ? "border-primary bg-primary/10 text-primary font-medium"
                : "border-border bg-surface-2 text-muted-foreground hover:text-foreground",
            )}
          >
            {render ? render(option) : String(option)}
          </button>
        ))}
      </div>
    </div>
  );
}

function CreatePage() {
  const { createProject, balance, linkGeneration, applyJobUpdate } = useData();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState<DurationSeconds>(10);
  const [ratio, setRatio] = useState<AspectRatio>("16:9");
  const [style, setStyle] = useState<VideoStyle>("Cinematic");
  const [submitting, setSubmitting] = useState(false);

  const cost = creditCost(duration);
  const scenePlan = SCENE_PLAN[duration];
  const canSubmit = prompt.trim().length >= 8 && balance >= cost && !submitting;

  async function handleGenerate() {
    if (!canSubmit) return;
    if (!user) {
      toast.error("Please sign in to generate videos.");
      return;
    }
    if (prompt.trim().length < 8) {
      toast.error("Prompt must be at least 8 characters.");
      return;
    }
    setSubmitting(true);
    // Credits are reserved locally, then the secure server endpoint starts the
    // real provider job. No provider key ever reaches the browser.
    const { project, generation } = createProject({
      prompt,
      duration_seconds: duration,
      aspect_ratio: ratio,
      style,
    });
    try {
      const result = await startGeneration({
        prompt: prompt.trim(),
        duration,
        aspectRatio: ratio,
        style,
        projectId: project.id,
      });
      linkGeneration(generation.id, result.generationId, result.provider);
      toast.success("Generation started", { description: "Tracking progress on the project page." });
      navigate({ to: "/app/projects/$projectId", params: { projectId: project.id } });
    } catch (error) {
      applyJobUpdate(generation.id, {
        status: "failed",
        error: error instanceof Error ? error.message : "Generation failed to start.",
      });
      toast.error("Could not start generation", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setSubmitting(false);
    }
  }


  return (
    <DashboardShell title="Create" description="Describe your video and pick its look.">
      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="panel space-y-6 p-5 sm:p-6">
          <div>
            <p className="mb-2 text-sm font-medium">Prompt</p>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the video you want to create..."
              className="bg-surface-2 min-h-44 resize-none text-base"
            />
            <p className="text-muted-foreground mt-2 text-xs">
              Be specific about subject, motion, lighting and mood.
            </p>
          </div>

          <OptionGroup
            label="Duration"
            options={DURATIONS}
            value={duration}
            onChange={setDuration}
            render={(d) => `${d} seconds`}
          />
          <p className="text-muted-foreground -mt-3 text-xs">
            {scenePlan.length === 1
              ? "Rendered as a single clip."
              : `Rendered as ${scenePlan.length} planned scenes (${scenePlan.join("s + ")}s) and stitched into one file. Final length is verified after stitching.`}
          </p>
          <OptionGroup label="Aspect ratio" options={RATIOS} value={ratio} onChange={setRatio} />
          <OptionGroup label="Style" options={STYLES} value={style} onChange={setStyle} />

          <div className="border-border/70 flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
              <Zap className="text-primary h-4 w-4" /> Costs {cost} credit{cost > 1 ? "s" : ""} ·{" "}
              {balance} available
            </p>
            <Button size="lg" disabled={!canSubmit} onClick={handleGenerate}>
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Generate Video
            </Button>
          </div>
          {balance < cost && (
            <p className="text-destructive text-sm">
              Not enough credits for this duration. Upgrade your plan to continue.
            </p>
          )}
        </div>

        <div className="panel h-fit space-y-4 p-5 sm:p-6">
          <h2 className="font-semibold">Generation progress</h2>
          {submitting ? (
            <div className="space-y-3">
              <Progress value={35} />
              <p className="text-muted-foreground text-sm">Queuing your generation…</p>
            </div>
          ) : (
            <div className="space-y-3">
              <Progress value={0} />
              <p className="text-muted-foreground text-sm">
                No active generation. Submit a prompt and progress will appear here.
              </p>
            </div>
          )}
          <div className="bg-surface-2 border-border/70 space-y-2 rounded-xl border p-4 text-sm">
            <p className="font-medium">Current settings</p>
            <p className="text-muted-foreground">
              {duration}s · {ratio} · {style}
            </p>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
