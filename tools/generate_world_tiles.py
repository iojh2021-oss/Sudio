#!/usr/bin/env python3
"""Generate high-detail cinematic noir city segments for Sudio's offline world."""
import argparse
import hashlib
import json
import os
import pathlib
import time
from datetime import datetime, timezone

from PIL import Image
from huggingface_hub import InferenceClient

# Schnell creates the initial image under Apache-2.0. Kontext edits the
# previous image to preserve its visual identity during scene continuation.
BASE_MODEL = "black-forest-labs/FLUX.1-schnell"
CONTINUATION_MODEL = "black-forest-labs/FLUX.1-Kontext-dev"
OUT = pathlib.Path("generated-world")
WIDTH, HEIGHT = 1024, 576
TILE_WIDTH = 1280
BASE = (
    "A single continuous photorealistic cinematic frame from a premium live-action "
    "1930s noir crime film, eye-level camera centered in the middle of a broad straight "
    "wet city avenue, strong deep central vanishing point, towering densely packed "
    "Art Deco skyscrapers and old stone commercial buildings on both sides, richly "
    "detailed real masonry, cornices, fire escapes, hundreds of individually visible "
    "warm illuminated windows, authentic vintage street lamps and a few period cars, "
    "dark rain-soaked asphalt with long physically plausible reflections, dense "
    "volumetric silver-gray fog glowing from the far end of the avenue, dramatic "
    "backlighting, deep charcoal black and cold blue-gray shadows, restrained ivory "
    "window light, realistic lens response, natural film grain, subtle halation, "
    "high dynamic range, realistic atmospheric perspective, highly detailed production "
    "design, no people close to camera, no text, no watermark, wide 16:9 composition"
)
NEGATIVE = (
    "cartoon, illustration, painting, concept art, game art, low detail, low resolution, "
    "flat geometry, simple rectangles, daytime, colorful neon, oversaturated, anime, "
    "text, logo, watermark, distorted architecture, fisheye, duplicated windows, "
    "blur, plastic materials, artificial CGI appearance, fantasy"
)

def load_manifest(path):
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, dict) or not isinstance(data.get("tiles"), list):
            raise ValueError("invalid manifest structure")
        return data
    except FileNotFoundError:
        return {"version": 3, "tiles": []}

def continuation_reference(previous_path):
    """Keep a broad strip of the prior scene as visual style/scene context."""
    with Image.open(previous_path) as source:
        source = source.convert("RGB")
        edge = source.crop((int(source.width * 0.22), 0, source.width, source.height))
        return edge.resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--count", type=int, default=4)
    parser.add_argument("--start", type=int, default=0)
    parser.add_argument("--base-model", default=BASE_MODEL)
    parser.add_argument("--continuation-model", default=CONTINUATION_MODEL)
    args = parser.parse_args()

    token = os.environ.get("HF_TOKEN", "").strip()
    if not token:
        raise SystemExit(
            "HF_TOKEN is empty in this GitHub Actions job. Add it under repository "
            "Settings > Secrets and variables > Actions as HF_TOKEN."
        )
    if not 1 <= args.count <= 8 or args.start < 0:
        raise SystemExit("count must be 1..8 and start >= 0")

    OUT.mkdir(parents=True, exist_ok=True)
    client = InferenceClient(provider="auto", api_key=token, timeout=900)
    manifest_path = OUT / "manifest.json"
    manifest = load_manifest(manifest_path)
    existing = {
        int(tile["index"]): tile
        for tile in manifest.get("tiles", [])
        if isinstance(tile, dict) and "index" in tile and "file" in tile
    }

    for index in range(args.start, args.start + args.count):
        filename = f"tile-{index:04d}.webp"
        output_path = OUT / filename
        if index in existing and output_path.exists():
            print(f"Tile {index} already exists; keeping verified image.", flush=True)
            continue

        variation = (
            "the avenue advances past a monumental Art Deco corner tower and detailed storefronts"
            if index % 2 == 0
            else "the same avenue advances past another block of ornate stone towers, fire escapes and vintage storefronts"
        )
        prompt = (
            f"{BASE}. {variation}. World segment {index}. Keep the same camera height, "
            "street axis, horizon, weather, architectural era, color grade and lighting "
            "language as the previous segment. Compose a believable next stretch of the "
            "same city, not a collage and not a new camera angle."
        )
        previous_path = OUT / f"tile-{index - 1:04d}.webp"
        image = None
        generation_mode = "text-to-image"
        used_model = args.base_model

        if index > 0 and previous_path.is_file():
            print(f"Continuing scene {index} with FLUX Kontext image editing.", flush=True)
            try:
                with Image.open(previous_path) as previous:
                    reference = previous.convert("RGB").resize(
                        (WIDTH, HEIGHT), Image.Resampling.LANCZOS
                    )
                image = client.image_to_image(
                    reference,
                    prompt=(
                        "Create the next forward view of the exact same photorealistic "
                        "1930s noir city avenue, as if the camera has moved one city block "
                        "forward along the same street. Preserve the same architectural "
                        "identity, skyline language, street width, vanishing-point direction, "
                        "rain, wet asphalt, fog density, lighting, exposure and cold blue-gray "
                        "cinematic color grade. Introduce new adjacent buildings and storefronts; "
                        "do not reproduce the exact same foreground buildings. No people, "
                        "no text, no collage, no illustration."
                    ),
                    model=args.continuation_model,
                    num_inference_steps=28,
                    guidance_scale=3.5,
                    negative_prompt=NEGATIVE,
                )
                generation_mode = "image-to-image-guided-continuation"
                used_model = args.continuation_model
            except Exception as exc:
                print(
                    f"Context continuation unavailable ({type(exc).__name__}); "
                    "using quality-first text-to-image for this segment.",
                    flush=True,
                )

        if image is None:
            print(f"Generating segment {index} with {args.base_model}.", flush=True)
            image = client.text_to_image(
                prompt,
                model=args.base_model,
                width=WIDTH,
                height=HEIGHT,
                num_inference_steps=4,
                seed=73000 + index,
                negative_prompt=NEGATIVE,
                guidance_scale=0.0,
            )

        image = image.convert("RGB")
        if image.size != (WIDTH, HEIGHT):
            image = image.resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)
        image.save(output_path, "WEBP", quality=96, method=6)
        if not output_path.is_file() or output_path.stat().st_size < 10000:
            raise SystemExit(f"Generated image failed validation: {output_path}")
        digest = hashlib.sha256(output_path.read_bytes()).hexdigest()
        existing[index] = {
            "index": index,
            "file": filename,
            "sha256": digest,
            "seed": 73000 + index,
            "model": used_model,
            "base_model": args.base_model,
            "generation": generation_mode,
            "width": WIDTH,
            "height": HEIGHT,
            "bytes": output_path.stat().st_size,
        }
        print(
            f"Saved and verified {output_path}: {image.width}x{image.height}, "
            f"{output_path.stat().st_size} bytes ({generation_mode}).",
            flush=True,
        )
        time.sleep(1)

    tiles = [existing[key] for key in sorted(existing)]
    manifest = {
        "version": 4,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "model": args.base_model,
        "continuation_model": args.continuation_model,
        "licenses": {
            "initial_generation": "Apache-2.0 (FLUX.1-schnell)",
            "image_continuation": "FLUX.1-dev Non-Commercial License (FLUX.1-Kontext-dev)",
        },
        "width": WIDTH,
        "height": HEIGHT,
        "tile_width": TILE_WIDTH,
        "overlap": 128,
        "tiles": tiles,
    }
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    missing = []
    for tile in tiles:
        image_path = OUT / tile["file"]
        if not image_path.is_file():
            missing.append(tile["file"])
            continue
        with Image.open(image_path) as check:
            if check.format != "WEBP" or check.size != (WIDTH, HEIGHT):
                raise SystemExit(f"Invalid image format or dimensions: {image_path}")
        digest = hashlib.sha256(image_path.read_bytes()).hexdigest()
        if tile.get("sha256") and tile["sha256"] != digest:
            raise SystemExit(f"Image hash mismatch: {image_path}")
        tile["sha256"] = digest
        tile["bytes"] = image_path.stat().st_size
    if missing:
        raise SystemExit("Manifest references missing image files: " + ", ".join(missing))
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(
        f"Manifest verified: {len(tiles)} image files; "
        f"{sum(1 for t in tiles if t.get('generation') == 'image-to-image-guided-continuation')} "
        "used image-conditioned continuation.",
        flush=True,
    )

if __name__ == "__main__":
    main()
