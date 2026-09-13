/**
 * Server-side video provider abstraction.
 *
 * VideaAI currently uses Magic Hour's Text-to-Video API.
 * The API key stays server-side in MAGIC_HOUR_API_KEY.
 *
 * Provider swap rule:
 * The rest of VideaAI talks only to VideoProvider.
 * To replace Magic Hour later, replace this provider implementation.
 */

import type { AspectRatio } from "@/lib/types";

export type JobStatus = "queued" | "processing" | "completed" | "failed";

export type ClipSeconds = 4 | 6 | 8;

export interface ClipRequest {
  prompt: string;
  seconds: ClipSeconds;
  aspectRatio: AspectRatio;
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

const MAGIC_HOUR_BASE_URL = "https://api.magichour.ai/v1";

const MAGIC_HOUR_MODEL = "default";

function getApiKey(): string {
  const key = process.env["MAGIC_HOUR_API_KEY"];

  if (!key) {
    throw new VideoProviderError(
      "Video generation is not configured. Add MAGIC_HOUR_API_KEY to the server environment.",
      500,
    );
  }

  return key;
}

function providerErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

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

async function magicHourRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${MAGIC_HOUR_BASE_URL}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      authorization: `Bearer ${getApiKey()}`,
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
    const message =
      typeof data === "object" &&
      data !== null &&
      "error" in data &&
      typeof (data as { error?: unknown }).error === "object"
        ? JSON.stringify((data as { error: unknown }).error)
        : typeof data === "object" &&
            data !== null &&
            "message" in data &&
            typeof (data as { message?: unknown }).message === "string"
          ? String((data as { message: string }).message)
          : text || `Magic Hour request failed (${response.status}).`;

    throw new VideoProviderError(message, response.status);
  }

  return data as T;
}

type MagicHourCreateResponse = {
  id?: string;
  credits_charged?: number;
  estimated_frame_cost?: number;
};

type MagicHourProjectResponse = {
  id?: string;
  status?: string;
  progress?: number;
  error?: {
    code?: string;
    message?: string;
  } | null;
  downloads?: Array<{
    url?: string;
    expires_at?: string;
  }>;
  download?: {
    url?: string;
    expires_at?: string;
  };
};

function mapMagicHourStatus(
  status: string | undefined,
): JobStatus {
  const normalized = String(status ?? "").toLowerCase();

  if (
    normalized === "complete" ||
    normalized === "completed" ||
    normalized === "success"
  ) {
    return "completed";
  }

  if (
    normalized === "error" ||
    normalized === "failed" ||
    normalized === "cancelled" ||
    normalized === "canceled"
  ) {
    return "failed";
  }

  if (
    normalized === "processing" ||
    normalized === "running" ||
    normalized === "started"
  ) {
    return "processing";
  }

  return "queued";
}

const magicHourProvider: VideoProvider = {
  name: "magic-hour",
  model: MAGIC_HOUR_MODEL,

  supportedClipSeconds: [4, 6, 8],

  supportsImageReference: false,

  sizeFor(aspectRatio) {
    if (aspectRatio === "9:16") {
      return {
        size: "480x854",
        width: 480,
        height: 854,
      };
    }

    return {
      size: "854x480",
      width: 854,
      height: 480,
    };
  },

  async createClip(input) {
    try {
      const orientation =
        input.aspectRatio === "9:16"
          ? "portrait"
          : "landscape";

      const result =
        await magicHourRequest<MagicHourCreateResponse>(
          "/text-to-video",
          {
            method: "POST",
            body: JSON.stringify({
              name: "VideaAI Scene",
              end_seconds: input.seconds,
              orientation,
              model: MAGIC_HOUR_MODEL,
              resolution: "480p",
              style: {
                prompt: input.prompt.slice(0, 2000),
              },
            }),
          },
        );

      if (!result.id) {
        throw new VideoProviderError(
          "Magic Hour accepted the request but did not return a project ID.",
          502,
        );
      }

      return {
        id: result.id,
        status: "queued",
        progress: 0,
        error: null,
      };
    } catch (error) {
      if (error instanceof VideoProviderError) {
        throw error;
      }

      throw new VideoProviderError(
        providerErrorMessage(error),
        502,
      );
    }
  },

  async getClip(clipJobId) {
    try {
      const result =
        await magicHourRequest<MagicHourProjectResponse>(
          `/video-projects/${encodeURIComponent(clipJobId)}`,
        );

      const status = mapMagicHourStatus(result.status);

      if (status === "completed") {
        return {
          id: clipJobId,
          status: "completed",
          progress: 100,
          error: null,
        };
      }

      if (status === "failed") {
        return {
          id: clipJobId,
          status: "failed",
          progress: 0,
          error:
            result.error?.message ??
            `Magic Hour returned status "${result.status ?? "unknown"}".`,
        };
      }

      const progress =
        typeof result.progress === "number"
          ? Math.max(0, Math.min(99, result.progress))
          : status === "processing"
            ? 50
            : 5;

      return {
        id: clipJobId,
        status,
        progress,
        error: null,
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
      const result =
        await magicHourRequest<MagicHourProjectResponse>(
          `/video-projects/${encodeURIComponent(clipJobId)}`,
        );

      const videoUrl =
        result.downloads?.[0]?.url ??
        result.download?.url;

      if (!videoUrl) {
        throw new VideoProviderError(
          "Magic Hour completed the project but did not return a video download URL.",
          502,
        );
      }

      const response = await fetch(videoUrl);

      if (!response.ok) {
        throw new VideoProviderError(
          `Could not download the generated video (${response.status}).`,
          response.status,
        );
      }

      return new Uint8Array(
        await response.arrayBuffer(),
      );
    } catch (error) {
      if (error instanceof VideoProviderError) {
        throw error;
      }

      throw new VideoProviderError(
        providerErrorMessage(error),
        502,
      );
    }
  },
};

/**
 * SIM SLOT:
 *
 * Everything outside this provider calls getVideoProvider().
 *
 * Later, replacing Magic Hour with Google/Runway/etc.
 * means replacing this provider implementation and
 * returning the new provider here.
 */
export function getVideoProvider(): VideoProvider {
  return magicHourProvider;
}