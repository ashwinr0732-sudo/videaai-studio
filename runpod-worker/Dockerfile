FROM runpod/base:0.7.0-ubuntu2204-cuda1281

ENV HF_HUB_ENABLE_HF_TRANSFER=1
ENV PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y \
    git wget ffmpeg libgl1-mesa-dev libglib2.0-0 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /app

# Install application dependencies first
COPY runpod-worker/requirements.txt /tmp/requirements.txt
RUN python3.10 -m pip install --upgrade pip && \
    python3.10 -m pip install -r /tmp/requirements.txt && \
    rm /tmp/requirements.txt

# Install the pinned PyTorch CUDA 12.8 stack last
RUN python3.10 -m pip install \
    torch==2.8.0+cu128 \
    torchvision==0.23.0+cu128 \
    torchaudio==2.8.0+cu128 \
    --index-url https://download.pytorch.org/whl/cu128

# Install matching FlashAttention wheel
RUN python3.10 -m pip install \
    https://github.com/Dao-AILab/flash-attention/releases/download/v2.8.3/flash_attn-2.8.3+cu12torch2.8cxx11abiFALSE-cp310-cp310-linux_x86_64.whl

# Verify imports and ABI during image build
RUN python3.10 -c "import torch, flash_attn; print('TORCH:', torch.__version__); print('CUDA:', torch.version.cuda); print('CXX11 ABI:', torch._C._GLIBCXX_USE_CXX11_ABI); print('FLASH ATTENTION:', flash_attn.__version__)"

COPY runpod-worker/handler.py /app/handler.py
COPY runpod-worker/wan /wan

WORKDIR /app

CMD ["python3.10", "-u", "/app/handler.py"]
