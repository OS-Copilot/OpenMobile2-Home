"""Apply the page's adjustments to the MobileGym++ checkout before a build.

    python3 tools/patch_sim.py [--checkout ../mobilegym-mock/trial_apps/mobilegym]

Idempotent; run it before `npx vite build` (see README, "Live demo").

- Home screen: the coin-flip widget (5a6b76c4) in os/launcher/defaults.json
  becomes the sunrise/sunset widget (620f3044) of the same theme pack.
- WeChat: six contacts with their avatars (tools/sim-overlay/wechat-avatars/,
  320 px JPEG) are appended to apps/Wechat/data/defaults.json and the avatars
  copied to apps/Wechat/assets/avatars/. The built-in AI reply persona is left
  off for them.
"""
import argparse
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OVERLAY = ROOT / "tools" / "sim-overlay"

COIN = "5a6b76c4-cefa-45d7-8f2d-e39d3c4639f5"
SUNSET = "620f3044-b91d-49aa-9a94-82af3e9d0a2b"

# (file stem in sim-overlay/wechat-avatars, display name, contact-list letter)
CONTACTS = [
    ("laowu", "牢吴", "L"),
    ("fangzhi", "Fangzhi", "F"),
    ("kanzhi", "Kanzhi", "K"),
    ("qiushi", "Qiushi", "Q"),
    ("yian", "Yian", "Y"),
    ("zichen", "Zichen", "Z"),
]


def patch_launcher(checkout):
    path = checkout / "os" / "launcher" / "defaults.json"
    text = path.read_text(encoding="utf-8")
    if COIN not in text:
        return "launcher: already patched"
    path.write_text(text.replace(COIN, SUNSET), encoding="utf-8")
    return "launcher: coin widget -> sunrise/sunset widget"


def patch_wechat(checkout):
    data_path = checkout / "apps" / "Wechat" / "data" / "defaults.json"
    data = json.loads(data_path.read_text(encoding="utf-8"))
    have = {c["wxid"] for c in data["contacts"]}
    added = 0
    for stem, name, letter in CONTACTS:
        wxid = "wxid_om2_" + stem
        shutil.copy2(OVERLAY / "wechat-avatars" / (stem + ".jpg"),
                     checkout / "apps" / "Wechat" / "assets" / "avatars" / ("om2_" + stem + ".jpg"))
        if wxid in have:
            continue
        data["contacts"].append({
            "wxid": wxid, "name": name, "avatar": "avatars/om2_" + stem + ".jpg",
            "category": letter, "signature": "", "alias": name, "region": "", "gender": "",
            "source": "对方通过扫一扫添加", "addedTime": "2026年10月", "commonGroups": 0, "memo": "",
            "isBlacklisted": False, "steps": 0, "likes": 0, "permissionMode": "all",
            "hideMyMoments": False, "hideTheirMoments": False,
            "aiConfig": {"enabled": False, "systemPrompt": ""},
        })
        added += 1
    data_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return "wechat: %d contacts added (%d already there)" % (added, len(CONTACTS) - added)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--checkout", type=Path, default=ROOT.parent / "mobilegym-mock" / "trial_apps" / "mobilegym")
    args = ap.parse_args()
    print(patch_launcher(args.checkout))
    print(patch_wechat(args.checkout))


if __name__ == "__main__":
    main()
