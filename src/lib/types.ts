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
/**
 * Durations the product offers. The video model can only render 4/6/8-second
 * clips, so anything above 8s is composed from several planned scenes that are
 * stitched server-side (see SCENE_PLAN).
 */
export type DurationSeconds = 8 | 15 | 30;

/**
 * Scene breakdown per requested duration, in provider-supported clip lengths.
 * 8s  -> a single clip (unchanged single-clip behaviour).
 * 15s -> 8 + 6 = 14s. The model has no 7-second clip, so 14s is the closest
 *        achievable total; the UI always shows the verified actual duration.
 * 30s -> 8 + 8 + 8 + 6 = exactly 30s.
 */
export const SCENE_PLAN: Record<DurationSeconds, readonly (4 | 6 | 8)[]> = {
  8: [8],
  15: [8, 6],
  30: [8, 8, 8, 6],
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
 * One credit per generated clip. Legacy 5s/10s keys are kept so projects created
 * before the multi-scene workflow still price and refund correctly.
 */
export const CREDIT_COST: Record<number, number> = {
  8: 1,
  15: 2,
  30: 4,
  5: 1,
  10: 2,
};
