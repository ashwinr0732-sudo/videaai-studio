// Database-ready domain model.
// These shapes mirror the future SQL tables (users, projects, generations, credits)
// so swapping the local store for a real backend is a drop-in change.

export type UUID = string;

export interface User {
  id: UUID;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
}

export type ProjectStatus = "draft" | "queued" | "processing" | "ready" | "failed";

export type AspectRatio = "9:16" | "16:9" | "1:1";

export type VideoStyle = "Cinematic" | "Realistic" | "Anime" | "3D" | "Animation";

export type DurationSeconds = 10 | 15 | 30;

/**
 * Wan2.2 TI2V-5B is used as a fixed ~5-second clip generator.
 * Longer products are composed from those clips and stitched server-side.
 * The measured final duration is verified after stitching.
 */
export const SCENE_PLAN: Record<DurationSeconds, readonly 5[]> = {
  10: [5, 5],
  15: [5, 5, 5],
  30: [5, 5, 5, 5, 5, 5],
};

export interface Project {
  id: UUID;
  user_id: UUID;
  title: string;
  prompt: string;
  duration_seconds: DurationSeconds;
  aspect_ratio: AspectRatio;
  style: VideoStyle;
  status: ProjectStatus;
  thumbnail_url: string | null;
  video_url: string | null;

  /** Verified duration of the delivered file; null until a render is verified. */
  actual_duration_seconds: number | null;

  created_at: string;
  updated_at: string;
}

/** One attempt at rendering a project. A project can be regenerated many times. */
export interface Generation {
  id: UUID;
  project_id: UUID;
  user_id: UUID;
  status: ProjectStatus;
  provider: string | null;
  provider_job_id: string | null;
  credits_spent: number;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export type CreditReason = "signup_bonus" | "purchase" | "generation" | "refund";

/** Append-only credit ledger; balance = sum(amount). */
export interface CreditEntry {
  id: UUID;
  user_id: UUID;
  amount: number;
  reason: CreditReason;
  created_at: string;
}

/**
 * Credit cost for each requested product duration.
 *
 * 10s = 1 credit
 * 15s = 2 credits
 * 30s = 4 credits
 */
export const CREDIT_COST: Record<number, number> = {
  10: 1,
  15: 2,
  30: 4,
};

/** Credit price for a requested duration, with a safe fallback for legacy rows. */
export function creditCost(duration: number): number {
  return CREDIT_COST[duration] ?? Math.max(1, Math.ceil(duration / 10));
}
