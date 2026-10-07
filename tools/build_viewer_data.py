"""Convert the MobileGym++ demo materials into the trajectory viewer's data.

Input: the materials folder prepared by the MobileGym++ team
(mobilegympp-demo-materials-v2). Each episode directory holds task.json,
trace.json and step_NNN_{before,after}.jpg; the metadata jsonl files carry
difficulty, scope, success and the app-native tool calls.

    python3 tools/build_viewer_data.py [--materials DIR] [--out viewer] [--force]

Writes  viewer/data/<id>.json          one file per episode (schema below)
        viewer/frames/<id>/fNNN.jpg    540 x 1200 frames, one per distinct screenshot
        viewer/posters/<id>.jpg        360 px wide card thumbnail (the poster frame)
        viewer/data/index.json         every episode's summary, merged with
                                       viewer/data/sft-index.json when present
                                       (written by tools/sample_openmobile_data.py)

Episode schema: id, group, source, model, mode, title, instruction, apps,
appNames, difficulty, scope, success, featured, pair, note, poster,
frames {dir, count, w, h}, steps [{n, before, after, app, route, thought,
action, call {name, args}, kind, ok, uiEffect, result}].
Frame k is the screen before step k+1; the last frame is the final screen.
Coordinates stay on the source's normalised 0-1000 scale.
"""
import argparse
import json
import re
from datetime import date
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
MATERIALS = Path.home() / "Downloads" / "mobilegympp-demo-materials-v2"
FRAME_W, FRAME_H, JPEG_QUALITY = 540, 1200, 78
POSTER_W = 360
MODEL = "Gemini 3.1 Pro Preview"

# Episodes the team excluded: the automatic check failed (00-先读.md).
EXCLUDE = {"case10", "case30"}

# Homepage order, from 00-先读.md.
FEATURED = ["case74", "case29", "case37", "case07", "case73",
            "case70", "case57", "case51", "case18", "case38"]

# English one-line goals (page copy; the Chinese instruction stays verbatim).
TITLES = {
    "case01": "Find the largest Alipay expense and note it as a spending reminder",
    "case02": "Find the cheapest new fan on eBay, check the Alipay balance left, note both",
    "case03": "Find the cheapest computer and TV on eBay, note both prices and the balance left",
    "case05": "Find the cheapest fan on eBay and note its title and price",
    "case06": "Send Chen Jing the cheapest new fan on eBay, shipping included",
    "case07": "Price the cheapest fan on eBay, note the balance after buying, ask Chen Jing to join",
    "case08": "Compare Alipay spending in Jan 2026 and Dec 2025 and note the difference",
    "case15": "Summarise the two newest notes in a Moments post",
    "case16": "Recommend the cheapest fan on eBay in a RedNote post with its full title",
    "case18": "Message a followed RedNote creator, then tell Chen Jing on WeChat",
    "case23": "Find the top-rated history book in WeRead and send it to Chen Jing",
    "case24": "Find the day with the most reading time in WeRead this week and tell Chen Jing",
    "case29": "Find the top travel author's most-saved RedNote post and send its stats to Chen Jing",
    "case33": "Find the best-rated cafe within 2 km on Maps and send it to Chen Jing",
    "case34": "Look up the Forbidden City's address on Maps and send it to Chen Jing",
    "case37": "Send Chen Jing the National Museum's address with the city's current weather",
    "case38": "Build a two-artist Spotify playlist with two songs each and play it",
    "case40": "Note which of Beijing's next five days stay dry",
    "case44": "Find the nearest place serving what Chen Jing craves and text Zhang San the address",
    "case51": "If tomorrow 03:30 is free, book a Tencent Meeting, add it to Calendar, share the ID",
    "case57": "Move the file the boss asked for into Documents/submission and reply with its name",
    "case67": "Check out one hoodie from the Taobao cart and pay",
    "case70": "Search Taobao for a hand cream, buy it and complete payment",
    "case72": "Set an alarm 10 minutes before the release deadline and note the details",
    "case73": "Add a prep day a week before the earliest Days Matter deadline and tell Mia Wang",
    "case74": "Restock the Office pantry list from Notes into the TB Instant cart, one of each",
    "case75": "Schedule gift prep a week before Mia's birthday and tell Alice Chen the date",
    "dida-n201": "Count today's high-priority TickTick tasks and note their titles",
    "dida-n202": "Note every open task in TickTick's first quadrant",
    "dida-n205": "Count high-priority open tasks in TickTick's second quadrant",
    "drive-n201": "Note the full names of every starred file in Drive",
    "drive-n202": "Star the survey draft in Drive's Papers folder",
    "drive-n206": "Find the owner of a shared NeurIPS file in Drive and note the name",
    "mail-n201": "Note the subjects of all three unread emails",
    "mail-n202": "Flag the ConfHub email about an author comment",
    "mail-n203": "Mark the failed Nimbus payment email as read",
    "mail-n208": "Find the email whose body mentions a paper title and note its sender and subject",
}

GROUPS = [
    {"id": "bench", "label": "Bench episodes",
     "note": "MobileGym++ Bench tasks run in hybrid mode by " + MODEL + "."},
    {"id": "newapps", "label": "New apps",
     "note": "TickTick, Drive and Mail tasks in hybrid mode by " + MODEL + "."},
    {"id": "gui", "label": "GUI-only counterparts",
     "note": "The same instruction with the app-native tools switched off."},
    {"id": "sft", "label": "OpenMobile-Data",
     "note": "Training trajectories sampled from the released dataset."},
]


def load_meta(materials):
    meta = {}
    for name in ("v5-hybrid-results.jsonl", "newapps-v2-results.jsonl"):
        with open(materials / "metadata" / name, encoding="utf-8") as fh:
            for line in fh:
                row = json.loads(line)
                meta[row["task_id"]] = row
    return meta


def load_app_names(materials):
    with open(materials / "apps" / "installed-apps.json", encoding="utf-8") as fh:
        apps = json.load(fh)
    return {a["id"]: a["displayNameEn"] for a in apps if a.get("desktop")}


def parse_response(text):
    """Split a model turn into its Thought and Action lines."""
    head = text.split("<tool_call>", 1)[0]
    thought, action = head.strip(), ""
    m = re.search(r"Thought:\s*(.*?)(?:\n\s*Action:\s*(.*))?$", head.strip(), re.S)
    if m:
        thought = m.group(1).strip()
        action = (m.group(2) or "").strip()
    return thought, action


def truncate(value, max_items=8, max_chars=400):
    """Shorten a tool result for the page; returns (value, was_cut)."""
    cut = False
    if isinstance(value, dict):
        out = {}
        for k, v in value.items():
            out[k], c = truncate(v, max_items, max_chars)
            cut = cut or c
        return out, cut
    if isinstance(value, list):
        out = []
        for v in value[:max_items]:
            t, c = truncate(v, max_items, max_chars)
            out.append(t)
            cut = cut or c
        return out, cut or len(value) > max_items
    if isinstance(value, str) and len(value) > max_chars:
        return value[:max_chars] + "…", True
    return value, cut


def short_id(task_id):
    """hybrid_tools_newapps_v2.HTV1MailN208BodyOnlyPaperTitle -> mail-n208"""
    m = re.search(r"HTV1([A-Z][a-z]+)N(\d+)", task_id)
    return m.group(1).lower() + "-n" + m.group(2)


def build_episode(src, ep_id, group, mode, meta, app_names, title_key, extra):
    task = json.loads((src / "task.json").read_text(encoding="utf-8"))
    trace = json.loads((src / "trace.json").read_text(encoding="utf-8"))
    row = meta.get(task["task_id"], {})
    steps = []
    for s in trace["trace"]:
        call = s.get("call") or {}
        name = call.get("name", "")
        args = call.get("arguments", {}) or {}
        kind = args.get("action", "") if name == "mobile_use" else "tool"
        thought, action = parse_response(s.get("response", ""))
        fb = s.get("feedback") or {}
        result, cut = (None, False)
        if kind == "tool":
            result, cut = truncate(fb.get("output"))
        after = s.get("route_after") or {}
        steps.append({
            "n": s["step"],
            "before": s["step"] - 1,
            "after": s["step"],
            "app": s.get("current_app", ""),
            "route": (after.get("app", "") + after.get("path", "")) if after else "",
            "thought": thought,
            "action": action,
            "call": {"name": name, "args": args},
            "kind": kind,
            "ok": fb.get("ok"),
            "uiEffect": s.get("ui_effect"),
            "result": result,
            "resultTruncated": cut,
        })
    n = len(steps)
    tool_calls = sum(1 for s in steps if s["kind"] == "tool")
    poster = next((s["after"] for s in steps if s["kind"] == "tool"), None)
    if poster is None:
        poster = max(1, round(n * 0.6))
    ep = {
        "id": ep_id,
        "group": group,
        "source": extra.get("source", ""),
        "model": MODEL,
        "mode": mode,
        "title": TITLES[title_key],
        "instruction": task["instruction"],
        "apps": task["apps"],
        "appNames": [app_names.get(a, a) for a in task["apps"]],
        "difficulty": task.get("difficulty"),
        "scope": task.get("scope"),
        "success": extra.get("success", row.get("success")),
        "featured": extra.get("featured"),
        "pair": extra.get("pair"),
        "note": extra.get("note", ""),
        "poster": poster,
        "steps": n,
        "toolCalls": tool_calls,
        "frames": {"dir": "viewer/frames/%s/" % ep_id, "count": n + 1, "w": FRAME_W, "h": FRAME_H},
    }
    return ep, steps


def write_frames(src, ep, out, force):
    """One frame per distinct screenshot; after[i] equals before[i+1] in this data."""
    fdir = out / "frames" / ep["id"]
    fdir.mkdir(parents=True, exist_ok=True)
    n = ep["steps"]
    sources = [src / "step_001_before.jpg"] + [src / ("step_%03d_after.jpg" % i) for i in range(1, n + 1)]
    for k, path in enumerate(sources):
        dst = fdir / ("f%03d.jpg" % k)
        if dst.exists() and not force:
            continue
        img = Image.open(path).convert("RGB")
        if img.size != (FRAME_W, FRAME_H):
            img = img.resize((FRAME_W, FRAME_H), Image.LANCZOS)
        img.save(dst, "JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True)


def write_poster(ep, out, force):
    """Card thumbnail: the poster frame at 360 px wide (viewer/posters/<id>.jpg)."""
    frames = out / "frames" / ep["id"]
    if ep.get("poster") is None:
        ep["poster"] = max(0, ep["frames"]["count"] // 2)
    src = frames / ("f%03d.jpg" % ep["poster"])
    if not src.exists():
        src = frames / ("f%03d.jpg" % max(0, ep["frames"]["count"] - 1))
    dst = out / "posters" / (ep["id"] + ".jpg")
    dst.parent.mkdir(parents=True, exist_ok=True)
    if (dst.exists() and not force) or not src.exists():
        return
    img = Image.open(src).convert("RGB")
    w = POSTER_W
    img = img.resize((w, round(img.height * w / img.width)), Image.LANCZOS)
    img.save(dst, "JPEG", quality=72, optimize=True, progressive=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--materials", type=Path, default=MATERIALS)
    ap.add_argument("--out", type=Path, default=ROOT / "viewer")
    ap.add_argument("--force", action="store_true", help="rewrite frames that already exist")
    args = ap.parse_args()
    materials, out = args.materials, args.out
    meta = load_meta(materials)
    app_names = load_app_names(materials)
    (out / "data").mkdir(parents=True, exist_ok=True)

    plan = []  # (src dir, id, group, mode, title key, extra)
    for src in sorted((materials / "v5-hybrid").iterdir()):
        case = src.name
        if not case.startswith("case") or case in EXCLUDE:
            continue
        extra = {"source": "MobileGym++ Bench, hybrid_tools_v5 run"}
        if case in FEATURED:
            extra["featured"] = FEATURED.index(case) + 1
        if case == "case74":
            extra["pair"] = "bench-case74-gui"
        if case == "case73":
            extra["pair"] = "bench-case73-gui"
        plan.append((src, "bench-" + case, "bench", "hybrid", case, extra))
    for src in sorted((materials / "newapps-v2-bonus").iterdir()):
        key = short_id(src.name)
        plan.append((src, "newapps-" + key, "newapps", "hybrid", key,
                     {"source": "MobileGym++ new apps, newapps-v2 run"}))
    # GUI-only counterparts; both passed the automatic check (01-仓库和产物在哪.md).
    plan.append((materials / "v5-gui-only" / "case74", "bench-case74-gui", "gui", "gui_only", "case74",
                 {"source": "MobileGym++ Bench, hybrid_tools_v5 run, GUI-only", "success": True,
                  "pair": "bench-case74", "note": "Same task and run matrix as the hybrid episode."}))
    plan.append((materials / "v6-gui-only" / "case73", "bench-case73-gui", "gui", "gui_only", "case73",
                 {"source": "MobileGym++ Bench, v6 run, GUI-only", "success": True,
                  "pair": "bench-case73",
                  "note": "Same instruction as the hybrid episode; recorded in the later v6 run."}))

    summaries = []
    for src, ep_id, group, mode, key, extra in plan:
        ep, steps = build_episode(src, ep_id, group, mode, meta, app_names, key, extra)
        write_frames(src, ep, out, args.force)
        full = dict(ep)
        full["steps"] = steps
        (out / "data" / (ep_id + ".json")).write_text(
            json.dumps(full, ensure_ascii=False, indent=1), encoding="utf-8")
        summaries.append(ep)
        print("%-22s %-8s %2d steps %2d tools  %s" % (ep_id, mode, ep["steps"], ep["toolCalls"], ep["title"]))

    sft_index = out / "data" / "sft-index.json"
    if sft_index.exists():
        summaries += json.loads(sft_index.read_text(encoding="utf-8"))
    for ep in summaries:
        write_poster(ep, out, args.force)
    index = {"generated": date.today().isoformat(), "groups": GROUPS, "episodes": summaries}
    (out / "data" / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8")
    print("%d episodes -> %s" % (len(summaries), out / "data" / "index.json"))


if __name__ == "__main__":
    main()
