import base64
import os
import tempfile

import imageio.v3 as iio
import runpod
import torch
from diffusers import DiffusionPipeline


MODEL_ID = "Wan-AI/Wan2.2-TI2V-5B-Diffusers"

pipe = None


def load_model():
    global pipe

    if pipe is None:
        pipe = DiffusionPipeline.from_pretrained(
            MODEL_ID,
            torch_dtype=torch.bfloat16,
            device_map="cuda",
        )

    return pipe


def handler(job):
    job_input = job.get("input", {})

    prompt = job_input.get("prompt", "").strip()
    aspect_ratio = job_input.get("aspect_ratio", "9:16")
    duration = max(8, int(job_input.get("duration", 8)))

    if not prompt:
        raise ValueError("Prompt is required.")

    model = load_model()

    if aspect_ratio == "16:9":
        width, height = 1280, 704
    else:
        width, height = 704, 1280

    fps = 24
    frames = duration * fps + 1

    result = model(
        prompt=prompt,
        width=width,
        height=height,
        num_frames=frames,
        num_inference_steps=30,
    )

    video = result.frames[0]

    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
        output_path = f.name

    try:
        iio.imwrite(
            output_path,
            video,
            fps=fps,
            codec="libx264",
        )

        with open(output_path, "rb") as f:
            video_bytes = f.read()

        return {
            "status": "completed",
            "duration": duration,
            "width": width,
            "height": height,
            "fps": fps,
            "video_base64": base64.b64encode(video_bytes).decode("utf-8"),
        }

    finally:
        if os.path.exists(output_path):
            os.remove(output_path)


runpod.serverless.start({"handler": handler})