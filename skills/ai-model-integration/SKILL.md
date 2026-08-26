---
name: ai-model-integration
description: Patterns for integrating AI models — ONNX runtime in the browser and Node.js, LoRA training workflow (kohya_ss + ComfyUI on M5 Mac), and Higgsfield AI video generation API. Use when building LoRA style training pipelines, integrating inference into your app, or connecting to Higgsfield for video output.
origin: custom
---

# AI Model Integration

Browser-side and server-side ML inference, LoRA training pipelines, and Higgsfield AI video generation.

## When to Activate

- Integrating ONNX models into your browser viewer
- Building or modifying the LoRA style training pipeline
- Connecting to Higgsfield AI for video generation
- Running inference in Node.js API routes
- Managing model files on NAS or local storage

## ONNX in the Browser

```typescript
import * as ort from 'onnxruntime-web';

ort.env.wasm.wasmPaths = '/onnx/'; // Vite public dir

class OnnxSession {
  private session: ort.InferenceSession | null = null;

  async load(modelUrl: string) {
    this.session = await ort.InferenceSession.create(modelUrl, {
      executionProviders: ['webgl', 'wasm'], // WebGL GPU first, WASM fallback
      graphOptimizationLevel: 'all',
    });
  }

  async run(inputData: Float32Array, shape: number[]): Promise<Float32Array> {
    if (!this.session) throw new Error('Session not loaded');
    const tensor = new ort.Tensor('float32', inputData, shape);
    const feeds = { [this.session.inputNames[0]]: tensor };
    const out = await this.session.run(feeds);
    return out[this.session.outputNames[0]].data as Float32Array;
  }

  dispose() {
    this.session?.release();
    this.session = null;
  }
}
```

### Web Worker for Heavy Inference

```typescript
// workers/inference.worker.ts
import * as ort from 'onnxruntime-web';

let session: ort.InferenceSession | null = null;

self.onmessage = async ({ data }) => {
  if (data.type === 'load') {
    session = await ort.InferenceSession.create(data.url, { executionProviders: ['wasm'] });
    self.postMessage({ type: 'ready' });
  }
  if (data.type === 'infer' && session) {
    const tensor = new ort.Tensor('float32', data.input, data.shape);
    const result = await session.run({ [session.inputNames[0]]: tensor });
    const output = result[session.outputNames[0]].data as Float32Array;
    self.postMessage({ type: 'result', output }, [output.buffer]);
  }
};

// Main thread usage
const worker = new Worker(new URL('./inference.worker.ts', import.meta.url), { type: 'module' });
worker.postMessage({ type: 'load', url: '/models/cutter.onnx' });
```

## ONNX in Node.js (Express API)

```typescript
import * as ort from 'onnxruntime-node';
import path from 'path';

let session: ort.InferenceSession;

export async function initModel() {
  const modelPath = path.join(process.env.MODELS_DIR!, 'style_classifier.onnx');
  session = await ort.InferenceSession.create(modelPath, {
    executionProviders: ['cpu'],
  });
}

export async function classifyStyle(imageData: Float32Array): Promise<number[]> {
  const tensor = new ort.Tensor('float32', imageData, [1, 3, 224, 224]);
  const result = await session.run({ pixel_values: tensor });
  return Array.from(result.logits.data as Float32Array);
}
```

## LoRA Training Pipeline (M5 Mac)

### Workflow

```
Reference Images (NAS)
  → Preprocess + caption (resize to 1024x1024, write .txt captions)
  → Train LoRA with kohya_ss (MPS backend on M5 Mac)
  → Test in ComfyUI locally
  → Save .safetensors weights to NAS
  → Generate styled images → Higgsfield AI → Video → NAS
```

### kohya_ss Training Config

```toml
# config/lora_train.toml
[general]
enable_bucket = true
pretrained_model_name_or_path = "stabilityai/stable-diffusion-xl-base-1.0"
output_dir = "/Volumes/your-storage/lora_output"
output_name = "style_v1"

[datasets.[[subsets]]]
image_dir = "/Volumes/your-storage/training_images/cartoon_style"
caption_extension = ".txt"
num_repeats = 10

[network_args]
network_module = "networks.lora"
network_dim = 32
network_alpha = 16

[optimizer_args]
learning_rate = 1e-4
max_train_steps = 1500
save_every_n_steps = 500
```

```bash
# M5 Mac launch (MPS backend)
accelerate launch --num_cpu_threads_per_process=1 train_network.py \
  --config_file config/lora_train.toml \
  --mixed_precision bf16
```

### Image Preprocessing

```python
# scripts/prep_images.py
from PIL import Image
import os

SRC = "/Volumes/your-storage/reference_images/raw"
DST = "/Volumes/your-storage/training_images/cartoon_style"
TARGET_SIZE = (1024, 1024)

os.makedirs(DST, exist_ok=True)
for fname in os.listdir(SRC):
    if not fname.lower().endswith(('.jpg', '.png', '.webp')):
        continue
    img = Image.open(os.path.join(SRC, fname)).convert('RGB')
    img = img.resize(TARGET_SIZE, Image.LANCZOS)
    out = os.path.join(DST, fname.rsplit('.', 1)[0] + '.png')
    img.save(out, 'PNG')
    with open(out.replace('.png', '.txt'), 'w') as f:
        f.write("cartoon style illustration, flat colors, clean lines")
```

### NAS Storage Convention

```
/Volumes/your-storage/
├── reference_images/<style_name>/      # Originals — never delete
├── training_images/<style_name>/       # Preprocessed + captioned — regenerable
├── lora_output/<style_name>_v1.safetensors
└── video_output/<style_name>/          # Final Higgsfield outputs
```

Ephemeral files (ComfyUI cache, intermediate renders) stay local on Mac — not NAS.

## Higgsfield AI — Video Generation

```typescript
// lib/higgsfield.ts
const API = 'https://api.higgsfield.ai/v1';

interface VideoRequest {
  prompt: string;
  style_reference?: string;  // base64 style image
  duration_seconds?: number;
  resolution?: '720p' | '1080p';
}

export async function generateVideo(params: VideoRequest): Promise<string> {
  const res = await fetch(`${API}/generate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.HIGGSFIELD_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });

  if (!res.ok) throw new Error(`Higgsfield error: ${await res.text()}`);

  const { job_id } = await res.json();
  return pollJob(job_id);
}

async function pollJob(jobId: string): Promise<string> {
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const res = await fetch(`${API}/jobs/${jobId}`, {
      headers: { 'Authorization': `Bearer ${process.env.HIGGSFIELD_API_KEY}` },
    });
    const { status, video_url } = await res.json();
    if (status === 'completed') return video_url;
    if (status === 'failed') throw new Error(`Job ${jobId} failed`);
  }
  throw new Error('Timeout waiting for video');
}
```

## Environment Variables

```bash
HIGGSFIELD_API_KEY=hf_...
MODELS_DIR=/path/to/models
```

## Performance Notes

- WebGL provider is ~3-5x faster than WASM for large models
- Quantized INT8 models are 4x smaller with minimal accuracy loss — prefer for browser
- Cache `InferenceSession` — creation is expensive, keep it alive for the component lifecycle
- LoRA on M5: `--mixed_precision bf16` is the right flag for M-series Metal acceleration
