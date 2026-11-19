#!/usr/bin/env python3
"""Generate connected photorealistic noir world tiles with Hugging Face FLUX."""
import argparse
import json
import os
import pathlib
import time

from PIL import Image
from huggingface_hub import InferenceClient

MODEL = "black-forest-labs/FLUX.1-schnell"
OUT = pathlib.Path("generated-world")
WIDTH, HEIGHT = 1024, 576
TILE_WIDTH = 1280
BASE = (
    "photorealistic cinematic 1930s noir metropolis, eye-level street-level camera, "
    "a single very wide straight avenue receding to a deep central vanishing point, "
    "dense tall art-deco skyscrapers and detailed old masonry buildings on both sides, "
    "real architectural proportions, individually resolved windows and stone facades, "
    "wet dark asphalt with physically plausible long reflections from warm windows and street lamps, "
    "thick volumetric silver-gray fog illuminated from the distant center, dramatic backlight, "
    "deep charcoal black and cold blue-gray palette, restrained warm ivory window lights, "
    "subtle analog film grain, high-end live-action cinematography, realistic atmospheric perspective, "
    "consistent horizon, consistent camera height, 16:9 wide composition, no text, no watermark"
)
NEGATIVE = (
    "cartoon, illustration, painting, low detail, low resolution, flat geometry, "
    "simple rectangles, daytime, colorful neon, oversaturated, anime, text, logo, watermark, "
    "distorted architecture, fisheye, duplicated windows, blurry, low contrast, fantasy"
)

def load_manifest(path):
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, dict) or not isinstance(data.get("tiles"), list):
            raise ValueError("invalid manifest structure")
        return data
    except FileNotFoundError:
        return {"version": 2, "tiles": []}

def continuation_reference(previous_path):
    """Use the previous tile's right edge as visual context for the next segment."""
    with Image.open(previous_path) as source:
        source = source.convert("RGB")
        left = int(source.width * 0.38)
        edge = source.crop((left, 0, source.width, source.height))
        return edge.resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--count", type=int, default=4)
    parser.add_argument("--start", type=int, default=0)
    args = parser.parse_args()

    token = os.environ.get("HF_TOKEN")
    if not token:
        raise SystemExit(
            "HF_TOKEN secret missing. Add a Hugging Face token with Inference Providers permission "
            "to GitHub Actions secrets."
        )
    if not 1 <= args.count <= 8 or args.start < 0:
        raise SystemExit("count must be 1..8 and start >= 0")

    OUT.mkdir(parents=True, exist_ok=True)
    client = InferenceClient(provider="auto", api_key=token, timeout=600)
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
            print(f"Tile {index} already exists; keeping it.", flush=True)
            continue

        variation = (
            "the avenue continues forward into another block, foreground facades frame the view"
            if index % 2 == 0
            else "the same avenue continues through a new art-deco block, street lamps and storefronts"
        )
        prompt = (
            f"{BASE}. {variation}. This is world segment {index}; preserve the exact same "
            "visual identity, weather, perspective, horizon and street direction as neighboring segments. "
            "Do not create a new camera angle or a different city."
        )
        previous_path = OUT / f"tile-{index - 1:04d}.webp"
        image = None
        generation_mode = "text-to-image"

        if index > 0 and previous_path.exists():
            print(f"Extending segment {index} from the previous tile's visual edge.", flush=True)
            try:
                reference = continuation_reference(previous_path)
                image = client.image_to_image(
                    image=reference,
                    prompt=(
                        f"{prompt} Continue the same street beyond the previous frame. "
                        "Use the reference image as strict visual continuity guidance; "
                        "retain its architecture, lighting, fog density, wet-road appearance and palette, "
                        "while revealing the next stretch of the avenue."
                    ),
                    negative_prompt=NEGATIVE,
                    num_inference_steps=6,
                    model=MODEL,
                )
                generation_mode = "image-to-image-continuation"
            except Exception as exc:
                print(
                    f"Image continuation unavailable for tile {index} ({type(exc).__name__}); "
                    "falling back to text-to-image with the same scene specification.",
                    flush=True,
                )

        if image is None:
            print(f"Generating segment {index} with {MODEL}.", flush=True)
            image = client.text_to_image(
                prompt,
                model=MODEL,
                width=WIDTH,
                height=HEIGHT,
                num_inference_steps=6,
                seed=73000 + index,
                negative_prompt=NEGATIVE,
            )

        image = image.convert("RGB").resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)
        image.save(output_path, "WEBP", quality=95, method=6)
        existing[index] = {
            "index": index,
            "file": filename,
            "seed": 73000 + index,
            "model": MODEL,
            "generation": generation_mode,
            "width": WIDTH,
            "height": HEIGHT,
        }
        print(f"Saved {output_path} ({generation_mode}).", flush=True)
        time.sleep(1)

    tiles = [existing[key] for key in sorted(existing)]
    manifest = {
        "version": 2,
        "model": MODEL,
        "license": "Apache-2.0",
        "width": WIDTH,
        "height": HEIGHT,
        "tile_width": TILE_WIDTH,
        "tiles": tiles,
    }
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    missing = [
        tile["file"] for tile in tiles
        if not (OUT / tile["file"]).is_file()
    ]
    if missing:
        raise SystemExit("Manifest references missing image files: " + ", ".join(missing))
    print(
        f"Verified manifest: {len(tiles)} tiles, "
        f"{sum(1 for t in tiles if t.get('generation') == 'image-to-image-continuation')} "
        "continued from previous images.",
        flush=True,
    )

if __name__ == "__main__":
    main()
