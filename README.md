# SUDIO — Noir Animation Studio

A browser-based 2D noir animation studio designed for GitHub Pages and lightweight Android packaging. The visual direction is high-contrast monochrome with selective red accents.

## Live World Engine 1.0

Sudio now includes an offline-first hybrid world generator:

- **Lightweight world director:** chooses a district grammar, mood, weather and story beat from a compact deterministic rule set. Its interface is deliberately replaceable by a small local model later.
- **Procedural chunk builder:** generates buildings and street props in 960-pixel chunks from a world seed.
- **Streaming and cache:** preloads chunks around the camera and evicts distant chunks to bound memory use.
- **Deterministic persistence:** the same seed and chunk index recreate the same district; project saves include the world seed and mood.
- **No heavy inference in the render loop:** no image diffusion, video model, remote API or server is required for baseline world generation.

The generated world is not a single background image being scrolled. New, independently generated districts are created as the camera advances. The current renderer is a 2D Canvas noir city; this is the first engine milestone, not yet a fully simulated 3D world or a neural image-generation model.

## Current studio features

- Procedurally generated, seed-based city districts and street props.
- Multiple characters and editable scene objects.
- Item transforms, parallax depth, Z ordering, keyframes and timeline.
- Project save/load, image import, browser speech voices and audio preview.
- Canvas video capture where supported by the browser.
- Experimental OpenBone character preview remains a separate optional panel.

## Android / APK design

The core world engine is plain JavaScript with no runtime dependencies. It is suitable for bundling inside a WebView-based Android shell or a lightweight browser wrapper. The current site is still a web application; an APK build pipeline and on-device profiling are separate next milestones. Browser speech, audio capture and WebM export vary by Android WebView/device.

## Run locally

Open `index.html` in a modern browser or serve the folder using any static file server. GitHub Pages deploys the static files from `main`.

## Validation

The Pages workflow checks HTML IDs and JavaScript syntax, then runs deterministic chunk-generation tests with Node.js before deployment.

## AI image-world generation (online generation + offline playback)

The image-world layer uses Hugging Face Inference Providers. `black-forest-labs/FLUX.1-schnell` (Apache-2.0) creates the first cinematic noir image. For reference-guided scene continuation, `black-forest-labs/FLUX.1-Kontext-dev` edits the preceding image to preserve the city's visual identity. Kontext-dev is governed by the FLUX.1-dev Non-Commercial License; review and accept its terms before enabling it, and do not use it for commercial deployment without the required permission. Images are generated outside the render loop. Generated WebP images are committed under `generated-world/`, loaded by the studio, and cached in IndexedDB for later offline playback. The compact procedural world remains the fallback when no AI tiles are available.

### Enable image generation
1. Accept the model access conditions on the Hugging Face model page and create a token with **Inference Providers** permission.
2. Add it as a repository Actions secret named `HF_TOKEN`. Never put the token in browser JavaScript or commit it.
3. Open **Actions → Generate AI Noir World Tiles → Run workflow**. Choose the first tile index and generate 4 tiles for the initial batch.
4. The workflow generates images and commits them. The Pages workflow deploys the new tiles automatically.
5. Open the studio online once; generated tiles are cached locally and can then be replayed offline.

Hosted inference may consume Hugging Face credits or incur provider charges. The site/APK does not include the model weights or API token. This is batch image generation, not per-frame live diffusion. Reference-guided editing improves style continuity, but adjacent city views still require visual review; exact seamless geographic continuity is not guaranteed.
