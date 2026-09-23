# VideaAI RunPod Wan 2.2 worker

This worker runs **Wan2.2 TI2V-5B** on RunPod Serverless and writes each generated MP4 directly to VideaAI's private Supabase Storage bucket.

## Model

Use the exact Hugging Face model:

`Wan-AI/Wan2.2-TI2V-5B`

The worker is intentionally offline during inference: it will **not download multi-GB model weights during a paid request**. Configure the RunPod endpoint's model/cache or set `WAN_MODEL_PATH` to an already-mounted model directory.

Wan's standard TI2V-5B configuration is 121 frames at 24 fps, approximately 5 seconds, at 1280x704 or 704x1280. Longer VideaAI products are composed from multiple 5-second clips and stitched by the existing server-side MP4 pipeline.

## RunPod endpoint environment

Required:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional:

- `MODEL_ID` (default: `Wan-AI/Wan2.2-TI2V-5B`)
- `WAN_MODEL_PATH` (explicit mounted model directory; avoids cache-path assumptions)
- `HF_CACHE_ROOT` (override Hugging Face cache root)
- `WAN_SAMPLE_STEPS` (default: `30`; raise to `50` for the official default quality/step setting)

## VideaAI server environment

Required:

- `RUNPOD_API_KEY`
- `RUNPOD_ENDPOINT_ID`
- existing Supabase server variables

The browser never receives any of these secrets.
