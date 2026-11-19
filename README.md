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

## GitHub-only world generation

Sudio's selected architecture uses GitHub as the only project platform. GitHub Pages serves the static studio; GitHub Actions trains and validates small offline models and publishes the site. No VPS, external GPU service, hosted inference API, or browser API token is part of the design.

### Runtime architecture

- **Browser renderer:** the visitor's device performs interactive rendering locally. The browser GPU (WebGL2 where supported) is the only practical place for continuous, interactive high-detail rendering under the no-cloud-GPU constraint. GitHub Actions does not render each live frame.
- **World director:** a compact deterministic CPU model chooses district grammar, atmosphere and scene events. The current 4-input / 8-hidden / 4-output MLP is a small district planner, not a photorealistic image or video model.
- **Procedural world:** seeded chunks generate persistent city geometry and props as the camera moves. A bounded cache controls memory use.
- **Visual synthesis:** geometry, physically-inspired materials, fog, rain, reflections, lighting and temporal effects are generated locally by shaders and procedural meshes. No pre-rendered image plates are required.
- **Continuity memory:** stable world seed, chunk coordinates, district decisions, landmarks and user edits preserve the identity of revisited places.
- **GitHub Actions:** CPU-only training, deterministic tests, bundle checks and Pages deployment. The standard public Ubuntu runner currently provides 4 vCPU and 16 GB RAM; it is not a general-purpose video-generation GPU. See [GitHub-hosted runner specifications](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).

### Quality and hardware limits

The current renderer is still a 2D Canvas implementation. The target upgrade is a progressive WebGL2 renderer, with a Canvas fallback for unsupported devices. It should be implemented in stages: camera and depth pipeline; instanced building geometry; PBR-like stone/glass/wet-road materials; shadow and fog passes; rain and reflection effects; then deterministic streaming and visual regression tests.

A Wan/LTX-class diffusion video model is not a viable runtime dependency on standard GitHub-hosted CPU runners. This GitHub-only architecture therefore does not claim text-to-video diffusion quality. It targets a continuously generated interactive world, using the visitor's local GPU for rendering and GitHub Actions only for lightweight training and verification.

### Validation

The Pages workflow must test the trained planner, deterministic chunk identity, chunk streaming, bounded cache behavior, and renderer fallback. A successful Pages deployment proves the website built and published; it does not by itself prove photorealistic quality or GPU rendering performance.
