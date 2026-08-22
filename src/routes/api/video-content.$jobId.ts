import { createFileRoute } from "@tanstack/react-router";

/**
 * Streams the stitched, verified MP4 from the app's private storage bucket.
 * The provider URL and API key never reach the browser, and the file keeps
 * working after the provider's ~48h expiry window.
 */
export const Route = createFileRoute("/api/video-content/$jobId")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const url = new URL(request.url);
        const download = url.searchParams.has("download");
        const userId = request.headers.get("x-videaai-user") ?? url.searchParams.get("u");
        if (!userId) return new Response("Unauthorized", { status: 401 });

        const { finalVideoBytes } = await import("@/lib/video/jobs.server");
        try {
          const result = await finalVideoBytes(params.jobId, userId);
          if (!result) return new Response("Video is not available.", { status: 404 });
          return new Response(result.bytes as unknown as BodyInit, {
            status: 200,
            headers: {
              "content-type": "video/mp4",
              "content-length": String(result.bytes.byteLength),
              "cache-control": "private, max-age=600",
              "accept-ranges": "none",
              "content-disposition": `${download ? "attachment" : "inline"}; filename="videaai-${params.jobId}.mp4"`,
            },
          });
        } catch (error) {
          console.error(error);
          return new Response("Video is no longer available.", { status: 404 });
        }
      },
    },
  },
});
