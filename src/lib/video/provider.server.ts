/**
 * Server-side video provider abstraction.
 *
 * VideaAI uses fal.ai's Veo 3.1 Lite API for video generation.
 * The API key stays server-side in FAL_KEY.
 */

import { fal } from "@fal-ai/client";
import type { AspectRatio } from "@/lib/types";

export type JobStatus = "queued" | "processing" | "completed" | "failed";

/** Clip lengths supported by Veo 3.1 Lite. */
export type ClipSeconds = 4 | 6 | 8;

export interface ClipRequest {
  prompt: string;
  seconds: ClipSeconds;
  aspectRatio: AspectRatio;
  /**
   * Optional continuity input.
   *
   * The current VideaAI orchestrator does not send this yet, so text-to-video
   * is used for the MVP. Image-to-video can be added later without changing
   * the provider interface.
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

const FAL_MODEL = "fal-ai/veo3.1/lite";

function configureFal() {
  const key = process.env["FAL_KEY"];

  if (!key) {
    throw new VideoProviderError(
      "Video generation is not configured. Add FAL_KEY to the server environment.",
      500,
    );
  }

  // Explicitly configure the server-side client.
  fal.config({ credentials: key });
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

const falVeoProvider: VideoProvider = {
  name: "fal-veo",
  model: FAL_MODEL,

  supportedClipSeconds: [4, 6, 8],

  // Image-to-video support can be enabled later. The current orchestrator
  // generates scenes from text prompts.
  supportsImageReference: false,

  sizeFor(aspectRatio) {
    if (aspectRatio === "9:16") {
      return {
        size: "720x1280",
        width: 720,
        height: 1280,
      };
    }

    // Veo 3.1 Lite supports 16:9 and 9:16.
    // VideaAI's existing 1:1 option is safely mapped to landscape.
    return {
      size: "1280x720",
      width: 1280,
      height: 720,
    };
  },

  async createClip(input) {
    try {
      configureFal();

      const providerAspectRatio: "16:9" | "9:16" =
        input.aspectRatio === "9:16" ? "9:16" : "16:9";

      const { request_id } = await fal.queue.submit(FAL_MODEL, {
        input: {
          prompt: input.prompt,
          aspect_ratio: providerAspectRatio,
          duration: `${input.seconds}s`,
          resolution: "720p",
          generate_audio: true,
          auto_fix: true,
          safety_tolerance: "4",
        },
      });

      return {
        id: request_id,
        status: "queued",
        progress: 0,
        error: null,
      };
    } catch (error) {
      throw new VideoProviderError(
        providerErrorMessage(error),
        502,
      );
    }
  },

  async getClip(clipJobId) {
    try {
      configureFal();

      const status = await fal.queue.status(FAL_MODEL, {
        requestId: clipJobId,
      });

      const rawStatus = String(
        (status as { status?: unknown }).status ?? "",
      );

      if (rawStatus === "COMPLETED") {
        return {
          id: clipJobId,
          status: "completed",
          progress: 100,
          error: null,
        };
      }

      if (rawStatus === "IN_QUEUE") {
        return {
          id: clipJobId,
          status: "queued",
          progress: 5,
          error: null,
        };
      }

      if (rawStatus === "IN_PROGRESS") {
        return {
          id: clipJobId,
          status: "processing",
          progress: 50,
          error: null,
        };
      }

      return {
        id: clipJobId,
        status: "failed",
        progress: 0,
        error: `fal.ai returned status "${rawStatus || "unknown"}".`,
      };
    } catch (error) {
      const message = providerErrorMessage(error);

      return {
        id: clipJobId,
        status: "failed",
        progress: 0,
        error: message,
      };
    }
  },

  async downloadClip(clipJobId) {
    try {
      configureFal();

      const result = await fal.queue.result(FAL_MODEL, {
        requestId: clipJobId,
      });

      const data = result.data as {
        video?: {
          url?: string;
        };
      };

      const videoUrl = data.video?.url;

      if (!videoUrl) {
        throw new VideoProviderError(
          "fal.ai completed the job but did not return a video URL.",
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

      return new Uint8Array(await response.arrayBuffer());
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

export function getVideoProvider(): VideoProvider {
  return falVeoProvider;
}