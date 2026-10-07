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
static/js/main.js        theme toggle, nav, reveal-on-scroll, BibTeX copy
public/
  logo.png / logo.webp   the project mark (nav, footer, favicons); interim: the
                         OpenMobile v1 robot, to be replaced by the v2 mark
  favicon*.png .ico      derived from logo.png
  apple-touch-icon.png   180x180, on the dark background
  logos/projects/        marks for the "More research" menu
tools/build_icons.py     regenerates logo.webp and every favicon from public/logo.png
```

## Components

Every component is `OM2Widgets.<name>(element, options)` and returns
`{ el, destroy() }` plus its own methods. They read `window.OM2` (the data
file) and the CSS custom properties, so a number changes in one place and a
colour in one place. Charts re-render on container resize and on the
`openmobile2:theme` event, which the theme toggle dispatches.

| Mount | Component | Shows |
| --- | --- | --- |
| `#app-wall` | `appWall` | all 125 apps on a phone, by domain and runtime |
| `#chart-domains` | `domainCoverage` | apps per domain, simulated vs emulator |
| `#crossapp` | `crossApp` | the four cross-app mechanisms |
| `#construction-steps` | `stepper` | how a commercial app is rebuilt |
| `#env-compare` | `envCompare` | Table 1 of the paper |
| `#pipeline-steps` | `stepper` | how OpenMobile-Data is collected |
| `#task-lanes` | `taskLanes` | one Bench task, GUI-only and hybrid |
| `#tool-schemas` | `toolSchemas` | the Taobao tool signatures |
| `#chart-bench` | `benchComposition` | MobileGym++ Bench by app count and domain |
| `#results-table` | `resultsTable` | Table 2 of the paper, sortable |
| `#chart-stages` | `stageChart` | the four training stages per benchmark |
| `#chart-coverage` | `coverageScaling` | environment coverage at a fixed budget |
| `#chart-tools` | `toolDumbbell` | GUI-only vs hybrid success per model |

## Filling in what is left

- **Links.** Release links are parked: `class="btn pending"` in the hero and
  `class="card feature pending-card"` under Resources, with no `href`. For each,
  drop the class and add the `href`. `data-link` names the artifact: `paper`,
  `code`, `environment`, `data`, `models`.
- **Byline, news, venue, BibTeX, GitHub button, social card.** Search `TODO`.
- **Numbers.** Every value in `om2-data.js` follows the ICLR 2027 submission;
  re-check against the camera-ready before release.

## Live demo

`sim/` is a static build of the simulator, served from this origin so the page
can drive it through `window.__OS__` / `__SIM__` (see `static/js/om2-live.js`).
The prototype build is the public MobileGym base; the MobileGym++ clients
replace it when released. Rebuild from `../mobilegym`:

```bash
cd ../mobilegym
VITE_BASE=/OpenMobile2-Home/sim/ VITE_CDN_BASE=/OpenMobile2-Home/sim/cdn npm run build
rsync -a --delete --exclude cdn/ dist/ ../OpenMobile2-Home/sim/
```

`sim/cdn/` holds the theme files the launcher requests at boot, mirrored from
the companion dataset. The build is gitignored for now (about 350 MB; trim the
app bundles and sample media before it is committed or moved to its own repo).
Locally, serve the parent folder so the paths match GitHub Pages:

```bash
cd .. && python3 -m http.server 8921   # then http://localhost:8921/OpenMobile2-Home/
```

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
