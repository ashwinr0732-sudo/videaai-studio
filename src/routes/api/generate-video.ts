import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { creditCost, SCENE_PLAN } from "@/lib/types";

const bodySchema = z.object({
  prompt: z.string().trim().min(8, "Prompt must be at least 8 characters.").max(2000),
  duration: z.union([z.literal(8), z.literal(15), z.literal(30)]),
  aspectRatio: z.enum(["9:16", "16:9", "1:1"]),
  style: z.enum(["Cinematic", "Realistic", "Anime", "3D", "Animation"]),
  projectId: z.string().min(1),
  /** Credit balance available to the caller. Moves server-side with Cloud auth. */
  balance: z.number().int().nonnegative(),
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const Route = createFileRoute("/api/generate-video")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Auth boundary. The local auth adapter sends the signed-in user id;
        // this becomes a verified session lookup once Cloud auth is enabled.
        const userId = request.headers.get("x-videaai-user");
        if (!userId) return json({ error: "You must be signed in to generate videos." }, 401);

        const parsed = bodySchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
          return json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, 400);
        }
        const input = parsed.data;

        const cost = creditCost(input.duration);
        if (input.balance < cost) {
          return json({ error: `Not enough credits. This render costs ${cost}.` }, 402);
        }

        const { createJob } = await import("@/lib/video/jobs.server");
        const { getVideoProvider } = await import("@/lib/video/provider.server");
        try {
          // The row is created in a queued state; scene planning and the first
          // provider call happen on the first status poll so this request stays fast.
          const job = await createJob({
            userRef: userId,
            projectRef: input.projectId,
            prompt: input.prompt,
            duration: input.duration,
            aspectRatio: input.aspectRatio,
            style: input.style,
            credits: cost,
          });
          return json({
            generationId: job.id,
            projectId: input.projectId,
            status: "queued",
            provider: getVideoProvider().name,
            sceneCount: job.sceneCount,
            scenePlan: SCENE_PLAN[input.duration],
          });
        } catch (error) {
          console.error(error);
          return json({ error: "Video generation failed to start." }, 502);
        }
      },
    },
  },
});
