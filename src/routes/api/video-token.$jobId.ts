import { createFileRoute } from "@tanstack/react-router";

/**
 * Mints a short-lived playback/download token for a finished render.
 * Requires a valid Supabase access token and ownership of the job.
 */
export const Route = createFileRoute("/api/video-token/$jobId")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const { verifyBearer } = await import("@/lib/auth.server");
        const caller = await verifyBearer(request);
        if (!caller) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }
        const { jobBelongsTo } = await import("@/lib/video/jobs.server");
        if (!(await jobBelongsTo(params.jobId, caller.userId))) {
          return new Response(JSON.stringify({ error: "Render not found." }), {
            status: 404,
            headers: { "content-type": "application/json" },
          });
        }
        const { createMediaToken } = await import("@/lib/video/media-token.server");
        return Response.json({ token: await createMediaToken(params.jobId, caller.userId) });
      },
    },
  },
});
