"""Fine-tune Qwen3-TTS Base on one speaker's dataset clips (a new voice version).

Runs in the separate training environment (PyTorch + qwen-tts), not the mlx-audio one:

    python train.py request.json

request.json:
    {"baseModel": dir, "tokenizer": dir, "finetuneDir": dir with the official dataset.py,
     "clips": [{"audio": wav, "text": str}], "refAudio": wav (24 kHz), "speaker": "lowercase-name",
     "epochs": 3, "lr": 2e-5, "batchSize": 2, "gradAccum": 4, "seed": 42, "outDir": dir}

Prints JSON lines: {"event": "progress"|"epoch"|"done"|"error", ...}.

The training step is the one in QwenLM/Qwen3-TTS finetuning/sft_12hz.py (Apache-2.0), unchanged,
except: attention is "sdpa" (flash-attention is NVIDIA-only), Accelerate's mixed precision is off
(the weights are already bf16), it runs on Apple's GPU (mps) when present, and only the final epoch
is saved. The saved folder is a "custom_voice" model with the voice as speaker id 3000, the format
mlx-audio loads directly.
"""

import json
import os
import random
import shutil
import sys
import time
from pathlib import Path

PROGRESS_EVERY = 10


def emit(**event):
    print(json.dumps(event), flush=True)


def encode_clips(req, device):
    """Audio codes for every clip (prepare_data.py in the official scripts)."""
    import torch
    from qwen_tts import Qwen3TTSTokenizer

    tokenizer = Qwen3TTSTokenizer.from_pretrained(req["tokenizer"], device_map=device)
    rows = []
    clips = req["clips"]
    for i in range(0, len(clips), 32):
        batch = clips[i:i + 32]
        codes = tokenizer.encode([c["audio"] for c in batch]).audio_codes
        rows += [{"audio": c["audio"], "text": c["text"], "ref_audio": req["refAudio"], "audio_codes": code.cpu().tolist()}
                 for c, code in zip(batch, codes)]
    del tokenizer
    if device == "mps":
        torch.mps.empty_cache()
    return rows


def save_version(req, model, accelerator, speaker_embedding):
    """The official checkpoint layout: base model files + custom_voice config + trained weights."""
    from safetensors.torch import save_file

    base, out = Path(req["baseModel"]), Path(req["outDir"])
    # The top-level weights are replaced below; speech_tokenizer/ keeps its own model.safetensors.
    shutil.copytree(base, out, dirs_exist_ok=True,
                    ignore=lambda d, names: ["model.safetensors"] if Path(d) == base else [])
    config = json.loads((base / "config.json").read_text(encoding="utf-8"))
    config["tts_model_type"] = "custom_voice"
    talker = config.get("talker_config", {})
    talker["spk_id"] = {req["speaker"]: 3000}
    talker["spk_is_dialect"] = {req["speaker"]: False}
    config["talker_config"] = talker
    (out / "config.json").write_text(json.dumps(config, indent=2, ensure_ascii=False), encoding="utf-8")

    state = {k: v.detach().to("cpu") for k, v in accelerator.unwrap_model(model).state_dict().items()
             if not k.startswith("speaker_encoder")}
    weight = state["talker.model.codec_embedding.weight"]
    weight[3000] = speaker_embedding[0].detach().to(weight.device).to(weight.dtype)
    save_file(state, str(out / "model.safetensors"))


def train(req):
    import torch
    from accelerate import Accelerator
    from torch.optim import AdamW
    from torch.utils.data import DataLoader
    from transformers import AutoConfig

    sys.path.insert(0, req["finetuneDir"])
    from dataset import TTSDataset  # the official dataset/collator
    from qwen_tts.inference.qwen3_tts_model import Qwen3TTSModel

    random.seed(req["seed"])
    torch.manual_seed(req["seed"])
    device = "mps" if torch.backends.mps.is_available() else "cpu"
    started = time.time()
    rows = encode_clips(req, device)
    emit(event="encoded", clips=len(rows), seconds=round(time.time() - started, 1))

    accelerator = Accelerator(gradient_accumulation_steps=req["gradAccum"], mixed_precision="no")
    qwen3tts = Qwen3TTSModel.from_pretrained(req["baseModel"], torch_dtype=torch.bfloat16, attn_implementation="sdpa")
    config = AutoConfig.from_pretrained(req["baseModel"])
    dataset = TTSDataset(rows, qwen3tts.processor, config)
    loader = DataLoader(dataset, batch_size=req["batchSize"], shuffle=True, collate_fn=dataset.collate_fn)
    optimizer = AdamW(qwen3tts.model.parameters(), lr=req["lr"], weight_decay=0.01)
    model, optimizer, loader = accelerator.prepare(qwen3tts.model, optimizer, loader)
    model.train()

    target_speaker_embedding = None
    total = req["epochs"] * len(loader)
    done = 0
    for epoch in range(req["epochs"]):
        losses = []
        for batch in loader:
            with accelerator.accumulate(model):
                input_ids = batch['input_ids']
                codec_ids = batch['codec_ids']
                ref_mels = batch['ref_mels']
                text_embedding_mask = batch['text_embedding_mask']
                codec_embedding_mask = batch['codec_embedding_mask']
                attention_mask = batch['attention_mask']
                codec_0_labels = batch['codec_0_labels']
                codec_mask = batch['codec_mask']

                speaker_embedding = model.speaker_encoder(ref_mels.to(model.device).to(model.dtype)).detach()
                if target_speaker_embedding is None:
                    target_speaker_embedding = speaker_embedding

                input_text_ids = input_ids[:, :, 0]
                input_codec_ids = input_ids[:, :, 1]
                input_text_embedding = model.talker.model.text_embedding(input_text_ids) * text_embedding_mask
                input_codec_embedding = model.talker.model.codec_embedding(input_codec_ids) * codec_embedding_mask
                input_codec_embedding[:, 6, :] = speaker_embedding
                input_embeddings = input_text_embedding + input_codec_embedding
                for i in range(1, 16):
                    codec_i_embedding = model.talker.code_predictor.get_input_embeddings()[i - 1](codec_ids[:, :, i])
                    codec_i_embedding = codec_i_embedding * codec_mask.unsqueeze(-1)
                    input_embeddings = input_embeddings + codec_i_embedding

                outputs = model.talker(
                    inputs_embeds=input_embeddings[:, :-1, :],
                    attention_mask=attention_mask[:, :-1],
                    labels=codec_0_labels[:, 1:],
                    output_hidden_states=True,
                )
                hidden_states = outputs.hidden_states[0][-1]
                talker_hidden_states = hidden_states[codec_mask[:, :-1]]
                talker_codec_ids = codec_ids[codec_mask]
                _, sub_talker_loss = model.talker.forward_sub_talker_finetune(talker_codec_ids, talker_hidden_states)
                loss = outputs.loss + 0.3 * sub_talker_loss

                accelerator.backward(loss)
                if accelerator.sync_gradients:
                    accelerator.clip_grad_norm_(model.parameters(), 1.0)
                optimizer.step()
                optimizer.zero_grad()
            if device == "mps":
                # Every batch has a different length, so MPS's caching allocator keeps reserving new blocks;
                # without handing them back it fills unified memory, swaps, and fails mid-run.
                torch.mps.empty_cache()
            done += 1
            losses.append(loss.item())
            if done % PROGRESS_EVERY == 0:
                emit(event="progress", step=done, of=total, loss=round(loss.item(), 4), seconds=round(time.time() - started, 1))
        emit(event="epoch", epoch=epoch + 1, of=req["epochs"], meanLoss=round(sum(losses) / len(losses), 4),
             seconds=round(time.time() - started, 1))

    trained = time.time()
    save_version(req, model, accelerator, target_speaker_embedding)
    peak = round(torch.mps.driver_allocated_memory() / 1e9, 2) if device == "mps" else None
    emit(event="done", device=device, steps=done, trainSeconds=round(trained - started, 1),
         saveSeconds=round(time.time() - trained, 1), peakGpuMemoryGB=peak, outDir=req["outDir"])
    return 0


def main():
    with open(sys.argv[1], encoding="utf-8") as f:
        req = json.load(f)
    os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")
    return train(req)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:  # noqa: BLE001 - reported to the caller
        emit(event="error", error=f"{type(exc).__name__}: {exc}")
        sys.exit(1)
