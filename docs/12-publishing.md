# Publishing to the gallery

From your own `Addons` folder to everyone's app. [← Guide](README.md)

## Before you send it

- [ ] It works in real play, and copes with no data yet (a fresh install, no carrier, no missions…).
- [ ] `addon.json` has `title`, `author`, `version`, `description` and `category`.
- [ ] It uses theme colours (try a light theme: SETTINGS → THEME → Light).
- [ ] It fits a narrow column and a wide row ([sizes](07-charts-and-sizes.md)).
- [ ] Texts are in `lang/en.json` (translations welcome).
- [ ] No notifications during `replay`.
- [ ] Optional: a `preview.png` screenshot, about 600 × 340.

## Sending it

1. **Fork** the gallery repo (the Fork button, top right on GitHub).
2. In your fork: open `addons/`, **Add file → Upload files**, and drag your addon's folder in. The folder name is its
   id: letters, digits, `-` and `_`, starting with a letter.
3. **Commit**, then **Contribute → Open pull request**. Fill in the checklist and add a screenshot.
4. The **Check addons** job runs. If it's red, it lists what to fix: fix it in your fork and it runs again.
5. The gallery's owner reviews it, then merges it or asks for changes.
6. A minute or two after the merge it's in everyone's **MODULES → ⬇ Gallery**.

## Updating

Change the files in your folder with another pull request, and **raise `version`** in `addon.json`
(`1.0` → `1.1`). Players with it installed see **Update 1.0 → 1.1** in the gallery. What the module had stored
(`store`) is kept when it updates.

## Being a good neighbour

- Pick an id unlikely to clash (`MiningLog`, not `Log`), and prefix `metric()` names with it.
- Keep what you `store` small, and trim old entries.
- Only change addons you made (or with the author's blessing).
