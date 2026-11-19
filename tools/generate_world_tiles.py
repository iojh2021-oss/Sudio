#!/usr/bin/env python3
"""Generate photorealistic noir world tiles through Hugging Face Inference Providers."""
import argparse, json, os, pathlib, time
from huggingface_hub import InferenceClient

MODEL = "black-forest-labs/FLUX.1-schnell"
OUT = pathlib.Path("generated-world")
BASE = ("wide cinematic photorealistic 1930s American noir metropolis street canyon, "
"very tall densely detailed art deco skyscrapers on both sides, intricate stone and brick facades, "
"hundreds of individually visible illuminated windows, deep central vanishing point, "
"wet black asphalt with long realistic reflections of windows and street lamps, "
"thick volumetric white-gray fog glowing at the distant center, dramatic backlight, "
"high contrast monochrome black charcoal silver and cold gray palette, subtle film grain, "
"realistic cinematic photography, atmospheric perspective, richly textured architecture, "
"continuous broad avenue, eye-level street view, 16:9 composition, no text, no watermark")
NEGATIVE = ("cartoon, illustration, low detail, low resolution, flat geometry, simple rectangles, "
"daytime, colorful neon, oversaturated, anime, text, logo, watermark, distorted buildings, "
"fisheye, duplicated windows, blurry, low contrast")
def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--count",type=int,default=4)
    parser.add_argument("--start",type=int,default=0)
    args=parser.parse_args()
    token=os.environ.get("HF_TOKEN")
    if not token:
        raise SystemExit("HF_TOKEN secret missing. Add a Hugging Face token with Inference Providers permission to GitHub Actions secrets.")
    if not 1<=args.count<=8 or args.start<0: raise SystemExit("count must be 1..8 and start >= 0")
    OUT.mkdir(parents=True,exist_ok=True)
    client=InferenceClient(provider="auto",api_key=token,timeout=600)
    manifest_path=OUT/"manifest.json"
    try: manifest=json.loads(manifest_path.read_text(encoding="utf-8"))
    except Exception: manifest={"version":1,"tiles":[]}
    existing={int(t["index"]):t for t in manifest.get("tiles",[]) if "index" in t}
    for i in range(args.start,args.start+args.count):
        if i in existing and (OUT/existing[i]["file"]).exists(): continue
        variation=("foreground towers frame the avenue, distant period automobiles" if i%2==0 else
                   "another richly detailed art deco block, storefronts and street lamps, same camera height and avenue")
        prompt=f"{BASE}, {variation}, world segment {i}, consistent horizon and architectural scale"
        print(f"Generating world segment {i} using {MODEL}",flush=True)
        image=client.text_to_image(prompt,model=MODEL,width=1024,height=576,num_inference_steps=4,seed=73000+i,negative_prompt=NEGATIVE)
        filename=f"tile-{i:04d}.webp"
        image.save(OUT/filename,"WEBP",quality=92,method=6)
        existing[i]={"index":i,"file":filename,"seed":73000+i,"model":MODEL}
        time.sleep(1)
    manifest={"version":1,"model":MODEL,"license":"Apache-2.0","width":1024,"height":576,"tile_width":1280,
              "tiles":[existing[k] for k in sorted(existing)]}
    manifest_path.write_text(json.dumps(manifest,indent=2),encoding="utf-8")
    print(f"Generated manifest with {len(manifest['tiles'])} tiles",flush=True)
if __name__=="__main__": main()
