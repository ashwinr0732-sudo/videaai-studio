/**
 * Multi-scene render orchestrator (server-only).
 *
 * Runtime reality check: this app's server runs in a serverless Worker where
 * `child_process` is a non-functional stub, so the real `ffmpeg` / `ffprobe`
 * binaries cannot be executed. The equivalent work is therefore done in-process:
 *   - stitching  -> `concatMp4` in `mp4.server.ts` (stream copy, no re-encode)
 *   - probing    -> `probeMp4`  in `mp4.server.ts` (reads the produced bytes)
 * Persistent storage is Lovable Cloud storage (private bucket `generated-videos`),
 * because the provider deletes generated clips after ~48h.
 *
 * The job is a state machine advanced one step per status poll, so no single
 * request has to stay open for the several minutes a multi-scene render takes:
 *
 *   planning -> generating (scene 1..N, sequential) -> stitching -> verifying -> completed
 *                                                                             \-> failed
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { SCENE_PLAN, type AspectRatio, type DurationSeconds, type VideoStyle } from "@/lib/types";
import { concatMp4, Mp4Error, probeMp4, type Mp4Probe } from "./mp4.server";
import { buildScenePrompt, planScenes, PlannerError, type PlannedScene } from "./planner.server";
import { getVideoProvider, VideoProviderError, type ClipSeconds } from "./provider.server";

const BUCKET = "generated-videos";
/** Hard stop so a stuck provider job cannot spin forever. */
const JOB_TIMEOUT_MS = 90 * 60 * 1000;

export type JobPhase =
  "planning" | "generating" | "stitching" | "verifying" | "completed" | "failed";
export type JobStatus = "queued" | "processing" | "completed" | "failed";

export type SceneStatus = "pending" | "generating" | "stored" | "failed";

export interface SceneRecord {
  index: number;
  seconds: ClipSeconds;
  title: string;
  prompt: string;
  status: SceneStatus;
  clipJobId: string | null;
  storagePath: string | null;
  error: string | null;
}

export interface JobRow {
  id: string;
  user_ref: string;
  project_ref: string;
  prompt: string;
  requested_duration: number;
  aspect_ratio: AspectRatio;
  style: VideoStyle;
  status: JobStatus;
  phase: JobPhase;
  progress: number;
  continuity_bible: string | null;
  scenes: SceneRecord[];
  failed_scene: number | null;
  error_message: string | null;
  credits_spent: number;
  final_path: string | null;
  actual_duration_seconds: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  video_codec: string | null;
  audio_codec: string | null;
  size_bytes: number | null;
  created_at: string;
}

export interface PublicJobState {
  id: string;
  status: JobStatus;
  phase: JobPhase;
  progress: number;
  error: string | null;
  failedScene: number | null;
  videoUrl: string | null;
  sceneCount: number;
  scenesCompleted: number;
  scenes: { index: number; title: string; seconds: number; status: SceneStatus }[];
  requestedDuration: number;
  /** Verified from the stitched file, never the requested value. */
  actualDuration: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  videoCodec: string | null;
  /** Credits to refund locally when a render fails. */
  refundCredits: number;
}

function db() {
  return supabaseAdmin.from("video_jobs" as never);
}

async function loadJob(jobId: string): Promise<JobRow | null> {
  const { data } = await db().select("*").eq("id", jobId).maybeSingle();
  return (data as JobRow | null) ?? null;
}

async function patch(jobId: string, values: Record<string, unknown>) {
  await db()
    .update(values as never)
    .eq("id", jobId);
}

function overallProgress(job: JobRow, clipProgress = 0) {
  const total = job.scenes.length || 1;
  const done = job.scenes.filter((s) => s.status === "stored").length;
  if (job.phase === "planning") return 3;
  if (job.phase === "stitching") return 93;
  if (job.phase === "verifying") return 97;
  if (job.phase === "completed") return 100;
  return Math.min(90, Math.round(((done + clipProgress / 100) / total) * 88) + 4);
}

export function publicState(job: JobRow): PublicJobState {
  return {
    id: job.id,
    status: job.status,
    phase: job.phase,
    progress: job.progress,
    error: job.error_message,
    failedScene: job.failed_scene,
    videoUrl: job.final_path ? `/api/video-content/${job.id}` : null,
    sceneCount: job.scenes.length,
    scenesCompleted: job.scenes.filter((s) => s.status === "stored").length,
    scenes: job.scenes.map((s) => ({
      index: s.index,
      title: s.title,
      seconds: s.seconds,
      status: s.status,
    })),
    requestedDuration: job.requested_duration,
    actualDuration: job.actual_duration_seconds,
    width: job.width,
    height: job.height,
    fps: job.fps,
    videoCodec: job.video_codec,
    refundCredits: job.status === "failed" ? job.credits_spent : 0,
  };
}

async function failJob(job: JobRow, message: string, sceneIndex: number | null = null) {
  // Refunds are issued server-side and are idempotent per job id, so the
  // browser can never grant itself credits by replaying a failure.
  if (job.credits_spent > 0) {
    try {
      const { refundCredits } = await import("@/lib/credits.server");
      await refundCredits(job.user_ref, job.credits_spent, job.id);
    } catch (error) {
      console.error("[video job] refund failed", error);
    }
  }
  await patch(job.id, {
    status: "failed",
    phase: "failed",
    error_message: sceneIndex
      ? `Scene ${sceneIndex} of ${job.scenes.length || "?"}: ${message}`
      : message,
    failed_scene: sceneIndex,
    progress: job.progress,
  });
}

/** Create the job row. Scenes are planned on the first status poll. */
export async function createJob(input: {
  userRef: string;
  projectRef: string;
  prompt: string;
  duration: DurationSeconds;
  aspectRatio: AspectRatio;
  style: VideoStyle;
  credits: number;
}): Promise<{ id: string; sceneCount: number }> {
  const plan = SCENE_PLAN[input.duration];
  const { data, error } = await db()
    .insert({
      user_ref: input.userRef,
      project_ref: input.projectRef,
      prompt: input.prompt,
      requested_duration: input.duration,
      aspect_ratio: input.aspectRatio,
      style: input.style,
      status: "queued",
      phase: "planning",
      progress: 1,
      credits_spent: input.credits,
      scenes: plan.map((seconds, i) => ({
        index: i + 1,
        seconds,
        title: `Scene ${i + 1}`,
        prompt: "",
        status: "pending",
        clipJobId: null,
        storagePath: null,
        error: null,
      })),
    } as never)
    .select("id")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Could not create the render job.");
  return { id: (data as { id: string }).id, sceneCount: plan.length };
}

async function startScene(job: JobRow, index: number) {
  const provider = getVideoProvider();
  const scene = job.scenes[index - 1]!;
  const planned: PlannedScene = {
    index: scene.index,
    seconds: scene.seconds,
    title: scene.title,
    prompt: scene.prompt,
  };
  const previous = index > 1 ? job.scenes[index - 2]! : null;

  const storagePath = `renders/${job.id}/scene-${scene.index}.mp4`;

  const clip = await provider.createClip({
    prompt: buildScenePrompt({
      originalPrompt: job.prompt,
      continuityBible: job.continuity_bible ?? "",
      scene: planned,
      sceneCount: job.scenes.length,
      style: job.style,
      aspectRatio: job.aspect_ratio,
      previousScene: previous
        ? {
            index: previous.index,
            seconds: previous.seconds,
            title: previous.title,
            prompt: previous.prompt,
          }
        : null,
    }),
    seconds: scene.seconds,
    aspectRatio: job.aspect_ratio,
    storagePath,
  });

  const scenes = job.scenes.map((s) =>
    s.index === index ? { ...s, status: "generating" as SceneStatus, clipJobId: clip.id } : s,
  );
  await patch(job.id, {
    scenes,
    status: "processing",
    phase: "generating",
    progress: overallProgress({ ...job, scenes, phase: "generating" }),
  });
}

async function upload(path: string, bytes: Uint8Array) {
  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: "video/mp4", upsert: true });
  if (error) throw new Error(`Could not store the generated file: ${error.message}`);
}

async function download(path: string): Promise<Uint8Array> {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(path);
  if (error || !data) throw new Error(error?.message ?? `Missing stored file ${path}`);
  return new Uint8Array(await data.arrayBuffer());
}

/**
 * Advance the job by one step. Safe to call on every poll; each call performs at
 * most one provider request plus at most one storage step.
 */
export async function advanceJob(jobId: string, userRef: string): Promise<PublicJobState | null> {
  const job = await loadJob(jobId);
  if (!job || job.user_ref !== userRef) return null;
  if (job.status === "completed" || job.status === "failed") return publicState(job);

  if (Date.now() - new Date(job.created_at).getTime() > JOB_TIMEOUT_MS) {
    await failJob(job, "The render timed out before all scenes finished.");
    return publicState((await loadJob(jobId))!);
  }

  try {
    // 1) Plan the scenes before anything is generated.
    if (job.phase === "planning") {
      const plan = await planScenes({
        prompt: job.prompt,
        style: job.style,
        aspectRatio: job.aspect_ratio,
        sceneSeconds: job.scenes.map((s) => s.seconds),
      });
      const scenes: SceneRecord[] = job.scenes.map((s, i) => ({
        ...s,
        title: plan.scenes[i]!.title,
        prompt: plan.scenes[i]!.prompt,
      }));
      await patch(job.id, {
        scenes,
        continuity_bible: plan.continuityBible,
        status: "processing",
        phase: "generating",
        progress: 6,
      });
      await startScene({ ...job, scenes, continuity_bible: plan.continuityBible }, 1);
      return publicState((await loadJob(jobId))!);
    }

    // 2) Generate scenes one at a time.
    if (job.phase === "generating") {
      const current = job.scenes.find((s) => s.status === "generating");
      if (!current) {
        const next = job.scenes.find((s) => s.status === "pending");
        if (next) await startScene(job, next.index);
        else await patch(job.id, { phase: "stitching", progress: 93 });
        return publicState((await loadJob(jobId))!);
      }

      const clip = await getVideoProvider().getClip(current.clipJobId!);

      if (clip.status === "failed") {
        await failJob(
          job,
          clip.error ?? "the provider could not generate this scene.",
          current.index,
        );
        return publicState((await loadJob(jobId))!);
      }

      if (clip.status !== "completed") {
        await patch(job.id, { progress: overallProgress(job, clip.progress) });
        return publicState({ ...job, progress: overallProgress(job, clip.progress) });
      }

      // Completed: store the ORIGINAL provider MP4 (no preview, no re-encode).
      const bytes = await getVideoProvider().downloadClip(current.clipJobId!);
      probeMp4(bytes); // reject a truncated/unreadable download early
      const path = current.storagePath ?? `renders/${job.id}/scene-${current.index}.mp4`;
      await upload(path, bytes);

      const scenes = job.scenes.map((s) =>
        s.index === current.index
          ? { ...s, status: "stored" as SceneStatus, storagePath: path }
          : s,
      );
      const remaining = scenes.find((s) => s.status === "pending");
      if (remaining) {
        await patch(job.id, { scenes, progress: overallProgress({ ...job, scenes }) });
        await startScene({ ...job, scenes }, remaining.index);
      } else {
        await patch(job.id, { scenes, phase: "stitching", progress: 93 });
      }
      return publicState((await loadJob(jobId))!);
    }

    // 3) Stitch + 4) verify, then mark complete.
    if (job.phase === "stitching" || job.phase === "verifying") {
      const clips: Uint8Array[] = [];
      for (const scene of job.scenes) {
        if (!scene.storagePath) throw new Mp4Error(`Scene ${scene.index} was never stored.`);
        clips.push(await download(scene.storagePath));
      }

      let probe: Mp4Probe;
      let finalBytes: Uint8Array;
      if (clips.length === 1) {
        // Single-clip renders keep the untouched original file.
        finalBytes = clips[0]!;
        probe = probeMp4(finalBytes);
      } else {
        const stitched = concatMp4(clips);
        finalBytes = stitched.data;
        probe = stitched.probe;
      }

      const expected = job.scenes.reduce((sum, s) => sum + s.seconds, 0);
      const expectedSize = getVideoProvider().sizeFor(job.aspect_ratio);
      const problems: string[] = [];
      if (!(probe.durationSeconds > 0)) problems.push("the final file has no measurable duration");
      if (Math.abs(probe.durationSeconds - expected) > 1.5) {
        problems.push(
          `duration is ${probe.durationSeconds.toFixed(2)}s but ${expected}s of footage was generated`,
        );
      }
      if (probe.width !== expectedSize.width || probe.height !== expectedSize.height) {
        problems.push(`resolution is ${probe.width}x${probe.height}`);
      }
      if (!(probe.fps > 0)) problems.push("frame rate could not be read");
      if (!probe.videoCodec) problems.push("video codec could not be read");
      if (problems.length > 0) {
        await failJob(job, `verification failed — ${problems.join("; ")}.`);
        return publicState((await loadJob(jobId))!);
      }

      const finalPath = `renders/${job.id}/final.mp4`;
      await upload(finalPath, finalBytes);

      await patch(job.id, {
        status: "completed",
        phase: "completed",
        progress: 100,
        final_path: finalPath,
        actual_duration_seconds: probe.durationSeconds,
        width: probe.width,
        height: probe.height,
        fps: probe.fps,
        video_codec: probe.videoCodec,
        audio_codec: probe.audioCodec,
        size_bytes: probe.sizeBytes,
        error_message: null,
      });
      return publicState((await loadJob(jobId))!);
    }

    return publicState(job);
  } catch (error) {
    const sceneIndex = job.scenes.find((s) => s.status === "generating")?.index ?? null;
    if (error instanceof VideoProviderError || error instanceof PlannerError) {
      await failJob(job, error.message, error instanceof PlannerError ? null : sceneIndex);
    } else if (error instanceof Mp4Error) {
      await failJob(job, error.message);
    } else {
      console.error("[video job]", error);
      await failJob(
        job,
        error instanceof Error ? error.message : "an unexpected error stopped the render.",
        sceneIndex,
      );
    }
    return publicState((await loadJob(jobId))!);
  }
}

/** Mark a job dead before any work starts (e.g. credits could not be reserved). */
export async function abandonJob(jobId: string, message: string) {
  await patch(jobId, {
    status: "failed",
    phase: "failed",
    error_message: message,
    credits_spent: 0,
    progress: 0,
  });
}

/** Signed, time-limited URL for the stored final MP4. */
export async function finalVideoBytes(jobId: string, userRef: string) {
  const job = await loadJob(jobId);
  if (!job || job.user_ref !== userRef || !job.final_path) return null;
  return { bytes: await download(job.final_path), job };
}

/** Ownership check used before minting a playback token. */
export async function jobBelongsTo(jobId: string, userRef: string) {
  const job = await loadJob(jobId);
  return Boolean(job && job.user_ref === userRef && job.final_path);
}
