import os
import subprocess
from pathlib import Path
from urllib.parse import quote

import requests
import runpod


MODEL_ID = os.environ.get("MODEL_ID", "Wan-AI/Wan2.2-TI2V-5B")
HF_CACHE_ROOTS = [
    os.environ.get("HF_CACHE_ROOT", "/runpod-volume/huggingface-cache/hub"),
    "/workspace/huggingface-cache/hub",
    "/root/.cache/huggingface/hub",
]
WAN_REPO = "/wan"
OUTPUT_BUCKET = os.environ.get("SUPABASE_STORAGE_BUCKET", "generated-videos")

# RunPod cached models are mounted here. Do not silently download multi-GB
# weights during a paid inference request.
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"
os.environ["TOKENIZERS_PARALLELISM"] = "false"
os.environ["PYTHONUNBUFFERED"] = "1"
os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"


def resolve_cached_model(model_id: str) -> str:
    explicit_path = os.environ.get("WAN_MODEL_PATH", "").strip()
    if explicit_path:
        if not os.path.isdir(explicit_path):
            raise RuntimeError(f"WAN_MODEL_PATH does not exist: {explicit_path}")
        return explicit_path

    if "/" not in model_id:
        raise ValueError(f"Invalid MODEL_ID: {model_id}")

    org, name = model_id.split("/", 1)
    for cache_root in HF_CACHE_ROOTS:
        model_root = os.path.join(cache_root, f"models--{org}--{name}")
        refs_main = os.path.join(model_root, "refs", "main")
        snapshots_dir = os.path.join(model_root, "snapshots")

        if os.path.isfile(refs_main):
            snapshot_hash = Path(refs_main).read_text(encoding="utf-8").strip()
            candidate = os.path.join(snapshots_dir, snapshot_hash)
            if os.path.isdir(candidate):
                return candidate

        versions = []
        if os.path.isdir(snapshots_dir):
            versions = [
                entry
                for entry in os.listdir(snapshots_dir)
                if os.path.isdir(os.path.join(snapshots_dir, entry))
            ]

        if versions:
            versions.sort()
            return os.path.join(snapshots_dir, versions[-1])

    raise RuntimeError(
        f"Cached model {model_id} was not found. Configure the RunPod endpoint "
        "to mount/cache the exact Hugging Face model, or set WAN_MODEL_PATH. "
        "The worker will not download multi-GB weights during a paid request."
    )


def frame_count_for_seconds(seconds: int) -> int:
    # Wan requires 4n+1 frames. The official TI2V-5B config uses 121 frames
    # for its standard ~5-second 24fps clip.
    mapping = {4: 97, 5: 121, 6: 145, 8: 193}
    try:
        return mapping[int(seconds)]
    except (KeyError, ValueError):
        raise ValueError("seconds must be 4, 5, 6, or 8")


def size_for_aspect(aspect_ratio: str) -> tuple[str, bool]:
    if aspect_ratio == "9:16":
        return "704*1280", False
    if aspect_ratio == "16:9":
        return "1280*704", False
    if aspect_ratio == "1:1":
        # TI2V-5B only supports 704x1280 and 1280x704 natively. Generate
        # portrait, then center-crop to a square.
        return "704*1280", True
    raise ValueError("aspect_ratio must be 9:16, 16:9, or 1:1")


def upload_to_supabase(local_path: str, storage_path: str) -> None:
    supabase_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

    if not supabase_url or not service_key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured on the RunPod endpoint."
        )

    if not storage_path.startswith("renders/") or ".." in storage_path:
        raise ValueError("Invalid storage_path")

    encoded_path = "/".join(quote(part, safe="") for part in storage_path.split("/"))
    url = f"{supabase_url}/storage/v1/object/{OUTPUT_BUCKET}/{encoded_path}"

    with open(local_path, "rb") as video_file:
        response = requests.post(
            url,
            headers={
                "authorization": f"Bearer {service_key}",
                "apikey": service_key,
                "content-type": "video/mp4",
                "x-upsert": "true",
                "cache-control": "3600",
            },
            data=video_file,
            timeout=300,
        )

    if not response.ok:
        raise RuntimeError(
            f"Supabase Storage upload failed ({response.status_code}): {response.text[:500]}"
        )


def generate_video(prompt: str, seconds: int, aspect_ratio: str, storage_path: str, seed=None) -> dict:
    model_dir = resolve_cached_model(MODEL_ID)
    size, needs_square_crop = size_for_aspect(aspect_ratio)
    frame_num = frame_count_for_seconds(seconds)

    raw_path = f"/tmp/videaai_raw_{os.getpid()}.mp4"
    final_path = f"/tmp/videaai_final_{os.getpid()}.mp4"

    command = [
        "python3.10",
        f"{WAN_REPO}/generate.py",
        "--task",
        "ti2v-5B",
        "--size",
        size,
        "--ckpt_dir",
        model_dir,
        "--prompt",
        prompt,
        "--frame_num",
        str(frame_num),
        "--sample_solver",
        "unipc",
        "--sample_steps",
        os.environ.get("WAN_SAMPLE_STEPS", "30"),
        "--offload_model",
        "True",
        "--t5_cpu",
        "--convert_model_dtype",
        "--save_file",
        raw_path,
    ]

    if seed is not None:
        command.extend(["--base_seed", str(int(seed))])

    subprocess.run(command, cwd=WAN_REPO, env=os.environ.copy(), check=True)

    if not os.path.exists(raw_path):
        raise RuntimeError("Wan completed but did not create an MP4.")

    try:
        if needs_square_crop:
            crop_command = [
                "ffmpeg",
                "-y",
                "-i",
                raw_path,
                "-vf",
                "crop=704:704:0:288",
                "-c:v",
                "libx264",
                "-preset",
                "veryfast",
                "-crf",
                "18",
                "-an",
                final_path,
            ]
            subprocess.run(crop_command, check=True, capture_output=True, text=True)
        else:
            os.replace(raw_path, final_path)

        if not os.path.exists(final_path):
            raise RuntimeError("Wan completed but the final MP4 was not created.")

        upload_to_supabase(final_path, storage_path)

        return {
            "status": "completed",
            "storage_path": storage_path,
            "fps": 24,
            "frames": frame_num,
            "aspect_ratio": aspect_ratio,
            "model": MODEL_ID,
        }
    finally:
        for path in (raw_path, final_path):
            try:
                os.remove(path)
            except FileNotFoundError:
                pass


def handler(job):
    job_input = job.get("input", {}) or {}

    prompt = str(job_input.get("prompt", "")).strip()
    aspect_ratio = str(job_input.get("aspect_ratio", "9:16"))
    storage_path = str(job_input.get("storage_path", "")).strip()

    try:
        seconds = int(job_input.get("seconds", 8))
    except (TypeError, ValueError):
        seconds = 0

    seed = job_input.get("seed")

    if not prompt:
        return {"status": "failed", "error": "Prompt is required."}
    if seconds not in (4, 5, 6, 8):
        return {"status": "failed", "error": "seconds must be 4, 5, 6, or 8."}
    if aspect_ratio not in ("9:16", "16:9", "1:1"):
        return {
            "status": "failed",
            "error": "aspect_ratio must be 9:16, 16:9, or 1:1.",
        }
    if not storage_path.startswith("renders/") or ".." in storage_path:
        return {"status": "failed", "error": "Invalid storage_path."}

    # The model output is written to Supabase Storage rather than returned as
    # base64. RunPod /run payloads are limited to 10 MB, which is too small to
    # safely carry generated 720p MP4 files.
    try:
        return generate_video(
            prompt=prompt,
            seconds=seconds,
            aspect_ratio=aspect_ratio,
            storage_path=storage_path,
            seed=seed,
        )
    except Exception as exc:
        return {"status": "failed", "error": str(exc)}


runpod.serverless.start({"handler": handler})
