import { supabase } from "@/integrations/supabase/client";
import type { AspectRatio, DurationSeconds, VideoStyle } from "@/lib/types";

/**
 * Browser-side client for the server video API. Contains no provider secrets.
 * Every call carries the real Supabase access token; the server never trusts a
 * user id or credit balance sent from here.
 */

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new VideoApiError("Your session has expired. Please sign in again.");
  return { authorization: `Bearer ${token}` };
}

export interface StartGenerationInput {
  prompt: string;
  duration: DurationSeconds;
  aspectRatio: AspectRatio;
  style: VideoStyle;
  projectId: string;
}

export interface StartGenerationResult {
  generationId: string;
  projectId: string;
  status: "queued" | "processing" | "completed" | "failed";
  provider: string;
  sceneCount: number;
  scenePlan: number[];
}

export type JobPhase =
  | "planning"
  | "generating"
  | "stitching"
  | "verifying"
  | "completed"
  | "failed";

export interface SceneState {
  index: number;
  title: string;
  seconds: number;
  status: "pending" | "generating" | "stored" | "failed";
}

export interface JobStatusResult {
  id: string;
  status: "queued" | "processing" | "completed" | "failed";
  phase: JobPhase;
  progress: number;
  error: string | null;
  failedScene: number | null;
  videoUrl: string | null;
  sceneCount: number;
  scenesCompleted: number;
  scenes: SceneState[];
  requestedDuration: number;
  /** Measured from the finished file — not the requested duration. */
  actualDuration: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  videoCodec: string | null;
  refundCredits: number;
  /** Short-lived signed token for playback/download of a finished render. */
  mediaToken?: string | null;
}

export class VideoApiError extends Error {}

async function parse<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) throw new VideoApiError(body?.error ?? `Request failed (${res.status}).`);
  if (!body) throw new VideoApiError("Empty response from the video service.");
  return body;
}

export async function startGeneration(input: StartGenerationInput) {
  const res = await fetch("/api/generate-video", {
    method: "POST",
    headers: { "content-type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(input),
  });
  return parse<StartGenerationResult>(res);
}

export async function fetchJobStatus(jobId: string) {
  const res = await fetch(`/api/video-status/${jobId}`, { headers: await authHeaders() });
  return parse<JobStatusResult>(res);
}

/** Ask the server for a short-lived signed playback token for a finished render. */
export async function fetchMediaToken(jobId: string) {
  const res = await fetch(`/api/video-token/${jobId}`, { headers: await authHeaders() });
  const body = await parse<{ token: string }>(res);
  return body.token;
}

/**
 * `<video>` and download links cannot send headers, so a server-signed,
 * expiring token is used instead of any client-supplied identity.
 */
export function videoSrc(url: string, token: string, download = false) {
  return `${url}?t=${encodeURIComponent(token)}${download ? "&download=1" : ""}`;
}

/** Human-facing phase labels for the generation lifecycle. */
export function phaseLabel(job: Pick<JobStatusResult, "status" | "phase" | "scenesCompleted" | "sceneCount">) {
  if (job.status === "completed") return "Complete";
  if (job.status === "failed") return "Failed";
  switch (job.phase) {
    case "planning":
      return "Preparing scenes";
    case "generating":
      return job.sceneCount > 1
        ? `Generating scene ${Math.min(job.scenesCompleted + 1, job.sceneCount)} of ${job.sceneCount}`
        : "Generating";
    case "stitching":
      return "Processing";
    case "verifying":
      return "Verifying";
    default:
      return "Preparing";
  }
}

/** e.g. "14.02s" — always the measured value when one exists. */
export function formatDuration(seconds: number | null | undefined) {
  if (seconds == null) return null;
  return `${seconds.toFixed(2)}s`;
}
