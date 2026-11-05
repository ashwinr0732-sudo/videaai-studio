import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { creditCost, SCENE_PLAN } from "@/lib/types";

const bodySchema = z.object({
  prompt: z.string().trim().min(8, "Prompt must be at least 8 characters.").max(2000),
  duration: z.union([z.literal(8), z.literal(15), z.literal(30)]),
  aspectRatio: z.enum(["9:16", "16:9", "1:1"]),
  style: z.enum(["Cinematic", "Realistic", "Anime", "3D", "Animation"]),
  projectId: z.string().min(1),
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
        // Identity comes from the verified Supabase access token only — never
        // from a client-supplied user id.
        const { verifyBearer } = await import("@/lib/auth.server");
        const caller = await verifyBearer(request);
        if (!caller) return json({ error: "You must be signed in to generate videos." }, 401);

        const parsed = bodySchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
          return json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, 400);
        }
        const input = parsed.data;

        const cost = creditCost(input.duration);
        const { getBalance, spendCredits, InsufficientCreditsError } = await import(
          "@/lib/credits.server"
        );
        const { createJob, abandonJob } = await import("@/lib/video/jobs.server");
        const { getVideoProvider } = await import("@/lib/video/provider.server");

        // Fast pre-check for a friendly error; the authoritative, race-safe
        // check happens inside spend_credits below.
        try {
          if ((await getBalance(caller.userId)) < cost) {
            return json({ error: `Not enough credits. This render costs ${cost}.` }, 402);
          }
        } catch (error) {
          console.error(error);
          return json({ error: "Could not read your credit balance." }, 502);
        }

        let job: { id: string; sceneCount: number } | null = null;
        try {
          job = await createJob({
            userRef: caller.userId,
            projectRef: input.projectId,
            prompt: input.prompt,
            duration: input.duration,
            aspectRatio: input.aspectRatio,
            style: input.style,
            credits: cost,
          });
          // Debit atomically, keyed on the job id so retries cannot double-spend.
          await spendCredits(caller.userId, cost, job.id);
          return json({
            generationId: job.id,
            projectId: input.projectId,
            status: "queued",
            provider: getVideoProvider().name,
            sceneCount: job.sceneCount,
            scenePlan: SCENE_PLAN[input.duration],
          });
        } catch (error) {
          if (job) await abandonJob(job.id, "Credits could not be reserved.").catch(() => {});
          if (error instanceof InsufficientCreditsError) return json({ error: error.message }, 402);
          console.error(error);
          return json({ error: "Video generation failed to start." }, 502);
        }
      },
    },
  },
});
