/**
 * Server-side video provider abstraction.
 *
 * VideaAI uses RunPod Serverless to execute Wan2.2 TI2V-5B.
 * Provider secrets stay server-side.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { AspectRatio } from "@/lib/types";

export type JobStatus = "queued" | "processing" | "completed" | "failed";

/**
 * Wan2.2 TI2V-5B's standard text-to-video output is 121 frames at 24 fps,
 * which is approximately 5.04 seconds. VideaAI composes longer products from
 * these fixed-length clips and stitches them server-side.
 */
export type ClipSeconds = 5;

export interface ClipRequest {
  prompt: string;
  seconds: ClipSeconds;
  aspectRatio: AspectRatio;
  inputReference?: string;
  /** Private Supabase Storage path where the RunPod worker will write the MP4. */
  storagePath: string;
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
  readonly supportedClipSeconds: readonly ClipSeconds[];
  readonly supportsImageReference: boolean;

  createClip(input: ClipRequest): Promise<ProviderJob>;
  getClip(clipJobId: string): Promise<ProviderJob>;
  downloadClip(clipJobId: string): Promise<Uint8Array>;

  sizeFor(aspectRatio: AspectRatio): {
    size: string;
    width: number;
    height: number;
  };
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

const RUNPOD_BASE_URL = "https://api.runpod.ai/v2";
const RUNPOD_MODEL = "Wan-AI/Wan2.2-TI2V-5B";
const BUCKET = "generated-videos";

function getRunPodConfig() {
  const apiKey = process.env["RUNPOD_API_KEY"]?.trim();
  const endpointId = process.env["RUNPOD_ENDPOINT_ID"]?.trim();

  if (!apiKey || !endpointId) {
    throw new VideoProviderError(
      "Video generation is not configured. Add RUNPOD_API_KEY and RUNPOD_ENDPOINT_ID to the server environment.",
      500,
    );
  }

  return { apiKey, endpointId };
}

function providerErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;

  if (typeof error === "object" && error !== null) {
    const value = error as {
      message?: unknown;
      detail?: unknown;
      error?: unknown;
    };

    if (typeof value.message === "string") return value.message;
    if (typeof value.detail === "string") return value.detail;
    if (typeof value.error === "string") return value.error;
  }

  return "The video provider returned an unexpected error.";
}

type RunPodResponse = {
  id?: string;
  status?: string;
  error?: unknown;
  message?: unknown;
  output?: unknown;
};

async function runPodRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const { apiKey, endpointId } = getRunPodConfig();
  const response = await fetch(`${RUNPOD_BASE_URL}/${encodeURIComponent(endpointId)}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    const body = (data ?? {}) as {
      error?: unknown;
      message?: unknown;
      detail?: unknown;
    };
    const message =
      typeof body.error === "string"
        ? body.error
        : typeof body.message === "string"
          ? body.message
          : typeof body.detail === "string"
            ? body.detail
            : text || `RunPod request failed (${response.status}).`;

    throw new VideoProviderError(message, response.status);
  }

  return data as T;
}

function mapRunPodStatus(status?: string): JobStatus {
  switch (String(status ?? "").toUpperCase()) {
    case "COMPLETED":
      return "completed";
    case "FAILED":
    case "CANCELLED":
    case "TIMED_OUT":
      return "failed";
    case "IN_PROGRESS":
    case "RUNNING":
      return "processing";
    case "IN_QUEUE":
    case "QUEUED":
    case "STARTING":
    default:
      return "queued";
  }
}

function runPodError(job: RunPodResponse): string | null {
  if (typeof job.error === "string" && job.error.trim()) return job.error;
  if (typeof job.message === "string" && job.message.trim()) return job.message;

  if (typeof job.output === "object" && job.output !== null) {
    const output = job.output as { error?: unknown; message?: unknown };
    if (typeof output.error === "string" && output.error.trim()) return output.error;
    if (typeof output.message === "string" && output.message.trim()) return output.message;
  }

  return null;
}

function runPodProgress(status: string | undefined): number {
  switch (String(status ?? "").toUpperCase()) {
    case "COMPLETED":
      return 100;
    case "IN_PROGRESS":
    case "RUNNING":
      return 50;
    case "FAILED":
    case "CANCELLED":
    case "TIMED_OUT":
      return 0;
    default:
      return 5;
  }
}

function getStoragePath(output: unknown): string | null {
  if (typeof output !== "object" || output === null) return null;
  const value = output as { storage_path?: unknown; storagePath?: unknown };
  const path =
    typeof value.storage_path === "string"
      ? value.storage_path
      : typeof value.storagePath === "string"
        ? value.storagePath
        : null;

  if (!path || !path.startsWith("renders/") || path.includes("..")) return null;
  return path;
}

const runPodWanProvider: VideoProvider = {
  name: "runpod-wan2.2-ti2v-5b",
  model: RUNPOD_MODEL,
  supportedClipSeconds: [5],
  supportsImageReference: false,

  sizeFor(aspectRatio) {
    if (aspectRatio === "9:16") {
      return { size: "704x1280", width: 704, height: 1280 };
    }

    if (aspectRatio === "16:9") {
      return { size: "1280x704", width: 1280, height: 704 };
    }

    return { size: "704x704", width: 704, height: 704 };
  },

  async createClip(input) {
    if (input.seconds !== 5) {
      throw new VideoProviderError("Wan2.2 TI2V-5B currently generates 5-second clips only.", 400);
    }

    if (input.inputReference) {
      throw new VideoProviderError(
        "Image references are not enabled in the current VideaAI RunPod workflow.",
        400,
      );
    }

    if (!input.storagePath.startsWith("renders/") || input.storagePath.includes("..")) {
      throw new VideoProviderError("Invalid video storage path.", 400);
    }

    try {
      const job = await runPodRequest<RunPodResponse>("/run", {
        method: "POST",
        body: JSON.stringify({
          input: {
            prompt: input.prompt,
            seconds: input.seconds,
            aspect_ratio: input.aspectRatio,
            storage_path: input.storagePath,
          },
        }),
      });

      if (!job.id) {
        throw new VideoProviderError(
          "RunPod accepted the request but did not return a job ID.",
          502,
        );
      }

      return {
        id: job.id,
        status: mapRunPodStatus(job.status),
        progress: runPodProgress(job.status),
        error: runPodError(job),
      };
    } catch (error) {
      if (error instanceof VideoProviderError) throw error;
      throw new VideoProviderError(providerErrorMessage(error), 502);
    }
  },

  async getClip(clipJobId) {
    try {
      const job = await runPodRequest<RunPodResponse>(`/status/${encodeURIComponent(clipJobId)}`);
      const status = mapRunPodStatus(job.status);

      return {
        id: clipJobId,
        status,
        progress: runPodProgress(job.status),
        error: status === "failed" ? (runPodError(job) ?? "RunPod generation failed.") : null,
      };
    } catch (error) {
      return {
        id: clipJobId,
        status: "failed",
        progress: 0,
        error: providerErrorMessage(error),
      };
    }
  },

  async downloadClip(clipJobId) {
    try {
      const job = await runPodRequest<RunPodResponse>(`/status/${encodeURIComponent(clipJobId)}`);
      const status = mapRunPodStatus(job.status);

      if (status !== "completed") {
        throw new VideoProviderError(
          `RunPod video generation has not completed yet. Current status: ${job.status ?? "unknown"}.`,
          409,
        );
      }

      const storagePath = getStoragePath(job.output);
      if (!storagePath) {
        throw new VideoProviderError(
          "RunPod completed the generation but did not return the Supabase storage path.",
          502,
        );
      }

      const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(storagePath);

      if (error || !data) {
        throw new VideoProviderError(
          error?.message ?? "The generated MP4 could not be downloaded from storage.",
          502,
        );
      }

      return new Uint8Array(await data.arrayBuffer());
    } catch (error) {
      if (error instanceof VideoProviderError) throw error;
      throw new VideoProviderError(providerErrorMessage(error), 502);
    }
  },
};

export function getVideoProvider(): VideoProvider {
  return runPodWanProvider;
}
