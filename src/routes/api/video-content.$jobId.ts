import { createFileRoute } from "@tanstack/react-router";

/**
 * Streams the stitched, verified MP4 from the app's private storage bucket.
 * The provider URL and API key never reach the browser.
 *
 * A `<video>` element cannot send an Authorization header, so access is granted
 * either by a bearer token (fetch) or by a short-lived HMAC token that the
 * server itself minted for this job + owner. A raw user id is never accepted.
 */
export const Route = createFileRoute("/api/video-content/$jobId")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const url = new URL(request.url);
        const download = url.searchParams.has("download");

        const { verifyBearer } = await import("@/lib/auth.server");
        const { verifyMediaToken } = await import("@/lib/video/media-token.server");

        const caller = await verifyBearer(request);
        const userId =
          caller?.userId ?? (await verifyMediaToken(params.jobId, url.searchParams.get("t")));
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
              "cache-control": "private, no-store",
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
