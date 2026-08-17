import type { AspectRatio, DurationSeconds, VideoStyle } from "@/lib/types";

/** Browser-side client for the server video API. Contains no provider secrets. */

export interface StartGenerationInput {
  prompt: string;
  duration: DurationSeconds;
  aspectRatio: AspectRatio;
  style: VideoStyle;
  projectId: string;
  balance: number;
}

export interface StartGenerationResult {
  generationId: string;
  projectId: string;
  status: "queued" | "processing" | "completed" | "failed";
  provider: string;
}

export interface JobStatusResult {
  id: string;
  status: "queued" | "processing" | "completed" | "failed";
  progress: number;
  videoUrl: string | null;
  error: string | null;
}

export class VideoApiError extends Error {}

async function parse<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) throw new VideoApiError(body?.error ?? `Request failed (${res.status}).`);
  if (!body) throw new VideoApiError("Empty response from the video service.");
  return body;
}

export async function startGeneration(userId: string, input: StartGenerationInput) {
  const res = await fetch("/api/generate-video", {
    method: "POST",
    headers: { "content-type": "application/json", "x-videaai-user": userId },
    body: JSON.stringify(input),
  });
  return parse<StartGenerationResult>(res);
}

export async function fetchJobStatus(userId: string, jobId: string) {
  const res = await fetch(`/api/video-status/${jobId}`, {
    headers: { "x-videaai-user": userId },
  });
  return parse<JobStatusResult>(res);
}

/** Human-facing phase labels for the generation lifecycle. */
export function phaseLabel(status: JobStatusResult["status"], progress = 0) {
  if (status === "completed") return "Complete";
  if (status === "failed") return "Failed";
  if (status === "queued" || progress < 10) return "Preparing";
  if (progress < 85) return "Generating";
  return "Processing";
}
