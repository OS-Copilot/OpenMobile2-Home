#!/usr/bin/env python3
"""Sample OpenMobile-Data trajectories for the static trajectory viewer.

Downloads the three ``train.json`` files of the public Hugging Face dataset
``OpenMobile-2/OpenMobile-Data`` into a cache, reconstructs full trajectories
from the per-step records, builds the fixed set of 20 episodes in ``SELECTED``
and writes them in the viewer schema:

    viewer/data/<id>.json          one episode per file
    viewer/data/sft-index.json     summaries of all episodes
    viewer/frames/<id>/fNNN.jpg    screenshots, 540 px wide, JPEG quality 78

Usage:
    python3 tools/sample_openmobile_data.py --cache /path/to/cache          # build
    python3 tools/sample_openmobile_data.py --cache /path/to/cache --list   # candidates

Record structure (verified on all three splits). Each train.json is one JSON
array of per-step records ``{"id", "messages", "images"}`` with
``id = "<split>::<subset>/<trajectory>::step<k>"``. ``messages`` is the whole
conversation up to step k: a system prompt with the tool definitions, a user
message ``"The user query: <task>"`` followed by an image marker, then one
assistant turn per step (``"Thought: ..."`` plus exactly one ``<tool_call>``)
and one tool message after each turn. Only the last three screenshots are kept
per record (``images``; older markers read "This screenshot has been
collapsed."), so the record with the highest step number carries the full
trajectory text. Some step records were dropped from the training set, but
the history inside the remaining records is complete. In the hybrid split a
tool message can state ``"Foreground app changed to <app>"`` and, for
navigation tools, a JSON line with the tool's return value. Screenshots live at
``<split>/trajectories/<subset>/<trajectory>/screenshot_step<k>.png``; no
trajectory has a screenshot after its final action.

Selection. Candidate pools are deterministic: trajectories with 5 to 16 steps
(emulator: no CJK character in the instruction; hybrid: at least one
app-native tool call), sorted by name and shuffled with ``SEED``; ``--list``
prints them. Episodes were taken in that order, skipping a trajectory when one
of its apps was already used in the split, when a hybrid name belongs to a
template-generated ``G...`` batch, when a cross_app instruction involves a
single app, or when a gui-only instruction is of the templated "What is
shown ..." form. The result is pinned in ``SELECTED`` so a rerun writes the
same set.
"""
import argparse
import json
import posixpath
import random
import re
import shutil
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
HF_FILE = "https://huggingface.co/datasets/OpenMobile-2/OpenMobile-Data/resolve/main/"
HF_TREE = "https://huggingface.co/api/datasets/OpenMobile-2/OpenMobile-Data/tree/main/"

# split key -> (train.json path in the dataset, record id prefix, episode id prefix, mode)
SPLITS = {
    "emulator": ("emulator/train.json", "emulator::", "sft-emu", "gui_only"),
    "gui-only": ("simulator/gui-only/train.json", "simulator::gui-only/", "sft-gui", "gui_only"),
    "hybrid": ("simulator/hybrid/train.json", "simulator::hybrid/", "sft-hyb", "hybrid"),
}

SEED = 20261007
MIN_STEPS, MAX_STEPS = 5, 16
FRAME_WIDTH = 540
JPEG_QUALITY = 78
TITLE_MAX = 90
RESULT_MAX_ITEMS = 8
RESULT_MAX_CHARS = 400

APP_NAMES = {
    "audio_recorder": "Audio Recorder", "bilibili": "Bilibili", "broadcast": "Podcasts",
    "cainiao": "Cainiao", "contacts": "Contacts", "ctrip": "Ctrip", "dida": "TickTick",
    "didi": "Didi", "draw": "Draw", "fdroid": "F-Droid", "file_manager": "Files",
    "files": "Files", "jingdong": "JD.com", "joplin": "Joplin", "mail": "Mail",
    "mastodon": "Mastodon", "mixplorer": "MiXplorer", "notes": "Notes",
    "pinduoduo": "Pinduoduo", "railway12306": "Railway 12306",
    "simple_sms_messenger": "Simple SMS Messenger", "suning": "Suning",
    "taodian": "Taodian", "tasks": "Tasks", "wechat": "WeChat", "weibo": "Weibo",
}

# (record id prefix, app ids, title). A None title reuses an English instruction
# of at most TITLE_MAX characters. Hybrid app ids are cross-checked against the
# foreground apps stated in the data.
SELECTED = [
    # emulator / cross_app
    ("emulator::cross_app/403_DrawOpenApp", ["draw", "tasks"],
     "Draw a blue line in Draw and share it to a new Tasks task titled 'Blue Line Draft'"),
    ("emulator::cross_app/2770_ReadQwen3PaperTask1", ["files", "mail"],
     "Share the Qwen3 Technical Report PDF from Files via Mail to david@research.com"),
    ("emulator::cross_app/388_AudioRecorderOpenApp", ["audio_recorder", "mixplorer"],
     "Empty the Audio Recorder trash, then clear the MiXplorer recycle bin"),
    ("emulator::cross_app/1795_ContactsNewContactDraft", ["contacts", "joplin"],
     "Open the Contacts privacy policy link and share its URL to Joplin"),
    # emulator / single_app
    ("emulator::single_app/4451_CheckPuchasedItem", ["taodian"],
     "Open the Taodian cart, select every item and delete them"),
    ("emulator::single_app/3378_MastodonManageMultiListTask", ["mastodon"],
     "Post a Mastodon poll asking for a favorite programming language with three options"),
    ("emulator::single_app/402_FDroidOpenApp", ["fdroid"],
     "Set F-Droid to check for updates weekly and install them in the background"),
    ("emulator::single_app/1925_SimpleSmsResend", ["simple_sms_messenger"],
     "Report the MMS resize limit and the Recycle Bin setting in Simple SMS Messenger"),
    # simulator / gui-only (the instructions are English; titles drop the
    # 「」 brackets and the trailing period, nothing else)
    ("simulator::gui-only/1636_Wechat", ["wechat"],
     "Send a picture to 王芳 on WeChat"),
    ("simulator::gui-only/129_Bilibili", ["bilibili"],
     "Change the Bilibili search keyword to 凡人修仙传 from the results page"),
    ("simulator::gui-only/1021_Pinduoduo", ["pinduoduo"],
     "Search Pinduoduo for toilet paper and favorite the 18-roll unbleached pack"),
    ("simulator::gui-only/315_Ctrip", ["ctrip"],
     "Read the guest reviews for the Sea·观海栖宿 seaview homestay on Ctrip"),
    ("simulator::gui-only/1277_Suning", ["suning"],
     "Add a new shipping address on Suning and enter the recipient's name"),
    ("simulator::gui-only/448_Didi", ["didi"],
     "Set up family and friend pay in DiDi so someone else can pay for my rides"),
    # simulator / hybrid
    ("simulator::hybrid/108_BroadcastUnknownQueue", ["broadcast"],
     "Queue the No One Knows episode on what investors get wrong in cycles, then follow the show"),
    ("simulator::hybrid/1397_RailwayLinaOrder", ["railway12306", "wechat"],
     "Send Li Na the train number of the completed Hangzhou East to Shanghai Hongqiao order"),
    ("simulator::hybrid/1681_WeiboLikeTravel318", ["weibo"],
     "Like Azhen's Weibo post about driving the G318 over the pass to the sunlit golden peaks"),
    ("simulator::hybrid/409_FileManagerDidaVendorKeep", ["file_manager", "dida"],
     "Add a TickTick task 'keep vendor_list_0.xlsx' for the vendor list marked do-not-delete"),
    ("simulator::hybrid/126_CainiaoHardOfficialNote", ["cainiao", "notes"],
     "Save the official Cainiao Express parcel's tracking number to a Notes note"),
    ("simulator::hybrid/1180_JingdongFavCheaperBuds", ["jingdong"],
     "Compare two wireless earbuds on JD.com and favorite only the cheaper pair"),
]

FUNC_RE = re.compile(r"<function=([^>\s]+)>(.*?)</function>", re.S)
PARAM_RE = re.compile(r"<parameter=([^>\s]+)>(.*?)</parameter>", re.S)
FOREGROUND_RE = re.compile(r"Foreground app changed to ([^\s.]+)")
JSON_LIKE_RE = re.compile(r'^(\[|\{|"|-?\d+(\.\d+)?$|true$|false$|null$)')
LATIN_RE = re.compile(r"[A-Za-z]")
CJK_RE = re.compile(r"[一-鿿]")
IMAGE_MARKERS = ("<image>", "This screenshot has been collapsed.")
QUERY_PREFIX = "The user query: "


# ---------------------------------------------------------------- download

def fetch(url, dest, retries=3):
    """Download url to dest unless it is cached; write via a .part file."""
    dest = Path(dest)
    if dest.exists():
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    part = dest.with_name(dest.name + ".part")
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "openmobile2-home-viewer/1.0"})
            with urllib.request.urlopen(req, timeout=300) as resp, open(part, "wb") as out:
                shutil.copyfileobj(resp, out, 1 << 20)
            part.replace(dest)
            return dest
        except (OSError, urllib.error.URLError):
            if attempt == retries - 1:
                raise
            time.sleep(2 * (attempt + 1))


def list_files(dir_path):
    """Return the file names directly under a dataset directory."""
    req = urllib.request.Request(HF_TREE + dir_path, headers={"User-Agent": "openmobile2-home-viewer/1.0"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        entries = json.load(resp)
    return {e["path"].rsplit("/", 1)[1] for e in entries if e["type"] == "file"}


# ---------------------------------------------------------------- parsing

def iter_records(path, chunk=1 << 23):
    """Yield the objects of a large JSON array without loading the whole file."""
    decoder = json.JSONDecoder()
    with open(path, encoding="utf-8") as f:
        buf = f.read(chunk)
        pos = buf.index("[") + 1
        while True:
            while pos < len(buf) and buf[pos] in " \t\r\n,":
                pos += 1
            if pos >= len(buf) or buf[pos] == "]":
                more = f.read(chunk)
                if not more:
                    return
                buf, pos = buf[pos:] + more, 0
                continue
            try:
                obj, end = decoder.raw_decode(buf, pos)
            except json.JSONDecodeError:
                more = f.read(chunk)
                if not more:
                    raise
                buf, pos = buf[pos:] + more, 0
                continue
            pos = end
            yield obj


def last_records(path, wanted=None):
    """Map trajectory prefix -> its highest-step record (full history)."""
    best = {}
    for rec in iter_records(path):
        prefix, step = rec["id"].rsplit("::step", 1)
        if wanted is not None and prefix not in wanted:
            continue
        step = int(step)
        if prefix not in best or step > best[prefix][0]:
            best[prefix] = (step, rec)
    return {prefix: rec for prefix, (step, rec) in best.items()}


def strip_image_markers(text):
    lines = text.rstrip().split("\n")
    while lines and lines[-1].strip() in IMAGE_MARKERS:
        lines.pop()
    return "\n".join(lines).strip()


def parse_value(name, raw):
    """Parameter values that look like JSON are parsed; typed text stays a string."""
    raw = raw.strip()
    if name == "text" or not JSON_LIKE_RE.match(raw):
        return raw
    try:
        return json.loads(raw)
    except ValueError:
        return raw


def parse_assistant(content):
    """Split an assistant turn into (thought, action line, tool call)."""
    head, _, tail = content.partition("<tool_call>")
    thought = head.strip()
    if thought.startswith("Thought:"):
        thought = thought[len("Thought:"):].strip()
    action_lines = re.findall(r"^Action:[ \t]*(.*)$", head, re.M)
    action = action_lines[-1].strip() if action_lines else ""
    calls = FUNC_RE.findall(tail)
    if len(calls) != 1:
        raise ValueError(f"expected one tool call, found {len(calls)}")
    name, body = calls[0]
    args = {k: parse_value(k, v) for k, v in PARAM_RE.findall(body)}
    return thought, action, {"name": name, "args": args}


def parse_tool(content):
    """Return (foreground app or None, embedded tool result or None)."""
    match = FOREGROUND_RE.search(content)
    result = None
    for line in content.split("\n"):
        if not line.startswith("{"):
            continue
        obj = json.loads(line)
        if isinstance(obj, dict) and obj.get("type") != "function":  # skip tool definitions
            result = obj
            break
    return (match.group(1) if match else None), result


def truncate(value, flag):
    """Cut long strings and arrays in a tool result; flag[0] records any cut."""
    if isinstance(value, str) and len(value) > RESULT_MAX_CHARS:
        flag[0] = True
        return value[:RESULT_MAX_CHARS]
    if isinstance(value, list):
        if len(value) > RESULT_MAX_ITEMS:
            flag[0] = True
            value = value[:RESULT_MAX_ITEMS]
        return [truncate(v, flag) for v in value]
    if isinstance(value, dict):
        return {k: truncate(v, flag) for k, v in value.items()}
    return value


def reconstruct(prefix, rec, train_path):
    """Turn the highest-step record of a trajectory into steps plus metadata."""
    msgs = rec["messages"]
    if msgs[0]["role"] != "system" or msgs[1]["role"] != "user":
        raise ValueError(f"{prefix}: unexpected leading roles")
    query = msgs[1]["content"]
    if not query.startswith(QUERY_PREFIX):
        raise ValueError(f"{prefix}: user message without query prefix")
    instruction = strip_image_markers(query[len(QUERY_PREFIX):])

    steps = []
    app = ""
    for i in range(2, len(msgs), 2):
        if msgs[i]["role"] != "assistant":
            raise ValueError(f"{prefix}: message {i} is not an assistant turn")
        thought, action, call = parse_assistant(msgs[i]["content"])
        result = None
        if i + 1 < len(msgs):
            if msgs[i + 1]["role"] != "tool":
                raise ValueError(f"{prefix}: message {i + 1} is not a tool message")
            foreground, result = parse_tool(msgs[i + 1]["content"])
            if foreground:
                app = foreground
        route = ""
        if isinstance(result, dict):
            output = result.get("output")
            route = str(output.get("route", "")) if isinstance(output, dict) else ""
            flag = [False]
            result = truncate(result, flag)
            if flag[0]:
                result["_truncated"] = True
        native = call["name"] != "mobile_use"
        steps.append({
            "app": app,
            "route": route,
            "thought": thought,
            "action": action,
            "call": call,
            "kind": "tool" if native else str(call["args"].get("action", "")),
            "result": result if native else None,
        })

    # Screenshot directory, resolved from the record's own image paths.
    image_dir = posixpath.dirname(posixpath.normpath(
        posixpath.join(posixpath.dirname(train_path), rec["images"][-1])))
    foreground_apps = []
    for s in steps:
        if s["app"] and s["app"] != "launcher" and s["app"] not in foreground_apps:
            foreground_apps.append(s["app"])
    return {
        "prefix": prefix,
        "name": prefix.rsplit("/", 1)[1],
        "subset": prefix.split("::", 1)[1].split("/", 1)[0],
        "instruction": instruction,
        "steps": steps,
        "image_dir": image_dir,
        "foreground_apps": foreground_apps,
        "tool_calls": sum(1 for s in steps if s["kind"] == "tool"),
    }


def is_english(text):
    return len(LATIN_RE.findall(text)) > len(CJK_RE.findall(text))


def episode_id(split, name):
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return f"{SPLITS[split][2]}-{slug}"


# ---------------------------------------------------------------- candidates

def name_key(name):
    num, _, rest = name.partition("_")
    return (int(num) if num.isdigit() else 10 ** 9, rest)


def ranked_candidates(split, trajs):
    """Deterministic candidate order per bucket (emulator: cross_app, single_app)."""
    buckets = {}
    for t in trajs.values():
        n = len(t["steps"])
        if not MIN_STEPS <= n <= MAX_STEPS:
            continue
        if split == "emulator" and CJK_RE.search(t["instruction"]):
            continue
        if split == "hybrid" and t["tool_calls"] == 0:
            continue
        buckets.setdefault(t["subset"], []).append(t)
    for pool in buckets.values():
        pool.sort(key=lambda t: name_key(t["name"]))
        random.Random(SEED).shuffle(pool)
    return buckets


def print_candidates(cache, limit):
    for split, (train_path, id_prefix, _, _) in SPLITS.items():
        path = fetch(HF_FILE + train_path, cache / train_path)
        trajs = {p: reconstruct(p, r, train_path) for p, r in last_records(path).items()}
        for bucket, pool in sorted(ranked_candidates(split, trajs).items()):
            print(f"\n== {split} / {bucket}: {len(pool)} candidates, first {limit}")
            for t in pool[:limit]:
                apps = ",".join(t["foreground_apps"]) or "-"
                print(f"  {t['name']:36s} steps={len(t['steps']):2d} tools={t['tool_calls']} "
                      f"apps={apps}  {t['instruction'][:150]}")


# ---------------------------------------------------------------- build

def write_frames(image_dir, n_steps, cache, frame_dir):
    """Download the trajectory's screenshots and write resized JPEG frames."""
    available = list_files(image_dir)
    names = [f"screenshot_step{k}.png" for k in range(n_steps)]
    missing = [f for f in names if f not in available]
    if missing:
        raise SystemExit(f"{image_dir}: missing screenshots {missing}")
    if f"screenshot_step{n_steps}.png" in available:  # screenshot after the final action
        names.append(f"screenshot_step{n_steps}.png")
    frame_dir.mkdir(parents=True, exist_ok=True)
    for stale in frame_dir.glob("f*.jpg"):
        stale.unlink()
    size = None
    for idx, fname in enumerate(names):
        png = fetch(HF_FILE + image_dir + "/" + fname, cache / image_dir / fname)
        with Image.open(png) as im:
            im = im.convert("RGB")
            h = round(im.height * FRAME_WIDTH / im.width)
            if size is None:
                size = (FRAME_WIDTH, h)
            elif size != (FRAME_WIDTH, h):
                raise SystemExit(f"{image_dir}/{fname}: size {im.size} differs from earlier frames")
            im.resize(size, Image.LANCZOS).save(
                frame_dir / f"f{idx:03d}.jpg", quality=JPEG_QUALITY, progressive=True, optimize=True)
    return len(names), size


def build(cache, out):
    out = Path(out)
    if not out.is_absolute():
        out = ROOT / out
    data_dir, frames_root = out / "data", out / "frames"
    data_dir.mkdir(parents=True, exist_ok=True)

    wanted = {prefix: (apps, title) for prefix, apps, title in SELECTED}
    trajs = {}
    for split, (train_path, id_prefix, _, _) in SPLITS.items():
        want = {p for p in wanted if p.startswith(id_prefix)}
        path = fetch(HF_FILE + train_path, cache / train_path)
        found = last_records(path, want)
        missing = want - set(found)
        if missing:
            raise SystemExit(f"{split}: trajectories not found: {sorted(missing)}")
        for p, r in found.items():
            trajs[p] = (split, reconstruct(p, r, train_path))

    index = []
    total_frames = total_bytes = 0
    for prefix, apps, title in SELECTED:
        split, t = trajs[prefix]
        if split == "hybrid" and t["foreground_apps"] != apps:
            raise SystemExit(f"{prefix}: apps {apps} differ from foreground apps {t['foreground_apps']}")
        if title is None:
            if not is_english(t["instruction"]) or len(t["instruction"]) > TITLE_MAX:
                raise SystemExit(f"{prefix}: needs a hand-written title")
            title = t["instruction"]
        if len(title) > TITLE_MAX:
            raise SystemExit(f"{prefix}: title longer than {TITLE_MAX} characters")

        eid = episode_id(split, t["name"])
        frame_dir = frames_root / eid
        n_frames, (w, h) = write_frames(t["image_dir"], len(t["steps"]), cache, frame_dir)
        steps = []
        for k, s in enumerate(t["steps"]):
            steps.append({
                "n": k + 1,
                "before": k,
                "after": k + 1 if k + 1 < n_frames else k,
                "app": s["app"], "route": s["route"],
                "thought": s["thought"], "action": s["action"],
                "call": s["call"], "kind": s["kind"],
                "ok": None, "uiEffect": None, "result": s["result"],
            })
        source_top = "emulator" if split == "emulator" else "simulator"
        summary = {
            "id": eid,
            "group": "sft",
            "source": f"OpenMobile-Data / {source_top} / {t['subset']}",
            "model": "OpenMobile-Data trajectory",
            "mode": SPLITS[split][3],
            "title": title,
            "instruction": t["instruction"],
            "apps": apps,
            "appNames": [APP_NAMES[a] for a in apps],
        }
        episode = dict(summary)
        episode.update({
            "difficulty": None, "scope": None, "success": None,
            "frames": {"dir": frame_dir.relative_to(ROOT).as_posix() + "/", "count": n_frames, "w": w, "h": h},
            "steps": steps,
        })
        with open(data_dir / f"{eid}.json", "w", encoding="utf-8") as f:
            json.dump(episode, f, ensure_ascii=False, indent=1)
        # index entry: the episode without its step list, same keys as the
        # Bench summaries in tools/build_viewer_data.py
        entry = {k: v for k, v in episode.items() if k != "steps"}
        entry.update({
            "steps": len(steps),
            "toolCalls": t["tool_calls"],
            "featured": None,
            "pair": None,
            "note": "",
            "poster": max(0, (n_frames - 1) // 2),
        })
        index.append(entry)

        size = sum(p.stat().st_size for p in frame_dir.glob("f*.jpg"))
        total_frames += n_frames
        total_bytes += size
        print(f"  {eid:40s} steps={len(steps):2d} frames={n_frames:2d} tools={t['tool_calls']} {size / 1e6:5.2f} MB")

    with open(data_dir / "sft-index.json", "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=1)
    print(f"wrote {len(index)} episodes, {total_frames} frames, {total_bytes / 1e6:.1f} MB under {frames_root.relative_to(ROOT)}/")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--cache", required=True, help="directory for the downloaded train.json files and screenshots")
    parser.add_argument("--out", default="viewer", help="output directory (default: viewer, relative to the repo root)")
    parser.add_argument("--list", action="store_true", help="print ranked candidates per split instead of building")
    parser.add_argument("--limit", type=int, default=40, help="candidates to print per bucket with --list")
    args = parser.parse_args(argv)
    cache = Path(args.cache).expanduser().resolve()
    cache.mkdir(parents=True, exist_ok=True)
    if args.list:
        print_candidates(cache, args.limit)
    else:
        build(cache, args.out)


if __name__ == "__main__":
    sys.exit(main())
