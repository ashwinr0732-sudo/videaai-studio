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
export type DurationSeconds = 5 | 10 | 30;

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

export const CREDIT_COST: Record<DurationSeconds, number> = {
  5: 1,
  10: 2,
  30: 5,
};
