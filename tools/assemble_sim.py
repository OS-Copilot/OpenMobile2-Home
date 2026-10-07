"""Assemble the MobileGym++ build into the folder GitHub Pages serves as /OpenMobile2-Sim/.

The simulator is built in the MobileGym++ checkout (branch
codex/env-tooluse-integration of ZYY0321/mobilegym-mock, folder
trial_apps/mobilegym):

    VITE_BASE=/OpenMobile2-Sim/ VITE_CDN_BASE=https://cdn.mobilegym.dev \\
        npx vite build --outDir dist-sim --emptyOutDir

That output is 3.2 GB, almost all of it photos stored as PNG (bundled under
assets/ and per app under @app-assets/). A Pages site must stay under 1 GB, so
this script re-encodes the large raster images as WebP and renames every
reference to them in the built code, which brings the site to a few hundred MB
with nothing hosted elsewhere:

    python3 tools/assemble_sim.py --dist ../mobilegym-mock/trial_apps/mobilegym/dist-sim \\
        --out ../OpenMobile2-Sim

Steps
- copy everything except @app-assets/, the two local explorer pages and the
  Python helper scripts (rsync, so reruns are cheap);
- copy @app-assets/<App>/ for the apps whose built code references that
  folder; apps whose images Vite already bundled into assets/ do not need it;
- convert PNG/JPEG files above --min-kb to WebP (quality --quality, alpha
  kept), delete the originals and rewrite their paths in assets/*.js, *.css
  and *.json: bundled files by their unique hashed basename, app files by
  their full "<base>@app-assets/<App>/..." path; app files whose path never
  appears verbatim in the code (built at runtime) are left untouched;
- rewrite the root-absolute paths some apps hard-code (/sdcard/, /logos/,
  /icons/, /ime/) to this build's base, and /themes/ previews to the CDN;
- copy the Map app's service worker and cache from <checkout>/dist (the
  build plugin writes them there whatever --outDir is);
- copy LICENSE, LICENSE-DATA, NOTICE and DISCLAIMER.md from the checkout,
  write .nojekyll and a README.

The site page embeds the result as <iframe src="/OpenMobile2-Sim/">: a project
site of the same GitHub organisation shares the origin, so the page keeps
driving the simulator through window.__OS__ / __SIM__ / __MOBILE_GYM_TOOLS__.
"""
import argparse
import re
import shutil
import subprocess
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

from PIL import Image

SKIP_TOP = {"nav_graph_viewer.html", "run_explorer.html"}
TEXT_GLOBS = ("assets/*.js", "assets/*.css", "assets/*.json")
RASTER = {".png", ".jpg", ".jpeg"}

README = """# OpenMobile2-Sim

Static build of the MobileGym++ simulator for the OpenMobile-2 project page
(https://os-copilot.github.io/OpenMobile2-Home/), served by GitHub Pages at
`/OpenMobile2-Sim/` and embedded there as a same-origin iframe.

Built from the MobileGym++ repository with `VITE_BASE=/OpenMobile2-Sim/` and
`VITE_CDN_BASE=https://cdn.mobilegym.dev`, then assembled by
`tools/assemble_sim.py` in the page repository, which re-encodes the large
images as WebP so the site fits the Pages size limit.

Code is Apache-2.0 (see LICENSE, NOTICE); bundled app data is CC BY-NC 4.0
(see LICENSE-DATA, DISCLAIMER.md). Every rebuild replaces the whole tree.
"""


def referenced_apps(dist, base):
    """App names whose built code addresses <base>@app-assets/<App>/ literally."""
    pat = re.compile(re.escape(base) + r"@app-assets/([A-Za-z0-9_]+)/")
    found = {}
    for g in TEXT_GLOBS:
        for f in dist.glob(g):
            for m in pat.finditer(f.read_text(encoding="utf-8", errors="ignore")):
                found[m.group(1)] = found.get(m.group(1), 0) + 1
    return found


def folder_mb(path):
    """Size of the served files; a .git folder inside the target is not served."""
    return sum(p.stat().st_size for p in path.rglob("*")
               if p.is_file() and ".git" not in p.relative_to(path).parts) / 1e6


def to_webp(job):
    """Re-encode one image; returns (src, dst, ok). Runs in a worker process."""
    src, quality, keep_src = job
    dst = src.with_suffix(".webp")
    try:
        im = Image.open(src)
        alpha = im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info)
        im = im.convert("RGBA" if alpha else "RGB")
        im.save(dst, "WEBP", quality=quality + 8 if alpha else quality, method=4)
        if dst.stat().st_size >= src.stat().st_size:   # no gain: keep the original
            dst.unlink()
            return (src, None, True)
        if not keep_src:
            src.unlink()
        return (src, dst, True)
    except Exception:
        if dst.exists():
            dst.unlink()
        return (src, None, False)


def literal_paths(out, base):
    """(full image paths, path prefixes) the built code holds as string literals.

    A prefix is a string such as "<base>@app-assets/Qunaer/images/world_" that
    the code completes at runtime; files under it may be requested under their
    original name even when the same file is also named in full elsewhere.
    """
    pat = re.compile(re.escape(base) + r"[^\"'`()\s]+?\.(?:png|jpe?g)")
    # a prefix ends where a string literal ends or a template `${...}` starts
    pre = re.compile(r"[\"'`](" + re.escape(base) + r"@app-assets/[^\"'`()\s$]*?)(?:[\"'`]|\$\{)")
    found, prefixes = set(), set()
    for g in TEXT_GLOBS:
        for f in out.glob(g):
            text = f.read_text(encoding="utf-8", errors="ignore")
            found.update(pat.findall(text))
            for m in pre.finditer(text):
                if not re.search(r"\.[a-z0-9]{2,5}$", m.group(1)):
                    prefixes.add(m.group(1))
    return found, prefixes


def convert_images(out, base, min_kb, quality, workers):
    """WebP for the large rasters the code addresses by name; rewrite the references.

    Bundled files under assets/ carry hashed names and are always referenced
    literally. App files under @app-assets/ are converted only when their full
    path appears verbatim in the code: apps that build image paths at runtime
    (Reddit posts, Weather widget previews, ...) keep the original files.
    """
    literal, prefixes = literal_paths(out, base)
    jobs, keep_original = [], set()
    # numbered families (world_1.png ... world_8.png): when some members are
    # never named in the code, the app builds those names at runtime, and the
    # members it does name may be requested that way too; keep their originals
    stem = lambda f: (f.parent, re.sub(r"[_-]?\d+$", "", f.stem))
    families = {}
    app_root = out / "@app-assets"
    for f in (app_root.rglob("*") if app_root.exists() else []):
        if f.suffix.lower() in RASTER:
            families.setdefault(stem(f), []).append(base + f.relative_to(out).as_posix())
    mixed = {k for k, paths in families.items() if len(paths) > 1 and any(p not in literal for p in paths)}
    for root in (out / "assets", app_root):
        if not root.exists():
            continue
        for f in root.rglob("*"):
            if f.suffix.lower() not in RASTER or f.stat().st_size < min_kb * 1024:
                continue
            path = base + f.relative_to(out).as_posix()
            if root.name == "@app-assets":
                if path not in literal:
                    continue
                if any(path.startswith(pfx) for pfx in prefixes) or stem(f) in mixed:
                    keep_original.add(f)      # also requested under its original name
            jobs.append((f, quality, f in keep_original))
    renamed = {}
    failed = 0
    with ProcessPoolExecutor(max_workers=workers) as pool:
        for src, dst, ok in pool.map(to_webp, jobs, chunksize=16):
            if not ok:
                failed += 1
            elif dst is not None:
                renamed[src] = dst
    # references: bundled files by unique hashed basename, app files by full path
    by_name = {s.name: d.name for s, d in renamed.items() if s.parent == out / "assets"}
    by_path = {base + s.relative_to(out).as_posix(): base + d.relative_to(out).as_posix()
               for s, d in renamed.items() if s.parent != out / "assets"}
    name_pat = re.compile(r"[A-Za-z0-9_.-]+\.(?:png|jpe?g)")
    path_pat = re.compile(re.escape(base) + r"@app-assets/[^\"'`()\s]+?\.(?:png|jpe?g)")
    touched = 0
    for g in TEXT_GLOBS:
        for f in out.glob(g):
            text = f.read_text(encoding="utf-8", errors="ignore")
            new = path_pat.sub(lambda m: by_path.get(m.group(0), m.group(0)), text)
            new = name_pat.sub(lambda m: by_name.get(m.group(0), m.group(0)), new)
            new = fix_root_paths(new, base)
            if new != text:
                f.write_text(new, encoding="utf-8")
                touched += 1
    return len(jobs), len(renamed), failed, touched


ROOT_FOLDERS = ("sdcard", "logos", "icons", "ime")


def fix_root_paths(text, base):
    """Root-absolute paths the apps hard-code ("/sdcard/...", "/logos/...") only
    resolve on a root deployment; point them at this build, and theme previews
    at the MobileGym CDN."""
    for folder in ROOT_FOLDERS:
        text = re.sub(r"([\"'`])/" + folder + "/", r"\g<1>" + base + folder + "/", text)
    text = re.sub(r"([\"'`])/themes/", r"\g<1>https://cdn.mobilegym.dev/themes/", text)
    return text


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--dist", type=Path, required=True, help="vite build output (dist-sim)")
    ap.add_argument("--out", type=Path, required=True, help="target folder (the OpenMobile2-Sim checkout)")
    ap.add_argument("--base", default="/OpenMobile2-Sim/", help="VITE_BASE the build was made with")
    ap.add_argument("--quality", type=int, default=82, help="WebP quality for photos (alpha images get +8)")
    ap.add_argument("--min-kb", type=int, default=24, help="images below this size are left as they are")
    ap.add_argument("--workers", type=int, default=6)
    args = ap.parse_args()
    dist, out = args.dist.resolve(), args.out.resolve()
    checkout = dist.parent
    if not (dist / "index.html").exists():
        raise SystemExit("no index.html under " + str(dist))

    refs = referenced_apps(dist, args.base)
    keep, dropped = [], []
    for app_dir in sorted((dist / "@app-assets").iterdir()):
        (keep if app_dir.name in refs else dropped).append((app_dir.name, folder_mb(app_dir)))

    # 1. copy the tree (rsync keeps reruns cheap), without @app-assets
    out.mkdir(parents=True, exist_ok=True)
    protected = ["/.git/", "/README.md", "/.nojekyll", "/LICENSE", "/LICENSE-DATA", "/NOTICE",
                 "/DISCLAIMER.md", "/map-sw.js", "/map-cache/", "/@app-assets/"] + ["/" + n for n in SKIP_TOP]
    # excluded paths are also protected from --delete, which keeps the
    # target's .git and the files this script writes afterwards
    subprocess.run(["rsync", "-a", "--delete", "--exclude=*.py"] + ["--exclude=" + p for p in protected]
                   + [str(dist) + "/", str(out) + "/"], check=True)
    (out / "@app-assets").mkdir(exist_ok=True)
    for name, _ in keep:
        subprocess.run(["rsync", "-a", "--delete", "--exclude=*.py",
                        str(dist / "@app-assets" / name) + "/", str(out / "@app-assets" / name) + "/"], check=True)
    for stale in (out / "@app-assets").iterdir():
        if stale.name not in {n for n, _ in keep}:
            shutil.rmtree(stale)

    # 2. images
    n_jobs, n_conv, n_fail, n_text = convert_images(out, args.base, args.min_kb, args.quality, args.workers)

    # 3. the Map app's service worker and its cache
    for name in ("map-sw.js", "map-cache"):
        src, dst = checkout / "dist" / name, out / name
        if not src.exists():
            continue
        if src.is_dir():
            subprocess.run(["rsync", "-a", "--delete", str(src) + "/", str(dst) + "/"], check=True)
        else:
            shutil.copy2(src, dst)

    # 4. licences, Pages marker, README
    for lic in ("LICENSE", "LICENSE-DATA", "NOTICE", "DISCLAIMER.md"):
        src = checkout / lic
        if src.exists():
            shutil.copy2(src, out / lic)
    (out / ".nojekyll").write_text("")
    (out / "README.md").write_text(README, encoding="utf-8")

    print("kept   : " + ", ".join("%s (%.0f MB)" % k for k in keep))
    print("dropped: " + ", ".join("%s (%.0f MB)" % d for d in dropped))
    print("images : %d candidates, %d converted to WebP, %d failed, %d code files rewritten"
          % (n_jobs, n_conv, n_fail, n_text))
    print("site size %.0f MB" % folder_mb(out))


if __name__ == "__main__":
    main()
