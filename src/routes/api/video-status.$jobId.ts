import { createFileRoute } from "@tanstack/react-router";

/**
 * Poll endpoint. Every call advances the render state machine by one step
 * (plan -> generate scene N -> store original -> stitch -> verify -> complete),
 * so the long-running work never blocks a single request.
 *
 * The caller is identified from the verified Supabase access token; a job is
 * only readable by the user it belongs to.
 */
export const Route = createFileRoute("/api/video-status/$jobId")({
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
        const { advanceJob } = await import("@/lib/video/jobs.server");
        try {
          const state = await advanceJob(params.jobId, caller.userId);
          if (!state) {
            return new Response(JSON.stringify({ error: "Render not found." }), {
              status: 404,
              headers: { "content-type": "application/json" },
            });
          }
          let mediaToken: string | null = null;
          if (state.videoUrl) {
            const { createMediaToken } = await import("@/lib/video/media-token.server");
            mediaToken = await createMediaToken(params.jobId, caller.userId);
          }
          return Response.json({ ...state, mediaToken });
        } catch (error) {
          console.error(error);
          return new Response(JSON.stringify({ error: "Could not read render status." }), {
            status: 502,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
