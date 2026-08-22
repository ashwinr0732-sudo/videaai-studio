import { createFileRoute } from "@tanstack/react-router";

/**
 * Poll endpoint. Every call advances the render state machine by one step
 * (plan -> generate scene N -> store original -> stitch -> verify -> complete),
 * so the long-running work never blocks a single request.
 */
export const Route = createFileRoute("/api/video-status/$jobId")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const userId = request.headers.get("x-videaai-user");
        if (!userId) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }
        const { advanceJob } = await import("@/lib/video/jobs.server");
        try {
          const state = await advanceJob(params.jobId, userId);
          if (!state) {
            return new Response(JSON.stringify({ error: "Render not found." }), {
              status: 404,
              headers: { "content-type": "application/json" },
            });
          }
          return Response.json(state);
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
