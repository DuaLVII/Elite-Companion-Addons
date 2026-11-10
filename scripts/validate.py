#!/usr/bin/env python3

import json, os, re, sys
import xml.etree.ElementTree as ET

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
ADDONS = os.path.join(ROOT, "addons")

# Themes, layouts, languages, sound packs and random sounds: one folder each, every entry a folder with about.json
# (title, author, version, description…), its file, and an optional preview.png.
#   themes/<Id>/theme.json            → the app's Themes\<Id>.json (and assets/ → Themes\<Id>\: fonts, textures, pictures)
#   layouts/<Id>/layout.json          → the app's Layouts\<Id>.ecl.json
#   languages/<code>/language.json    → the app's Languages\<code>.json (the folder name is the language code)
#   sounds/<Id>/sounds.json           → the app's Sounds\<Id>\ (with its sounds)
#   random/<Id>/random.json           → the app's Sounds\Random\<Id>\ (random sounds: voice lines, music, effects)
KINDS = {
    "themes":    {"file": "theme.json",    "max": 64 * 1024,   "id": re.compile(r"^[A-Za-z][A-Za-z0-9_-]{1,40}$")},
    "layouts":   {"file": "layout.json",   "max": 512 * 1024,  "id": re.compile(r"^[A-Za-z][A-Za-z0-9_-]{1,40}$")},
    "languages": {"file": "language.json", "max": 1024 * 1024, "id": re.compile(r"^[a-z]{2,3}(-[A-Za-z]{2,4})?$")},
    "sounds":    {"file": "sounds.json",   "max": 64 * 1024,   "id": re.compile(r"^[A-Za-z][A-Za-z0-9_-]{1,40}$")},
    "random":    {"file": "random.json",   "max": 64 * 1024,   "id": re.compile(r"^[A-Za-z][A-Za-z0-9_-]{1,40}$")},
}
AUDIO_EXT = {".wav", ".ogg", ".mp3"}
MAX_SOUND_FILE = 1024 * 1024          # any one sound
MAX_SOUND_PACK = 8 * 1024 * 1024      # a whole pack
SOUND_ID_RE = re.compile(r"^[a-z]+(\.[a-z0-9_]+)+$")
MAX_RANDOM_FILE = 6 * 1024 * 1024     # random sounds: any one file (music is longer)
MAX_RANDOM_PACK = 24 * 1024 * 1024    # random sounds: in all
RANDOM_KINDS = {"voice", "music", "effect"}
# a theme's own files, in assets/ (fonts, textures, pictures, and the fonts' licences)
THEME_ASSET_EXT = {".ttf", ".otf", ".png", ".jpg", ".txt"}
MAX_THEME_ASSET = 2 * 1024 * 1024
MAX_THEME_ASSETS = 8 * 1024 * 1024
ITEM_REQUIRED = ["title", "author", "version", "description"]
COLOUR_RE = re.compile(r"^#([0-9A-Fa-f]{3,4}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$")
GRADIENT_RE = re.compile(r"^(linear|radial)\([^()]*\)$", re.I)
# texture(kind, #colour, strength%[, size]): grain · fibres · cells · loam, or a picture in the theme's assets/
TEXTURE_RE = re.compile(r"^texture\(\s*([^,()]+?)\s*,\s*(#[0-9A-Fa-f]{3,8})\s*(,[^()]*)?\)$", re.I)
TEXTURES = {"grain", "fibres", "fibers", "cells", "loam"}

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
        for m_ in re.finditer(r'(?<![\w.])include\(\s*["\']([^"\']+)["\']', src):
            # a gallery addon stands alone: everything it needs is in its own folder (the app has no shared helpers)
            problems.append(f"{rel}/{script_file}: include(\"{m_.group(1)}\"): put what you need in this addon's own script.js instead")

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


def check_about(folder, rel, problems):
    path = os.path.join(folder, "about.json")
    if not os.path.isfile(path):
        problems.append(f"{rel}: about.json is missing (title, author, version, description)")
        return None
    try:
        m = load_json(path)
        if not isinstance(m, dict): raise ValueError("not an object")
    except Exception as e:
        problems.append(f"{rel}/about.json: can't be read ({e})"); return None
    for k in ITEM_REQUIRED:
        if not isinstance(m.get(k), str) or not m.get(k).strip():
            problems.append(f"{rel}/about.json: \"{k}\" is required")
    if isinstance(m.get("version"), str) and not VERSION_RE.match(m["version"].strip()):
        problems.append(f"{rel}/about.json: version \"{m['version']}\" should look like 1.0 or 1.2.3")
    if "tags" in m and (not isinstance(m["tags"], list) or any(not isinstance(t, str) for t in m["tags"])):
        problems.append(f"{rel}/about.json: \"tags\" should be a list of words")
    if "minAppVersion" in m and not VERSION_RE.match(str(m["minAppVersion"])):
        problems.append(f"{rel}/about.json: minAppVersion should look like 1.4 or 1.4.0")
    if len(m.get("description", "")) > 400:
        problems.append(f"{rel}/about.json: keep the description under 400 characters")
    return m


def check_theme(path, rel, problems, folder):
    t = load_json(path)
    if not isinstance(t, dict) or not isinstance(t.get("colors", {}), dict):
        problems.append(f"{rel}: should be {{ \"name\": …, \"colors\": {{ \"Hud\": \"#FF9830\", … }} }}"); return
    assets = os.path.join(folder, "assets")
    def has_asset(name):
        p = os.path.normpath(os.path.join(assets, name))
        return p.startswith(os.path.normpath(assets) + os.sep) and os.path.isfile(p)
    for k, v in t.get("colors", {}).items():
        v2 = v.strip() if isinstance(v, str) else ""
        tex = TEXTURE_RE.match(v2)
        if tex:
            kind = tex.group(1)
            if kind.lower() not in TEXTURES and not (kind.lower().endswith((".png", ".jpg")) and has_asset(kind)):
                problems.append(f"{rel}: colour \"{k}\": texture \"{kind}\" isn't grain, fibres, cells or loam, or a picture in assets/")
            continue
        if not (COLOUR_RE.match(v2) or GRADIENT_RE.match(v2)):
            problems.append(f"{rel}: colour \"{k}\": \"{v}\" isn't a colour (#RRGGBB, #AARRGGBB, linear(…), radial(…) or texture(…))")
    if "font" in t and not isinstance(t["font"], str):
        problems.append(f"{rel}: \"font\" should be a font's name")
    if "style" in t and not isinstance(t["style"], dict):
        problems.append(f"{rel}: \"style\" should be an object")
    # the theme's own files it names (fonts, a corner picture) must be in assets/
    fonts = t.get("fonts") or {}
    if not isinstance(fonts, dict):
        problems.append(f"{rel}: \"fonts\" should be {{ \"text\": …, \"heading\": …, \"numbers\": … }}")
    else:
        for role, spec in fonts.items():
            if isinstance(spec, str) and spec.lower().endswith((".ttf", ".otf")) and not has_asset(spec):
                problems.append(f"{rel}: font \"{role}\": {spec} isn't in assets/")
    decor = t.get("decor") or {}
    if isinstance(decor, dict) and isinstance(decor.get("corners"), str) and decor["corners"].lower().endswith((".png", ".jpg")) and not has_asset(decor["corners"]):
        problems.append(f"{rel}: decor corners: {decor['corners']} isn't in assets/")
    icons = t.get("icons") or {}
    if not isinstance(icons, dict) or any(not isinstance(v, str) or len(v) > 2000 for v in icons.values()):
        problems.append(f"{rel}: \"icons\" should be {{ \"SearchBtn\": \"M2 8 …\" }} (path data, each under 2000 characters)")


def check_layout(path, rel, problems):
    f = load_json(path)
    if not isinstance(f, dict) or f.get("Format") != "EliteCompanion.Layout" or not f.get("Tabs"):
        problems.append(f"{rel}: should be a layout exported from the app (LAYOUT → Export), with at least one tab"); return
    addons = {a.lower() for a in os.listdir(ADDONS)} if os.path.isdir(ADDONS) else set()
    for a in f.get("Addons", []) or []:
        aid, frm = str(a.get("Id", "")), str(a.get("From", ""))
        if frm == "gallery" and aid.lower() not in addons:
            problems.append(f"{rel}: uses the addon \"{aid}\", which isn't in the gallery (add it to addons/ first)")
        elif frm not in ("gallery", "link"):
            problems.append(f"{rel}: uses \"{aid}\", an addon only its maker has: layouts here can only use addons from the gallery or a link")
    # spreadsheet pages (a page's "Sheet"): within the app's limits
    for t in f.get("Tabs") or []:
        for pg in [t] + list((t or {}).get("Pages") or []):
            sh = (pg or {}).get("Sheet")
            if sh is None: continue
            cells = sh.get("Cells") if isinstance(sh, dict) else None
            if not isinstance(cells, dict) or not 1 <= int(sh.get("Rows", 0) or 0) <= 1000 or not 1 <= int(sh.get("Cols", 0) or 0) <= 100:
                problems.append(f"{rel}: a spreadsheet page on \"{t.get('Name', '?')}\" isn't one the app made (1,000 rows × 100 columns at most)"); continue
            if any(not re.match(r"^[A-Z]{1,3}[0-9]{1,4}$", k) or not isinstance(v, dict) or len(str(v.get("Input", ""))) > 4000 for k, v in cells.items()):
                problems.append(f"{rel}: a spreadsheet page on \"{t.get('Name', '?')}\" has cells the app wouldn't write")
    if any(isinstance(v, dict) and v for v in (f.get("AddonData") or {}).values()):
        pass   # (addons' saved settings travel with the layout: fine, they're plain text)


def check_language(path, rel, problems, code):
    d = load_json(path)
    strings = d.get("Strings") if isinstance(d, dict) else None
    if not isinstance(d, dict) or not isinstance(strings, dict) or any(not isinstance(v, str) for v in strings.values()):
        problems.append(f"{rel}: should be {{ \"Language\": \"Italiano\", \"Code\": \"it\", \"Strings\": {{ \"key\": \"text\", … }} }}"); return
    if str(d.get("Code", "")).lower() != code.lower():
        problems.append(f"{rel}: \"Code\" is \"{d.get('Code')}\" but the folder is {code}: they should match")
    if not str(d.get("Language", "")).strip():
        problems.append(f"{rel}: \"Language\" (its name, in that language) is required")
    for k, v in strings.items():
        if "<" in v and re.search(r"<\s*(script|iframe|object)", v, re.I):
            problems.append(f"{rel}: \"{k}\" has markup in it")


def check_sounds(path, rel, problems, folder):
    d = load_json(path)
    sounds = d.get("sounds") if isinstance(d, dict) else None
    if not isinstance(sounds, dict) or not sounds:
        problems.append(f"{rel}: should be {{ \"name\": …, \"sounds\": {{ \"ui.click\": {{ \"files\": [\"click.ogg\"] }}, … }} }}"); return
    for sid, entry in sounds.items():
        if not SOUND_ID_RE.match(sid):
            problems.append(f"{rel}: \"{sid}\" isn't a sound id (like ui.click or game.docked)")
        files = [entry] if isinstance(entry, str) else (entry.get("files") if isinstance(entry, dict) else None)
        if not isinstance(files, list) or not files or any(not isinstance(f, str) for f in files):
            problems.append(f"{rel}: \"{sid}\" needs \"files\": [\"…\"]"); continue
        for f in files:
            if "/" in f or "\\" in f or ".." in f:
                problems.append(f"{rel}: \"{sid}\": {f}: files sit beside sounds.json (no folders)")
            elif not os.path.isfile(os.path.join(folder, f)):
                problems.append(f"{rel}: \"{sid}\": {f} isn't in the folder")
        if isinstance(entry, dict) and "volume" in entry and not (isinstance(entry["volume"], (int, float)) and 0 <= entry["volume"] <= 2):
            problems.append(f"{rel}: \"{sid}\": volume should be 0 to 2")


def check_random(path, rel, problems, folder):
    d = load_json(path)
    sets = d.get("sets") if isinstance(d, dict) else None
    if not isinstance(sets, list) or not sets:
        problems.append(f"{rel}: should be {{ \"name\": …, \"sets\": [ {{ \"name\": …, \"kind\": \"voice\", \"files\": [\"line1.ogg\"] }}, … ] }}"); return
    for n, st in enumerate(sets, 1):
        where = f"{rel}: set {n}"
        if not isinstance(st, dict):
            problems.append(f"{where}: should be an object"); continue
        if not isinstance(st.get("name"), str) or not st["name"].strip():
            problems.append(f"{where}: needs a \"name\"")
        else:
            where = f"{rel}: \"{st['name']}\""
        if str(st.get("kind", "voice")).lower() not in RANDOM_KINDS:
            problems.append(f"{where}: \"kind\" is voice, music or effect")
        files = st.get("files")
        if not isinstance(files, list) or not files or any(not isinstance(f, str) for f in files):
            problems.append(f"{where}: needs \"files\": [\"…\"]"); continue
        for f in files:
            if "/" in f or "\\" in f or ".." in f:
                problems.append(f"{where}: {f}: files sit beside random.json (no folders)")
            elif not os.path.isfile(os.path.join(folder, f)):
                problems.append(f"{where}: {f} isn't in the folder")
            elif os.path.splitext(f)[1].lower() not in AUDIO_EXT:
                problems.append(f"{where}: {f}: only .wav, .ogg and .mp3")
        for key, lo, hi in (("minMinutes", 1, 600), ("maxMinutes", 1, 600), ("volume", 0, 200), ("chance", 0, 100)):
            if key in st and not (isinstance(st[key], (int, float)) and lo <= st[key] <= hi):
                problems.append(f"{where}: \"{key}\" should be {lo} to {hi}")
        if st.get("trigger") and not (isinstance(st["trigger"], str) and SOUND_ID_RE.match(st["trigger"])):
            problems.append(f"{where}: \"trigger\" should be a sound id (like game.docked)")
        if "activities" in st and (not isinstance(st["activities"], list) or any(not isinstance(a, str) for a in st["activities"])):
            problems.append(f"{where}: \"activities\" should be a list (docked, supercruise…)")


def check_item(kind, folder, problems):
    spec = KINDS[kind]
    name = os.path.basename(folder)
    rel = f"{kind}/{name}"
    if not spec["id"].match(name):
        problems.append(f"{rel}: " + ("the folder name is the language code, like it or pt-BR" if kind == "languages"
                                      else "the folder name is its id: letters, digits, - and _ only, starting with a letter"))
    allowed = {"about.json", spec["file"], "preview.png", "preview.jpg", "README.md"}
    total = assets_total = 0
    assets_root = os.path.join(folder, "assets")
    for dirpath, dirs, names in os.walk(folder):
        if dirpath != folder:
            # a theme's own files: assets/ (and folders in it), fonts, textures, pictures and licences only
            if kind == "themes" and (dirpath == assets_root or dirpath.startswith(assets_root + os.sep)):
                for n in names:
                    p = os.path.join(dirpath, n)
                    size = os.path.getsize(p)
                    assets_total += size
                    r = os.path.relpath(p, folder).replace(os.sep, "/")
                    if os.path.splitext(n)[1].lower() not in THEME_ASSET_EXT:
                        problems.append(f"{rel}/{r}: assets/ takes fonts (.ttf, .otf), pictures (.png, .jpg) and licences (.txt) only")
                    elif size > MAX_THEME_ASSET:
                        problems.append(f"{rel}/{r}: {size // 1024} KB is too big (max {MAX_THEME_ASSET // 1024} KB a file)")
                continue
            problems.append(f"{rel}: no sub-folders" + (" (other than assets/)" if kind == "themes" else "")); continue
        for n in names:
            p = os.path.join(dirpath, n)
            size = os.path.getsize(p)
            total += size
            if kind == "sounds" and os.path.splitext(n)[1].lower() in AUDIO_EXT:
                if size > MAX_SOUND_FILE:
                    problems.append(f"{rel}/{n}: {size // 1024} KB is too big for one sound (max {MAX_SOUND_FILE // 1024} KB: shorter, or OGG)")
                continue
            if kind == "random" and os.path.splitext(n)[1].lower() in AUDIO_EXT:
                if size > MAX_RANDOM_FILE:
                    problems.append(f"{rel}/{n}: {size // 1024} KB is too big (max {MAX_RANDOM_FILE // 1024 // 1024} MB a file: shorter, or OGG)")
                continue
            if n not in allowed:
                problems.append(f"{rel}/{n}: only {', '.join(sorted(allowed))}" + (" and .wav / .ogg / .mp3 sounds" if kind in ("sounds", "random") else "") + " belong here")
            if n == spec["file"] and size > spec["max"]:
                problems.append(f"{rel}/{n}: {size // 1024} KB is too big (max {spec['max'] // 1024} KB)")
            if n.startswith("preview.") and size > MAX_PREVIEW:
                problems.append(f"{rel}/{n}: the preview is {size // 1024} KB (max {MAX_PREVIEW // 1024} KB)")
    if kind == "sounds" and total > MAX_SOUND_PACK:
        problems.append(f"{rel}: {total // 1024} KB in all is too big (max {MAX_SOUND_PACK // 1024 // 1024} MB a pack)")
    if kind == "random" and total > MAX_RANDOM_PACK:
        problems.append(f"{rel}: {total // 1024} KB in all is too big (max {MAX_RANDOM_PACK // 1024 // 1024} MB)")
    if assets_total > MAX_THEME_ASSETS:
        problems.append(f"{rel}/assets: {assets_total // 1024} KB in all is too big (max {MAX_THEME_ASSETS // 1024 // 1024} MB)")
    check_about(folder, rel, problems)
    path = os.path.join(folder, spec["file"])
    if not os.path.isfile(path):
        problems.append(f"{rel}: {spec['file']} is missing"); return
    try:
        if kind == "themes": check_theme(path, f"{rel}/{spec['file']}", problems, folder)
        elif kind == "layouts": check_layout(path, f"{rel}/{spec['file']}", problems)
        elif kind == "sounds": check_sounds(path, f"{rel}/{spec['file']}", problems, folder)
        elif kind == "random": check_random(path, f"{rel}/{spec['file']}", problems, folder)
        else: check_language(path, f"{rel}/{spec['file']}", problems, name)
    except Exception as e:
        problems.append(f"{rel}/{spec['file']}: can't be read ({e})")


def check_kind(kind, problems):
    """Returns how many entries were checked."""
    root = os.path.join(ROOT, kind)
    if not os.path.isdir(root):
        return 0
    seen, n = {}, 0
    for name in sorted(os.listdir(root)):
        folder = os.path.join(root, name)
        if not os.path.isdir(folder):
            if name not in (".gitkeep", "README.md"):
                problems.append(f"{kind}/{name}: only folders belong in {kind}/")
            continue
        if name.startswith("_"):
            continue
        if name.lower() in seen:
            problems.append(f"{kind}/{name}: the same name as {kind}/{seen[name.lower()]} (names ignore upper / lower case)")
        seen[name.lower()] = name
        check_item(kind, folder, problems)
        n += 1
    return n


NAMES = {"themes": ("theme", "themes"), "layouts": ("layout", "layouts"), "languages": ("language", "languages"),
         "sounds": ("sound pack", "sound packs"), "random": ("set of random sounds", "sets of random sounds")}


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
    counts = {kind: check_kind(kind, problems) for kind in KINDS}
    if problems:
        print(f"✗ {len(problems)} problem(s):\n")
        for p in problems: print("  • " + p)
        return 1
    print(f"✓ {len([n for n in seen if not n.startswith('_')])} addon(s), "
          + ", ".join(f"{n} {NAMES[kind][0] if n == 1 else NAMES[kind][1]}" for kind, n in counts.items()) + " checked, all fine")
    return 0


if __name__ == "__main__":
    sys.exit(main())
