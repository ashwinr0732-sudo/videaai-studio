import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2, Sparkles, Zap } from "lucide-react";
import { toast } from "sonner";
import { DashboardShell } from "@/components/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { useData } from "@/lib/data-store";
import { CREDIT_COST, type AspectRatio, type DurationSeconds, type VideoStyle } from "@/lib/types";
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

const DURATIONS: DurationSeconds[] = [5, 10, 30];
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
  const { createProject, balance } = useData();
  const navigate = useNavigate();

  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState<DurationSeconds>(5);
  const [ratio, setRatio] = useState<AspectRatio>("16:9");
  const [style, setStyle] = useState<VideoStyle>("Cinematic");
  const [submitting, setSubmitting] = useState(false);

  const cost = CREDIT_COST[duration];
  const canSubmit = prompt.trim().length >= 8 && balance >= cost && !submitting;

  function handleGenerate() {
    if (!canSubmit) return;
    setSubmitting(true);
    // The provider request is intentionally not implemented client-side:
    // the project row is queued and a secure server worker will pick it up.
    const project = createProject({
      prompt,
      duration_seconds: duration,
      aspect_ratio: ratio,
      style,
    });
    setTimeout(() => {
      setSubmitting(false);
      toast.success("Project queued", {
        description: "It will render as soon as a generation provider is connected.",
      });
      navigate({ to: "/app/projects/$projectId", params: { projectId: project.id } });
    }, 900);
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
