/**
 * Server-side scene planning layer.
 *
 * The video provider is responsible for the actual AI generation.
 * This planner intentionally does not depend on Lovable or another AI gateway.
 *
 * It creates a deterministic continuity plan from the user's original brief.
 * Wan receives the original brief plus a scene-specific direction for each clip.
 */

import type { AspectRatio, VideoStyle } from "@/lib/types";
import type { ClipSeconds } from "./provider.server";

export class PlannerError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "PlannerError";
  }
}

export interface PlannedScene {
  index: number;
  seconds: ClipSeconds;
  title: string;
  prompt: string;
}

export interface ScenePlan {
  continuityBible: string;
  scenes: PlannedScene[];
}

export interface PlanInput {
  prompt: string;
  style: VideoStyle;
  aspectRatio: AspectRatio;
  sceneSeconds: readonly ClipSeconds[];
}

/**
 * Creates a compact continuity description shared by every scene.
 */
function buildContinuityBible(input: PlanInput): string {
  return [
    `MAIN CREATIVE BRIEF: ${input.prompt.trim()}`,
    `VISUAL STYLE: ${input.style}`,
    `FRAMING: ${input.aspectRatio}`,
    `CONTINUITY RULE: Keep the same main subject, environment, visual identity, lighting language and overall cinematic treatment throughout the entire video.`,
  ].join("\n");
}

/**
 * Gives each scene a different role so multi-clip videos progress instead of
 * repeatedly showing the same moment.
 */
function sceneDirection(index: number, total: number): string {
  if (total === 1) {
    return [
      "Create the complete requested moment within this single clip.",
      "Establish the subject quickly, develop the main action naturally, and finish on a visually satisfying moment.",
    ].join(" ");
  }

  if (index === 1) {
    return [
      "OPENING / ESTABLISHING MOMENT.",
      "Introduce the main subject and environment immediately.",
      "Begin the requested action naturally and establish the visual language for the rest of the video.",
    ].join(" ");
  }

  if (index === total) {
    return [
      "FINAL / RESOLUTION MOMENT.",
      "Continue directly from the previous scene.",
      "Bring the requested action to a strong visual conclusion without resetting the environment or redesigning the subject.",
    ].join(" ");
  }

  if (index === 2) {
    return [
      "DEVELOPMENT MOMENT.",
      "Continue directly from the opening scene.",
      "Advance the main action significantly and introduce visible movement or progression.",
    ].join(" ");
  }

  return [
    "ESCALATION / PROGRESSION MOMENT.",
    "Continue directly from the previous scene.",
    "Advance the action further toward the final result while preserving visual continuity.",
  ].join(" ");
}

/**
 * Split the original prompt into coherent scene prompts without requiring
 * an external planning model.
 */
export async function planScenes(input: PlanInput): Promise<ScenePlan> {
  if (!input.prompt.trim()) {
    throw new PlannerError("A video prompt is required.", 400);
  }

  if (!input.sceneSeconds.length) {
    throw new PlannerError("No video scenes were requested.", 400);
  }

  const continuityBible = buildContinuityBible(input);

  const scenes: PlannedScene[] = input.sceneSeconds.map((seconds, i) => {
    const index = i + 1;
    const total = input.sceneSeconds.length;

    const prompt = [
      `Create scene ${index} of ${total} of one continuous AI-generated video.`,
      ``,
      `ORIGINAL REQUEST:`,
      input.prompt.trim(),
      ``,
      `VISUAL STYLE: ${input.style}`,
      `ASPECT RATIO: ${input.aspectRatio}`,
      `CLIP LENGTH: ${seconds} seconds`,
      ``,
      `SCENE DIRECTION:`,
      sceneDirection(index, total),
      ``,
      `CONTINUITY:`,
      `Keep the same subject identity, appearance, environment, wardrobe, important objects, lighting, colour palette, mood and visual style throughout the video.`,
      `Do not introduce unrelated subjects or locations.`,
      `Do not restart the story.`,
      `Do not add text overlays, subtitles, logos or watermarks.`,
      `Use natural cinematic camera movement appropriate to the action.`,
      ``,
      `This is an independent video clip that will be joined with the other clips, so make the ending visually compatible with the next scene.`,
    ].join("\n");

    const titles =
      total === 1
        ? "Main Scene"
        : index === 1
          ? "Opening"
          : index === total
            ? "Finale"
            : `Scene ${index}`;

    return {
      index,
      seconds,
      title: titles,
      prompt,
    };
  });

  return {
    continuityBible,
    scenes,
  };
}

/**
 * Final prompt handed to the video model for one scene.
 *
 * The original request and continuity bible are included every time because
 * each Wan clip is generated independently.
 */
export function buildScenePrompt(args: {
  originalPrompt: string;
  continuityBible: string;
  scene: PlannedScene;
  sceneCount: number;
  style: VideoStyle;
  aspectRatio: AspectRatio;
  previousScene: PlannedScene | null;
}) {
  const lines = [
    args.scene.prompt,
    ``,
    `ORIGINAL BRIEF (must remain true):`,
    args.originalPrompt.trim(),
    ``,
    `VISUAL CONTINUITY BIBLE:`,
    args.continuityBible,
    ``,
    `SCENE ${args.scene.index} OF ${args.sceneCount}`,
    `VISUAL STYLE: ${args.style}`,
    `FRAMING: ${args.aspectRatio}`,
    `Maintain the same subject, environment, wardrobe, important objects, lighting and visual identity across all scenes.`,
  ];

  if (args.previousScene) {
    lines.push(
      ``,
      `CONTINUITY FROM PREVIOUS SCENE:`,
      `Continue directly from the ending of "${args.previousScene.title}".`,
      `Do not reset the location, subject, wardrobe or visual style.`,
      `The opening of this clip should naturally follow the previous clip.`,
    );
  }

  return lines.join("\n");
}
