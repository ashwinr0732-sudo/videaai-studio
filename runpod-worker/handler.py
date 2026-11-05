import base64
import os
import subprocess
import tempfile
import time

import runpod


WAN_REPO = "/wan"
MODEL_DIR = "/runpod-volume/models/Wan2.2-TI2V-5B"


def generate_video(prompt, aspect_ratio="9:16", seed=None):
    if aspect_ratio == "16:9":
        size = "1280*704"
    elif aspect_ratio == "1:1":
        size = "1024*704"
    else:
        size = "704*1280"

    # WAN TI2V-5B native generation is 121 frames at 24 FPS.
    frame_num = 121

    output_path = f"/tmp/videaai_{int(time.time())}.mp4"

    command = [
        "python3.10",
        f"{WAN_REPO}/generate.py",
        "--task",
        "ti2v-5B",
        "--size",
        size,
        "--ckpt_dir",
        MODEL_DIR,
        "--prompt",
        prompt,
        "--frame_num",
        str(frame_num),
        "--sample_solver",
        "unipc",
        "--sample_steps",
        "30",
        "--offload_model",
        "True",
        "--t5_cpu",
        "--convert_model_dtype",
        "--save_file",
        output_path,
    ]

    if seed is not None:
        command.extend(["--base_seed", str(seed)])

    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"
    env["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"
    env["TOKENIZERS_PARALLELISM"] = "false"

    subprocess.run(
        command,
        cwd=WAN_REPO,
        env=env,
        check=True,
    )

    if not os.path.exists(output_path):
        raise RuntimeError("WAN generation completed but no MP4 was created.")

    try:
        with open(output_path, "rb") as f:
            return base64.b64encode(f.read()).decode("utf-8")
    finally:
        os.remove(output_path)


def handler(job):
    job_input = job.get("input", {})

    prompt = str(job_input.get("prompt", "")).strip()
    aspect_ratio = job_input.get("aspect_ratio", "9:16")
    seed = job_input.get("seed")

    if not prompt:
        return {"error": "Prompt is required."}

    if aspect_ratio not in ("9:16", "16:9", "1:1"):
        return {"error": "aspect_ratio must be 9:16, 16:9, or 1:1"}

    try:
        video_base64 = generate_video(
            prompt=prompt,
            aspect_ratio=aspect_ratio,
            seed=seed,
        )

        return {
            "status": "completed",
            "video_base64": video_base64,
            "fps": 24,
            "frames": 121,
            "aspect_ratio": aspect_ratio,
            "model": "Wan2.2-TI2V-5B",
        }

    except Exception as e:
        return {
            "status": "failed",
            "error": str(e),
        }


runpod.serverless.start({"handler": handler})
