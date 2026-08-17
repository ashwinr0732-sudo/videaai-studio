import { createFileRoute } from "@tanstack/react-router";

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
        const { getVideoProvider, VideoProviderError } = await import("@/lib/video/provider.server");
        try {
          const job = await getVideoProvider().getJob(params.jobId);
          return Response.json(job);
        } catch (error) {
          const message =
            error instanceof VideoProviderError ? error.message : "Could not read job status.";
          return new Response(JSON.stringify({ error: message }), {
            status: 502,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
