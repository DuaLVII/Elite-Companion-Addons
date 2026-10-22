#!/usr/bin/env python3

import json, os, re, sys
import xml.etree.ElementTree as ET

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
ADDONS = os.path.join(ROOT, "addons")

ALLOWED_EXT = {".json", ".xml", ".js", ".png", ".jpg", ".md", ".txt"}
MAX_FILE = 512 * 1024          # any one file
MAX_ADDON = 2 * 1024 * 1024    # the whole addon
MAX_PREVIEW = 400 * 1024
REQUIRED = ["title", "author", "version", "description", "category"]
WEB_SITES = {"edsm", "spansh"}
ID_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_-]{1,40}$")
VERSION_RE = re.compile(r"^\d+(\.\d+){0,3}$")

PRESENTATION = "http://schemas.microsoft.com/winfx/2006/xaml/presentation"
XAML = "http://schemas.microsoft.com/winfx/2006/xaml"
CONTROLS = re.compile(r"^clr-namespace:EliteCompanion\.Controls(\s*;\s*assembly\s*=\s*EliteCompanion)?$")
MARKUP_COMPAT = "http://schemas.openxmlformats.org/markup-compatibility/2006"
BLEND = "http://schemas.microsoft.com/expression/blend/2008"
# Elements that can run code, load things from outside, or show web content
BANNED_ELEMENTS = {"ObjectDataProvider", "XmlDataProvider", "WebBrowser", "Frame", "MediaElement", "InkCanvas",
                   "ResourceDictionary.MergedDictionaries", "Code", "XData"}
# Code-behind events (there's no code-behind for addons; clicks go through Tag + on("click:…"))
EVENTS = {"Click", "Loaded", "Unloaded", "Initialized", "MouseDown", "MouseUp", "MouseMove", "MouseEnter", "MouseLeave",
          "PreviewMouseDown", "PreviewMouseUp", "KeyDown", "KeyUp", "PreviewKeyDown", "Checked", "Unchecked", "GotFocus", "LostFocus"}
# x: directives that create objects in arbitrary ways
BANNED_X = {"Code", "FactoryMethod", "Arguments", "Class", "Subclass", "ClassModifier", "XData"}


def strip_json_comments(text):
    """addon.json may have // comments (the app allows them); remove them outside strings."""
    out, i, in_str = [], 0, False
    while i < len(text):
        c = text[i]
        if in_str:
            out.append(c)
            if c == "\\" and i + 1 < len(text):
                out.append(text[i + 1]); i += 2; continue
            if c == '"': in_str = False
        elif c == '"':
            in_str = True; out.append(c)
        elif text.startswith("//", i):
            while i < len(text) and text[i] != "\n": i += 1
            continue
        elif text.startswith("/*", i):
            end = text.find("*/", i + 2); i = len(text) if end < 0 else end + 2; continue
        else:
            out.append(c)
        i += 1
    return re.sub(r",(\s*[}\]])", r"\1", "".join(out))   # trailing commas are allowed too


def load_json(path):
    with open(path, encoding="utf-8-sig") as f:
        return json.loads(strip_json_comments(f.read()))


def check_xaml(path, problems, rel):
    # Only these namespaces, so nothing outside WPF and the app's own controls can be created
    try:
        for kind, item in ET.iterparse(path, events=("start-ns",)):
            prefix, uri = item
            if uri in (PRESENTATION, XAML, MARKUP_COMPAT, BLEND) or CONTROLS.match(uri):
                continue
            problems.append(f"{rel}: namespace xmlns{':' + prefix if prefix else ''}=\"{uri}\" isn't allowed. "
                            "Use the WPF one, x: and controls: (clr-namespace:EliteCompanion.Controls) only")
        tree = ET.parse(path)
    except ET.ParseError as e:
        problems.append(f"{rel}: not well-formed XML ({e})"); return
    for el in tree.iter():
        if not isinstance(el.tag, str):
            continue
        ns, _, local = el.tag[1:].partition("}") if el.tag.startswith("{") else ("", "", el.tag)
        if local in BANNED_ELEMENTS or local.split(".")[-1] in BANNED_ELEMENTS:
            problems.append(f"{rel}: <{local}> isn't allowed in addons")
        if ns == XAML and local in BANNED_X:
            problems.append(f"{rel}: x:{local} isn't allowed in addons")
        for attr, value in el.attrib.items():
            ans, _, alocal = attr[1:].partition("}") if attr.startswith("{") else ("", "", attr)
            if ans == XAML and alocal in BANNED_X:
                problems.append(f"{rel}: x:{alocal}=\"…\" isn't allowed in addons")
            if alocal in EVENTS or (alocal.endswith("Changed") and ans == ""):
                problems.append(f"{rel}: event handler {alocal}=\"…\" isn't allowed (use Tag=\"name\" and on(\"click:name\") in script.js)")
            if local == "ResourceDictionary" and alocal == "Source":
                problems.append(f"{rel}: ResourceDictionary Source isn't allowed (it would load XAML that isn't checked)")
            v = value.strip().lower()
            if v.startswith(("http:", "https:", "file:", "pack:", "ftp:", "\\\\")) or re.match(r"^[a-z]:[\\/]", v) or "../" in v or "..\\" in v:
                problems.append(f"{rel}: {alocal}=\"{value}\": addons can't load files or web addresses")


def check_addon(folder, problems):
    name = os.path.basename(folder)
    rel = f"addons/{name}"
    if name.startswith("_"):
        return
    if not ID_RE.match(name):
        problems.append(f"{rel}: the folder name is the addon's id: letters, digits, - and _ only, starting with a letter (2–41 long)")
    files, total = [], 0
    for dirpath, dirs, names in os.walk(folder):
        for n in names:
            p = os.path.join(dirpath, n)
            r = os.path.relpath(p, folder).replace(os.sep, "/")
            size = os.path.getsize(p)
            total += size
            files.append(r)
            ext = os.path.splitext(n)[1].lower()
            if ext not in ALLOWED_EXT:
                problems.append(f"{rel}/{r}: '{ext or n}' files aren't allowed (allowed: {', '.join(sorted(ALLOWED_EXT))})")
            if size > MAX_FILE:
                problems.append(f"{rel}/{r}: {size // 1024} KB is too big (max {MAX_FILE // 1024} KB a file)")
            if r.count("/") > 1 or (r.count("/") == 1 and not r.startswith("lang/")):
                problems.append(f"{rel}/{r}: only lang/ may be a sub-folder")
            if ext in (".png", ".jpg") and r not in ("preview.png", "preview.jpg"):
                problems.append(f"{rel}/{r}: the only picture allowed is preview.png (or .jpg)")
            if ext in (".png", ".jpg") and size > MAX_PREVIEW:
                problems.append(f"{rel}/{r}: the preview is {size // 1024} KB (max {MAX_PREVIEW // 1024} KB)")
    if total > MAX_ADDON:
        problems.append(f"{rel}: {total // 1024} KB in all is too big (max {MAX_ADDON // 1024} KB)")

    manifest = os.path.join(folder, "addon.json")
    view_file, script_file = "module.xml", "script.js"
    if not os.path.isfile(manifest):
        problems.append(f"{rel}: addon.json is missing (the gallery needs the title, author, version…)")
    else:
        try:
            m = load_json(manifest)
            if not isinstance(m, dict): raise ValueError("not an object")
            for k in REQUIRED:
                if not isinstance(m.get(k), str) or not m.get(k).strip():
                    problems.append(f"{rel}/addon.json: \"{k}\" is required")
            if isinstance(m.get("version"), str) and not VERSION_RE.match(m["version"].strip()):
                problems.append(f"{rel}/addon.json: version \"{m['version']}\" should look like 1.0 or 1.2.3")
            web = m.get("web", [])
            if not isinstance(web, list) or any(not isinstance(w, str) or w.lower() not in WEB_SITES for w in web):
                problems.append(f"{rel}/addon.json: \"web\" can only list {sorted(WEB_SITES)}")
            if "tags" in m and (not isinstance(m["tags"], list) or any(not isinstance(t, str) for t in m["tags"])):
                problems.append(f"{rel}/addon.json: \"tags\" should be a list of words")
            if "minAppVersion" in m and not VERSION_RE.match(str(m["minAppVersion"])):
                problems.append(f"{rel}/addon.json: minAppVersion should look like 1.4 or 1.4.0")
            if len(m.get("description", "")) > 400:
                problems.append(f"{rel}/addon.json: keep the description under 400 characters")
            view_file = m.get("view", view_file); script_file = m.get("script", script_file)
            for f_ in (view_file, script_file):
                if "/" in f_ or "\\" in f_ or ".." in f_:
                    problems.append(f"{rel}/addon.json: \"{f_}\" must be a file in the addon's own folder")
        except Exception as e:
            problems.append(f"{rel}/addon.json: can't be read ({e})")

    view = os.path.join(folder, view_file)
    if not os.path.isfile(view):
        problems.append(f"{rel}: {view_file} (the module's look) is missing")
    else:
        check_xaml(view, problems, f"{rel}/{view_file}")
    if any(f.endswith(".xaml") for f in files):
        problems.append(f"{rel}: name the view module.xml, not .xaml (Visual Studio would try to compile it)")

    script = os.path.join(folder, script_file)
    if os.path.isfile(script):
        src = open(script, encoding="utf-8-sig", errors="replace").read()
        for m_ in re.finditer(r'include\(\s*["\']([^"\']+)["\']', src):
            target = m_.group(1)
            if not target.startswith("_shared/"):
                problems.append(f"{rel}/{script_file}: include(\"{target}\"): only the app's own _shared/ helpers can be included")

    langdir = os.path.join(folder, "lang")
    if os.path.isdir(langdir):
        for n in os.listdir(langdir):
            if not n.endswith(".json"):
                continue
            try:
                d = load_json(os.path.join(langdir, n))
                strings = d.get("Strings") if isinstance(d, dict) else None
                if not isinstance(d, dict) or not isinstance(strings, dict) or any(not isinstance(v, str) for v in strings.values()):
                    problems.append(f"{rel}/lang/{n}: should be {{ \"Language\": \"English\", \"Code\": \"en\", \"Strings\": {{ \"key\": \"text\", … }} }}")
            except Exception as e:
                problems.append(f"{rel}/lang/{n}: can't be read ({e})")


def main():
    problems = []
    if not os.path.isdir(ADDONS):
        print("no addons/ folder"); return 1
    seen = {}
    for name in sorted(os.listdir(ADDONS)):
        folder = os.path.join(ADDONS, name)
        if not os.path.isdir(folder):
            if name not in (".gitkeep", "README.md"):
                problems.append(f"addons/{name}: only folders belong in addons/")
            continue
        low = name.lower()
        if low in seen:
            problems.append(f"addons/{name}: the same id as addons/{seen[low]} (ids ignore upper / lower case)")
        seen[low] = name
        check_addon(folder, problems)
    if problems:
        print(f"✗ {len(problems)} problem(s):\n")
        for p in problems: print("  • " + p)
        return 1
    print(f"✓ {len([n for n in seen if not n.startswith('_')])} addon(s) checked, all fine")
    return 0


if __name__ == "__main__":
    sys.exit(main())
