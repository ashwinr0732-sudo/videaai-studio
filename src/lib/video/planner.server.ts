/**
 * Scene planning layer.
 *
 * Before any clip is generated, the user's original prompt is expanded by a text
 * model into (a) a shared "visual continuity bible" and (b) one self-contained
 * prompt per scene. Every scene prompt must restate subject, character
 * appearance, environment, visual style, camera direction, lighting and key
 * objects, so the clips look like one continuous piece instead of four unrelated
 * shots — and so no clip is ever a repeat of another.
 *
 * Server-only: the gateway key is read from the environment inside the call.
 */

import type { AspectRatio, VideoStyle } from "@/lib/types";
import type { ClipSeconds } from "./provider.server";

const CHAT_ENDPOINT = "https://ai.gateway.lovable.dev/v1/chat/completions";
const PLANNER_MODEL = "google/gemini-2.5-flash";

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
  /** Clip lengths to plan for, in order. */
  sceneSeconds: readonly ClipSeconds[];
}

const SYSTEM = `You are a film pre-production planner for an AI video pipeline.
You split one prompt into sequential scenes that read as ONE continuous shot sequence.

Rules:
- Produce exactly the number of scenes requested, in order, each matching its given length.
- Scenes must advance the action. Never repeat a scene, never describe the same beat twice.
- Every scene prompt must be fully self-contained (the generator sees only that prompt) and must
  explicitly restate: main subject, character appearance and wardrobe, environment/location,
  visual style, camera direction and movement, lighting, and important objects.
- Every scene after the first must open on continuity with the previous scene: state where the
  previous scene ended and that the opening framing matches its closing framing.
- Write in English, present tense, 60-120 words per scene prompt. No shot numbers, no dialogue
  markup, no text overlays, no camera brand names.
- The continuity bible is a compact reference sheet (subject, appearance, wardrobe, environment,
  palette, lighting, lens/camera language, key objects, mood) reused across all scenes.

Respond with JSON only:
{"continuityBible":"...","scenes":[{"index":1,"title":"...","prompt":"..."}]}`;

function apiKey() {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new PlannerError("Scene planning is not configured.", 500);
  return key;
}

/** Split the original prompt into coherent, continuity-preserving scenes. */
export async function planScenes(input: PlanInput): Promise<ScenePlan> {
  const total = input.sceneSeconds.reduce((a, b) => a + b, 0);
  const brief = input.sceneSeconds
    .map((seconds, i) => `Scene ${i + 1}: ${seconds} seconds`)
    .join("\n");

  const user = `Original prompt (must be honoured exactly):
"""${input.prompt.trim()}"""

Visual style: ${input.style}
Framing / aspect ratio: ${input.aspectRatio}
Number of scenes: ${input.sceneSeconds.length}
Total runtime: ${total} seconds
Scene lengths:
${brief}

Plan the continuity bible and one prompt per scene.`;

  const res = await fetch(CHAT_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: PLANNER_MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new PlannerError(
      body?.message ?? `Scene planning failed (${res.status}).`,
      res.status,
    );
  }

  const payload = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new PlannerError("Scene planning returned no plan.", 502);

  let parsed: { continuityBible?: unknown; scenes?: { title?: unknown; prompt?: unknown }[] };
  try {
    parsed = JSON.parse(content.replace(/^```(?:json)?|```$/g, "").trim());
  } catch {
    throw new PlannerError("Scene planning returned an unreadable plan.", 502);
  }

  // Models sometimes answer with a structured object instead of a string;
  // flatten it into a readable reference sheet rather than failing the render.
  const asText = (value: unknown): string => {
    if (typeof value === "string") return value.trim();
    if (Array.isArray(value)) return value.map(asText).filter(Boolean).join("; ");
    if (value && typeof value === "object") {
      return Object.entries(value as Record<string, unknown>)
        .map(([k, v]) => `${k}: ${asText(v)}`)
        .filter(Boolean)
        .join("\n");
    }
    return value == null ? "" : String(value);
  };

  const bible = asText(parsed.continuityBible);
  const raw = parsed.scenes ?? [];
  if (!bible || raw.length < input.sceneSeconds.length) {
    throw new PlannerError("Scene planning returned an incomplete plan.", 502);
  }

  const scenes: PlannedScene[] = input.sceneSeconds.map((seconds, i) => {
    const scene = raw[i]!;
    const text = asText(scene.prompt);

    if (text.length < 40) {
      throw new PlannerError(`Scene ${i + 1} was planned without a usable prompt.`, 502);
    }
    return {
      index: i + 1,
      seconds,
      title: (scene.title ?? `Scene ${i + 1}`).trim().slice(0, 80),
      prompt: text,
    };
  });

  return { continuityBible: bible, scenes };
}

/**
 * Final prompt handed to the video model for one scene: the original prompt, the
 * shared continuity bible and the scene beat, so continuity survives even though
 * each clip is generated by an independent provider job.
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
    `${args.scene.prompt}`,
    ``,
    `ORIGINAL BRIEF (must remain true): ${args.originalPrompt.trim()}`,
    ``,
    `VISUAL CONTINUITY BIBLE (identical across all scenes — do not redesign anything):`,
    args.continuityBible,
    ``,
    `SHOT ${args.scene.index} OF ${args.sceneCount}. Visual style: ${args.style}. Framing: ${args.aspectRatio}. Keep the same subject, wardrobe, environment, colour palette, lighting and lens character as the bible.`,
  ];
  if (args.previousScene) {
    lines.push(
      `CONTINUITY: this shot continues directly from "${args.previousScene.title}" — open on framing, lighting and subject position that match how that shot ended, then continue the action without resetting the scene.`,
    );
  }
  return lines.join("\n");
}
