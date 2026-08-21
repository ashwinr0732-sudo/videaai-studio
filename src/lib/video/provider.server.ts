/**
 * Server-side video provider abstraction.
 *
 * Nothing in this file is ever bundled for the browser (`*.server.ts`), so the
 * provider API key stays on the server. Swapping providers later means adding a
 * new object that implements `VideoProvider` and returning it from
 * `getVideoProvider()` — no application or UI code changes.
 *
 * The provider speaks in CLIPS, not in "requested durations". `google/veo-3.1-lite`
 * can only produce 4, 6 or 8 second clips, so anything longer is composed from
 * several clips by the orchestrator (`jobs.server.ts`). This module never silently
 * clamps a requested duration.
 */

import type { AspectRatio } from "@/lib/types";

export type JobStatus = "queued" | "processing" | "completed" | "failed";

/** Clip lengths the model physically supports. */
export type ClipSeconds = 4 | 6 | 8;

export interface ClipRequest {
  prompt: string;
  seconds: ClipSeconds;
  aspectRatio: AspectRatio;
  /**
   * Optional continuity input: a base64 `data:` URL (JPEG/PNG) the clip animates
   * from (image-to-video). Only sent when a real reference image exists.
   */
  inputReference?: string;
}

export interface ProviderJob {
  id: string;
  status: JobStatus;
  progress: number;
  error: string | null;
}

export interface VideoProvider {
  readonly name: string;
  readonly model: string;
  /** Clip lengths the model supports, ascending. */
  readonly supportedClipSeconds: readonly ClipSeconds[];
  /** Whether an image can be passed as the first frame of a clip. */
  readonly supportsImageReference: boolean;
  createClip(input: ClipRequest): Promise<ProviderJob>;
  getClip(clipJobId: string): Promise<ProviderJob>;
  /** ORIGINAL MP4 bytes as delivered by the provider — never a re-encoded preview. */
  downloadClip(clipJobId: string): Promise<Uint8Array>;
  /** Output pixel size for an aspect ratio, at the best value that adds no cost. */
  sizeFor(aspectRatio: AspectRatio): { size: string; width: number; height: number };
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
  model: "google/veo-3.1-lite",
  supportedClipSeconds: [4, 6, 8],
  supportsImageReference: true,

  /**
   * 720p is the model's best *no-surcharge* tier: on veo-3.1-lite 1080p costs more
   * per second AND is restricted to 8-second clips, which would make the 6-second
   * closing scene impossible. 4k is not offered on lite at all. Every clip in a
   * render therefore shares one resolution and frame rate, which is also what makes
   * a lossless stitch possible.
   */
  sizeFor(aspectRatio) {
    if (aspectRatio === "9:16") return { size: "720x1280", width: 720, height: 1280 };
    // 1:1 is not supported by the provider; landscape is the closest safe fit.
    return { size: "1280x720", width: 1280, height: 720 };
  },

  async createClip(input) {
    const body: Record<string, unknown> = {
      model: this.model,
      prompt: input.prompt,
      seconds: String(input.seconds),
      size: this.sizeFor(input.aspectRatio).size,
    };
    if (input.inputReference) body["input_reference"] = input.inputReference;

    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new VideoProviderError(await readError(res), res.status);
    const job = (await res.json()) as { id: string; status?: string; progress?: number };
    return {
      id: job.id,
      status: mapStatus(job.status),
      progress: job.progress ?? 0,
      error: null,
    };
  },

  async getClip(clipJobId) {
    const res = await fetch(`${GATEWAY}/${clipJobId}`, {
      headers: { Authorization: `Bearer ${apiKey()}` },
    });
    if (!res.ok) throw new VideoProviderError(await readError(res), res.status);
    const job = (await res.json()) as {
      id: string;
      status?: string;
      progress?: number;
      error?: { message?: string; code?: string } | null;
    };
    const status = mapStatus(job.status);
    return {
      id: job.id,
      status,
      progress: status === "completed" ? 100 : (job.progress ?? 0),
      error: job.error?.message ?? null,
    };
  },

  async downloadClip(clipJobId) {
    const res = await fetch(`${GATEWAY}/${clipJobId}/content`, {
      headers: { Authorization: `Bearer ${apiKey()}` },
    });
    if (!res.ok) throw new VideoProviderError(await readError(res), res.status);
    return new Uint8Array(await res.arrayBuffer());
  },
};

export function getVideoProvider(): VideoProvider {
  return lovableVeoProvider;
}
