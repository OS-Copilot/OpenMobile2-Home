# OpenMobile-2 — project page

Source for the OpenMobile-2 homepage: *OpenMobile-2: Building Versatile Mobile
Agents with Scalable Environments and App-Native Tools*.

Static HTML, CSS and vanilla JS. No build step, no framework, no CDN scripts;
open `index.html` or serve the directory and it runs.

```bash
python3 -m http.server 8899   # then http://localhost:8899
```

## Layout

```
index.html               the page
viewer.html              the trajectory viewer (see below)
404.html                 not-found page
static/css/main.css      design tokens for both themes + all page styles
static/css/om2-*.css     one stylesheet per interactive component
static/js/om2-data.js    every number and list on the page, tagged with its
                         source in the paper; edit here, never in the HTML
static/js/om2-page.js    mounts each component on its element
static/js/om2-appwall.js the hero: every app on a phone, coloured by domain
static/js/om2-stepper.js walkthrough stepper (data pipeline, app construction)
static/js/om2-lanes.js   one task done GUI-only and with tools; tool schemas
static/js/om2-charts.js  dependency-free SVG charts
static/js/om2-table.js   main results table (sortable) and environment comparison
static/js/om2-crossapp.js cross-app mechanisms scene
static/js/om2-live.js    the live simulator card and shared device setup
static/js/om2-hero.js    on-demand simulator inside the hero phone
static/js/om2-pipeline.js data pipeline tour (stations, stage visuals, autoplay)
static/js/om2-viewer.js  trajectory player, viewer page, example cards, GUI vs hybrid pair
static/js/om2-sim-apps.js every app in the live-demo build (generated, see tools/)
static/js/main.js        theme toggle, nav, reveal-on-scroll, BibTeX copy
viewer/                  episode data for the viewer: data/*.json, frames/, posters/
public/
  logo.png / logo.webp   the project mark (nav, footer, favicons): the OpenMobile
                         robot of the "More research" menu (88 px source)
  favicon*.png .ico      derived from logo.png
  apple-touch-icon.png   180x180, on the dark background
  logos/projects/        marks for the "More research" menu
tools/build_icons.py     regenerates logo.webp and every favicon from public/logo.png
tools/build_viewer_data.py   MobileGym++ episode materials -> viewer/
tools/sample_openmobile_data.py  OpenMobile-Data samples from Hugging Face -> viewer/
tools/patch_sim.py       seed changes applied to the MobileGym++ checkout before a build
tools/sim-overlay/       files the patch copies in (WeChat avatars)
tools/assemble_sim.py    MobileGym++ build -> ../OpenMobile2-Sim (the live demo)
tools/extract_sim_apps.py  app ids, names, icon colours -> static/js/om2-sim-apps.js
```

## Components

Every component is `OM2Widgets.<name>(element, options)` and returns
`{ el, destroy() }` plus its own methods. They read `window.OM2` (the data
file) and the CSS custom properties, so a number changes in one place and a
colour in one place. Charts re-render on container resize and on the
`openmobile2:theme` event, which the theme toggle dispatches.

| Mount | Component | Shows |
| --- | --- | --- |
| `#app-wall` | `appWall` + `heroSim` | app wall that unlocks in place into a playable phone on swipe, scroll or click |
| `#chart-domains` | `domainCoverage` | apps per domain, simulated vs emulator |
| `#crossapp` | `crossApp` | the four cross-app mechanisms |
| `#construction-steps` | `stepper` | how a commercial app is rebuilt |
| `#env-compare` | `envCompare` | Table 1 of the paper |
| `#live-sim` | `liveSim` | the simulator, running in the page |
| `#example-cards` | `trajCards` | the featured episodes, linking into the viewer |
| `#pipeline-flow` | `pipelineFlow` | the data pipeline as a seven-stage tour, one released trajectory walking through it |
| `#task-pairs` | `trajPairs` | one Bench task, GUI-only and hybrid, replayed side by side |
| `#tool-schemas` | `toolSchemas` | the Taobao tool signatures |
| `#chart-bench` | `benchComposition` | MobileGym++ Bench by app count and domain |
| `#results-table` | `resultsTable` | Table 2 of the paper, sortable |
| `#chart-coverage` | `coverageScaling` | environment coverage at a fixed budget |
| `#chart-tools` | `toolDumbbell` | GUI-only vs hybrid success per model |
| `#viewer` (viewer.html) | `trajViewer` | filters, episode list and the player |

## Filling in what is left

- **Links.** MobileGym++, code, data and models point at GitHub and Hugging
  Face. The paper link has no `href` yet: add its release URL and remove
  `aria-disabled` and the "Paper coming soon" title when it is available.
- **Byline, news, venue, BibTeX, GitHub button, social card.** Search `TODO`.
- **Numbers.** Every value in `om2-data.js` follows the ICLR 2027 submission;
  re-check against the camera-ready before release.

## Live demo

The hero phone starts as the app wall. Swiping up, scrolling down over the
phone, or activating its hint opens a separate simulator inside the same
frame; the page stays in place. No hero simulator resources load until this
interaction. The screen matches the simulator's native 360×800 viewport;
its own bottom and edge gestures provide home, recents and back navigation.
A small control below the phone restores the app wall. Loading failures offer Retry and
Back. `om2-hero.js` uses `storageIsolation=load` so its state and files do not
interfere with the lower live demo. Both instances use `/OpenMobile2-Sim/`
on the same origin and share browser-cached assets.

The live card embeds the MobileGym++ simulator as a same-origin iframe and
drives it through `window.__OS__` / `__SIM__` / `__MOBILE_GYM_TOOLS__` (see
`static/js/om2-live.js`): English locale and a preset Mountain View weather
on boot, a featured row of app chips plus every app in the build grouped by
domain, an action log, the foreground app's business state, and its
app-native tools, each callable from the panel. The app list is generated by
`tools/extract_sim_apps.py` from the simulator checkout.

The build is too large for this repository (3.2 GB as built), so it lives in
the sibling repository `OpenMobile2-Sim`, published by GitHub Pages at
`/OpenMobile2-Sim/` on the same origin. Rebuild it from the MobileGym++
checkout (branch `codex/env-tooluse-integration`, folder
`trial_apps/mobilegym`, Node 22) and assemble it with the script here:

```bash
python3 tools/patch_sim.py                      # page-specific seed changes, idempotent
cd ../mobilegym-mock/trial_apps/mobilegym
VITE_BASE=/OpenMobile2-Sim/ VITE_CDN_BASE=https://cdn.mobilegym.dev npx vite build --outDir dist-sim --emptyOutDir
cd ../../../OpenMobile2-Home
python3 tools/assemble_sim.py --dist ../mobilegym-mock/trial_apps/mobilegym/dist-sim --out ../OpenMobile2-Sim
```

`patch_sim.py` swaps the home-screen coin widget for the sunrise/sunset
widget and adds six WeChat contacts whose avatars live in
`tools/sim-overlay/wechat-avatars/`.

`assemble_sim.py` keeps the site under the 1 GB Pages limit: it drops the
per-app media folders whose images Vite already bundled, re-encodes the large
PNG and JPEG files as WebP (about 490 MB in all) and renames every reference
in the built code, so nothing is hosted elsewhere. Theme assets and the base
simulator's media (Bilibili, RedNote, Spotify, Maps) still come from the
MobileGym CDN.

Locally, serve the parent folder so both repositories resolve as on Pages:

```bash
cd .. && python3 -m http.server 8921   # then http://localhost:8921/OpenMobile2-Home/
```

## Trajectory viewer

`viewer.html` replays recorded episodes: the screen before every action with
the action drawn on it (tap, swipe, typed text, tool-call banner), the agent's
reasoning, and the tool's returned value. The homepage shows the featured
episodes as cards (`#example-cards`) and one task GUI-only vs hybrid
(`#task-pairs`); both read the same data.

```
viewer/data/index.json      every episode's summary (groups, titles, counts)
viewer/data/<id>.json       one episode: metadata + steps
viewer/frames/<id>/fNNN.jpg 540 x 1200 screens, one per distinct screenshot
viewer/posters/<id>.jpg     360 px card thumbnail
```

Two scripts write it. `tools/build_viewer_data.py` converts the MobileGym++
demo materials (episode folders with `trace.json` and step screenshots, plus
the metadata jsonl and app list; the folder path is the `--materials`
argument). It keeps the 27 passing Bench episodes, the 10 new-app episodes
and the two GUI-only counterparts, drops the two whose automatic check
failed, and carries the English one-line titles. `tools/sample_openmobile_data.py`
downloads the released OpenMobile-Data splits from Hugging Face, reconstructs
a fixed sample of trajectories and writes them in the same schema plus
`viewer/data/sft-index.json`, which the first script merges into
`index.json`. Rerun both after changing either source:

```bash
python3 tools/sample_openmobile_data.py
python3 tools/build_viewer_data.py
```

The Bench and new-app episodes were produced by Gemini 3.1 Pro Preview in
hybrid mode; the viewer labels them with the model. Instructions stay verbatim
(Chinese) under an English title written for the page.

## Theme

`:root` is the dark theme and `:root[data-theme="light"]` overrides the same
tokens. An inline script in `<head>` sets `data-theme` before first paint
(localStorage key `openmobile2-theme`, then `prefers-color-scheme`, then dark).
404.html carries its own copy of that script; keep the key in step.

## Deploying

GitHub Pages from `main`, folder `/ (root)`, served at
`https://os-copilot.github.io/OpenMobile2-Home/`.

Two things hardcode that address: the Open Graph tags in `<head>` (social
scrapers do not resolve relative URLs), and the root-absolute
`/OpenMobile2-Home/…` paths in `404.html` (Pages serves it for misses at any
depth). Change them together if the site moves.
