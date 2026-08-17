/**
 * Server-side video provider abstraction.
 *
 * Nothing in this file is ever bundled for the browser (`*.server.ts`), so the
 * provider API key stays on the server. Swapping providers later means adding a
 * new object that implements `VideoProvider` and returning it from
 * `getVideoProvider()` — no application or UI code changes.
 */

import type { AspectRatio, DurationSeconds, VideoStyle } from "@/lib/types";

export type JobStatus = "queued" | "processing" | "completed" | "failed";

export interface CreateJobInput {
  prompt: string;
  duration: DurationSeconds;
  aspectRatio: AspectRatio;
  style: VideoStyle;
}

export interface ProviderJob {
  id: string;
  status: JobStatus;
  progress: number;
  /** Only set when status === "completed". */
  videoUrl: string | null;
  error: string | null;
}

export interface VideoProvider {
  readonly name: string;
  createJob(input: CreateJobInput): Promise<ProviderJob>;
  getJob(jobId: string): Promise<ProviderJob>;
  /** Raw MP4 bytes for playback/download proxying. */
  fetchContent(jobId: string): Promise<Response>;
}

export class VideoProviderError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "VideoProviderError";
  }
}

const GATEWAY = "https://ai.gateway.lovable.dev/v1/videos";

/** Provider clip lengths are fixed (4/6/8s); pick the closest supported value. */
function mapSeconds(duration: DurationSeconds): "4" | "6" | "8" {
  if (duration <= 5) return "6";
  return "8";
}

function mapSize(aspectRatio: AspectRatio): string {
  if (aspectRatio === "9:16") return "720x1280";
  // 1:1 is not supported by the provider; landscape is the closest safe fit.
  return "1280x720";
}

function buildPrompt(input: CreateJobInput) {
  return `${input.prompt.trim()}\n\nVisual style: ${input.style}. Framing: ${input.aspectRatio}.`;
}

function apiKey() {
  // Read at call time: server env is injected per request.
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new VideoProviderError("Video generation is not configured.", 500);
  return key;
}

function mapStatus(raw: unknown): JobStatus {
  switch (raw) {
    case "completed":
      return "completed";
    case "failed":
return "failed";
    case "queued":
      return "queued";
    default:
      return "processing";
  }
}

async function readError(res: Response) {
  const body = (await res.json().catch(() => null)) as { message?: string } | null;
  return body?.message ?? `Provider request failed (${res.status}).`;
}

const lovableVeoProvider: VideoProvider = {
  name: "lovable-veo",

  async createJob(input) {
    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/veo-3.1-lite",
        prompt: buildPrompt(input),
        seconds: mapSeconds(input.duration),
        size: mapSize(input.aspectRatio),
      }),
    });
    if (!res.ok) throw new VideoProviderError(await readError(res), res.status);
    const job = (await res.json()) as { id: string; status?: string; progress?: number };
    return {
      id: job.id,
      status: mapStatus(job.status),
      progress: job.progress ?? 0,
      videoUrl: null,
      error: null,
    };
  },

  async getJob(jobId) {
    const res = await fetch(`${GATEWAY}/${jobId}`, {
      headers: { Authorization: `Bearer ${apiKey()}` },
    });
    if (!res.ok) throw new VideoProviderError(await readError(res), res.status);
    const job = (await res.json()) as {
      id: string;
      status?: string;
      progress?: number;
      error?: { message?: string } | null;
    };
    const status = mapStatus(job.status);
    return {
      id: job.id,
      status,
      progress: status === "completed" ? 100 : (job.progress ?? 0),
      // Bytes are proxied through our own route so no provider URL or key leaks.
      videoUrl: status === "completed" ? `/api/video-content/${job.id}` : null,
      error: job.error?.message ?? null,
    };
  },

  async fetchContent(jobId) {
    const res = await fetch(`${GATEWAY}/${jobId}/content`, {
      headers: { Authorization: `Bearer ${apiKey()}` },
    });
    if (!res.ok) throw new VideoProviderError(await readError(res), res.status);
    return res;
  },
};

export function getVideoProvider(): VideoProvider {
  return lovableVeoProvider;
}
