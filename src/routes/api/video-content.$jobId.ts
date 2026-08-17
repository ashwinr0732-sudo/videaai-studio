import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/video-content/$jobId")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const download = new URL(request.url).searchParams.has("download");
        const { getVideoProvider, VideoProviderError } = await import("@/lib/video/provider.server");
        try {
          const upstream = await getVideoProvider().fetchContent(params.jobId);
          return new Response(upstream.body, {
            status: 200,
            headers: {
              "content-type": "video/mp4",
              "cache-control": "private, max-age=600",
              "content-disposition": `${download ? "attachment" : "inline"}; filename="videaai-${params.jobId}.mp4"`,
            },
          });
        } catch (error) {
          const message =
            error instanceof VideoProviderError ? error.message : "Video is no longer available.";
          return new Response(message, { status: 404 });
        }
      },
    },
  },
});
