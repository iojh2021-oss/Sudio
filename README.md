# SUDIO — Noir Animation Studio

A browser-based 2D noir animation playground designed for GitHub Pages. It uses a high-contrast monochrome look with optional red accents as a broad visual direction; it does not reproduce any exact frames, characters, or assets from a movie.

## Current prototype
- Procedurally draws a scrolling city world as the character walks.
- Adds multiple characters and scene props from a small built-in library.
- Edits selected item name, position, scale, speed, and colors.
- Uses browser-installed speech voices for dialogue (voice gender/language availability depends on the device/browser).
- Imports a local audio file for preview.
- Records a short 10-second canvas capture to WebM when supported by the browser.

## Run locally
Open `index.html` in a modern desktop browser, or serve this folder with any static file server.

## Publish with GitHub Pages
1. In repository Settings → Pages, choose **GitHub Actions** as the build and deployment source.
2. Push to `main`; the workflow in `.github/workflows/pages.yml` deploys the static site.
3. The site URL will be `https://iojh2021-oss.github.io/Sudio/` once Pages is enabled and the workflow succeeds.

## Current limitations
- This is a front-end prototype, not a full 3D engine or generative-AI image model. World art is generated procedurally in the browser using Canvas.
- Voice selection is limited to voices installed and exposed by the browser/operating system. The browser may not expose a true male/female voice label.
- Audio tracks can be previewed, but the current recorder captures canvas video and only includes audio where browser capture support is available.
- Export currently records a 10-second preview. A future version should add a multi-track timeline, scene duration controls, project save/load, asset import, and longer export.
- Browser support for WebM/MP4 recording varies. Chrome or Edge desktop is recommended.
