---
name: agent-icons
description: Use when an icon in media/agents/*.png is wrong, blurry, an orphan, or needs regenerating for the README agent table. Pulls the authoritative icon from the YOLO IntelliJ plugin (IDEA) and rasterizes it to a clean PNG with the correct cairosvg flags. Trigger phrases: "fix the <agent> icon", "icon is blurry/wrong", "regenerate agent icons", "sync icons from IDEA", "check the icons".
---

# Agent Icons (README / VS Code edition)

This repo's README renders a "Supported agent list" table whose website column links to
`media/agents/<id>.png` at `height="20"`. The icons there must be genuine brand symbols, not
wordmarks, and should be crisp at render size. This skill covers **regenerating / fixing those
PNGs** — sourcing the asset from the IDEA plugin, which is the single source of truth.

It does NOT cover *sourcing a brand-new logo* (no IDEA entry yet). For that, see the IDEA-side
`yolo-agent-icons` skill first, then this one to pull the result across.

## Hard rules (inherited from the IDEA `yolo-agent-icons` skill)

1. **Symbol glyph only — no text / wordmark.** A gray "DROID" wordmark (the old `droid.png`) is
   rejected. Crop to the symbol if the asset is wordmark+symbol.
2. **Keep original brand colors.** Do not recolor to mono.
3. **Genuine asset only** — never hand-trace. If IDEA has no SVG, use its `.png` as-is.
4. **`droid` is the one exception to "transparent"**: its genuine IDEA icon is an opaque black
   tile with a white symbol (Factory.ai brand). That solid black square is *correct*, not a defect.

## Source of truth

- IDEA icons live in the YOLO IntelliJ plugin repo:
  **`https://github.com/cnsharp/YOLO`**, at `src/main/resources/icons/agents/<id>.svg` (or `.png`).
  Clone it (or browse raw on GitHub) and read from there. The `<id>` matches the `id` field in this
  repo's `agents.json`.
- Sibling `media/agents/*.png` files are RGBA / transparent and ~square (mostly 512×512). New icons
  should match that shape so the table column stays visually consistent.

## Rasterization (macOS) — the non-obvious parts

Use the **cairosvg CLI**: `/opt/homebrew/bin/cairosvg`.
The python `cairosvg` *module* FAILS on macOS (it tries to load `libcairo-2.dll`).

**cairosvg ignores `-W`/`-H` (`--output-width`/`--output-height`) when the SVG declares intrinsic
width/height.** Use `--scale` (`-s`) to hit the target size:

```bash
# After cloning https://github.com/cnsharp/YOLO, work from its agents dir:
cd YOLO/src/main/resources/icons/agents
CAIRO=/opt/homebrew/bin/cairosvg

# Most SVGs (e.g. codex/trae are intrinsic 16×16) -> scale 32 = 512:
$CAIRO codex.svg -o /tmp/codex.png -s 32
$CAIRO trae.svg  -o /tmp/trae.png  -s 32

# omp.svg viewBox 0 0 64 64 -> scale 8 = 512:
$CAIRO omp.svg -o /tmp/omp.png -s 8

# droid.svg has a hardcoded outer width/height=508 -> renders 508 regardless (fine):
$CAIRO droid.svg -o /tmp/droid.png -s 1
```

Then install: `cp /tmp/<id>.png media/agents/<id>.png`.

If the IDEA source is already a `.png` (e.g. `qwen-code.png`, `antigravity.png`, `hermes.png`,
`crush.png`, `prime-agent.png`, `codebuff.png`), just `cp` it — do NOT re-rasterize. Compare
dimensions first; if the IDEA PNG is already ≥ ~80px it is crisp enough at `height="20"`.

## Validation / cleanup

- **Size sanity:** tiny repo PNGs (32–80px) are blurry at render — regenerate from IDEA.
- **Orphan check:** before deleting/keeping any icon, confirm it is referenced. Grep
  `agents.json` and `README.md` for the `<id>`. If absent from both, it is a leftover from an
  old catalog (e.g. the old `gemini.png` / `zcode.png`) — flag for deletion (`git rm`), since
  nothing references it.
- **Format check:** `file media/agents/<id>.png` should show `RGBA` and a square-ish size.
  Non-square landscape (e.g. the old `omp.png` was 2490×1620) should be replaced with the square
  SVG render.

## Checklist

- [ ] IDEA source located at `YOLO/src/main/resources/icons/agents/<id>.<svg|png>` (clone of `https://github.com/cnsharp/YOLO`).
- [ ] SVG rasterized with `cairosvg -s <scale>` to ~512×512; PNG source copied as-is.
- [ ] No text/wordmark; original brand colors kept; droid's black tile preserved.
- [ ] Installed to `media/agents/<id>.png`, RGBA, square.
- [ ] Orphan icons (unreferenced in agents.json + README) flagged for `git rm`.
