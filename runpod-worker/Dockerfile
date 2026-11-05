FROM runpod/base:0.7.0-ubuntu2204-cuda1281

RUN apt-get update && apt-get install -y \
    git \
    wget \
    ffmpeg \
    libgl1-mesa-dev \
    libglib2.0-0 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

ENV HF_HUB_ENABLE_HF_TRANSFER=1
ENV PYTHONUNBUFFERED=1

RUN mkdir -p /app

RUN python3.10 -m pip install --upgrade pip && \
    pip install \
      torch==2.8.0+cu128 \
      torchvision==0.23.0+cu128 \
      --index-url https://download.pytorch.org/whl/cu128

RUN python3.10 -m pip install \
    https://github.com/Dao-AILab/flash-attention/releases/download/v2.8.3/flash_attn-2.8.3+cu12torch2.8cxx11abiFALSE-cp310-cp310-linux_x86_64.whl

COPY requirements.txt /tmp/requirements.txt

RUN python3.10 -m pip install -r /tmp/requirements.txt && \
    rm /tmp/requirements.txt

COPY ./handler.py /app/handler.py
COPY ./wan /wan

WORKDIR /app

CMD ["python3.10", "-u", "/app/handler.py"]
