#!/usr/bin/env python3
"""
Builds index.json: the list the app's addon gallery reads. GitHub Actions runs it after every merge to main and
publishes it on the "gallery" release, so nobody edits it by hand.

For each addon: its details from addon.json, when it last changed, and every file with its size and SHA-256 hash.
The app downloads the files one by one from raw.githubusercontent.com and checks each hash before installing, so a
half-finished or tampered download is never installed.
"""
import hashlib, json, os, subprocess, sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from validate import load_json, ADDONS, ROOT   # same comment-tolerant JSON reading

def last_changed(folder):
    try:
        out = subprocess.run(["git", "log", "-1", "--format=%cI", "--", folder], cwd=ROOT,
                             capture_output=True, text=True, check=True).stdout.strip()
        if out: return out
    except Exception:
        pass
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()

def main():
    addons = []
    for name in sorted(os.listdir(ADDONS), key=str.lower):
        folder = os.path.join(ADDONS, name)
        if not os.path.isdir(folder) or name.startswith("_"):
            continue
        m = load_json(os.path.join(folder, "addon.json"))
        files = []
        for dirpath, _, names in os.walk(folder):
            for n in sorted(names):
                p = os.path.join(dirpath, n)
                data = open(p, "rb").read()
                files.append({
                    "path": os.path.relpath(p, folder).replace(os.sep, "/"),
                    "size": len(data),
                    "sha256": hashlib.sha256(data).hexdigest(),
                })
        files.sort(key=lambda f: f["path"])
        preview = next((f["path"] for f in files if f["path"] in ("preview.png", "preview.jpg")), "")
        addons.append({
            "id": name,
            "title": m.get("title", name),
            "author": m.get("author", ""),
            "version": str(m.get("version", "")),
            "description": m.get("description", ""),
            "category": m.get("category", ""),
            "tags": m.get("tags", []),
            "web": m.get("web", []),
            "minAppVersion": str(m.get("minAppVersion", "")),
            "homepage": m.get("homepage", ""),
            "updated": last_changed(folder),
            "preview": preview,
            "size": sum(f["size"] for f in files),
            "files": files,
        })
    repo = os.environ.get("GALLERY_REPO", "")
    commit = os.environ.get("GALLERY_COMMIT", "")
    index = {
        "format": 1,
        "repo": repo,
        # the exact reviewed commit: the app downloads files from
        # https://raw.githubusercontent.com/<repo>/<commit>/addons/<id>/<path> and checks each hash
        "commit": commit,
        "generated": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "count": len(addons),
        "addons": addons,
    }
    with open(os.path.join(ROOT, "index.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"index.json: {len(addons)} addon(s)")

if __name__ == "__main__":
    main()
