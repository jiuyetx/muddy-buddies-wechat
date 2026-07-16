# Design QA

## Scope

- Target: landscape WeChat mini-game, 932 × 430 logical pixels
- Title reference: `/Users/lyf/.codex/generated_images/019f6650-e4d5-7d53-9903-15d1fa58fa0c/exec-0b2abade-520e-4f38-a0e8-ae677b22cc55.png`
- Title implementation: `/private/tmp/snake-design-qa/implementation-title-final.png`
- Map/settings reference: `/Users/lyf/.codex/generated_images/019f6650-e4d5-7d53-9903-15d1fa58fa0c/exec-8df1c044-467a-4d91-9a85-011dc9c3ff95.png`
- Map/settings implementation: `/private/tmp/snake-design-qa/implementation-map-settings-final.png`
- Checked states:
  - Lightweight title cover with root-path background and the single primary action “开始探索”
  - Life-tree map with levels 1–2 complete, level 3 current, levels 4–6 locked
  - Settings panel open with both auxiliary controls and sound set to on

## Visual comparisons

- Title full comparison: `/private/tmp/snake-design-qa/comparison-title-final.png`
- Title focused title/button comparison: `/private/tmp/snake-design-qa/comparison-title-focus.png`
- Map/settings full comparison: `/private/tmp/snake-design-qa/comparison-map-settings-final.png`
- Settings-panel focused comparison: `/private/tmp/snake-design-qa/comparison-map-settings-panel-final.png`

## Fidelity review

- Typography: title, supporting copy, CTA, chapter labels, progress, and settings labels retain the selected hierarchy and remain legible at the target viewport.
- Spacing and layout: the title copy occupies the dark left clearing, the root path leads toward the warm opening, and the mascot sits on that path without competing with the CTA. Map controls float at the edges and do not cover the life tree.
- Color: cream typography, warm gold CTA, deep brown roots, and pink mascot match the established life-tree palette.
- Image quality: the title background and continuous map artwork render without visible seams, stretching artifacts, or accidental text baked into the generated background.
- Copy: the cover retains only the brand line, title, and “开始探索”; progress and configuration content stay on the map/settings surfaces.
- Platform chrome: the upper-right WeChat capsule, left-side indicator, and bottom home bar in simulator screenshots are runtime overlays, not application UI.

## Interaction and runtime verification

- “开始探索” transitions from the title cover to the life-tree map in one tap.
- Settings gear opens and closes the right-side panel.
- Auxiliary-control toggle persists and updates its selected state.
- Sound toggle persists and updates its selected state.
- Map back control returns to the title cover.
- WeChat DevTools console: 0 application errors; only platform/deprecation warnings were present.
- Static checks passed: `node --check game.js`, `node test-core.js`, and `git diff --check`.

## Iteration history

1. Replaced the repeated map background and abrupt chapter seam with one continuous vertical life-tree asset.
2. Removed the heavy top/footer bars, moved configuration into a compact right settings panel, and kept map nodes clear while the panel is open.
3. Replaced the old red wood-card home with the selected root-path invitation cover.
4. Removed generated UI text and button from the background asset, then rendered native canvas typography and CTA for crisp scaling and reliable hit targets.
5. Compared full-screen and focused regions against both selected references and verified the primary interaction path in WeChat DevTools.

## Findings

- P0: none.
- P1: none.
- P2: none.
- P3: the title reference has a more ornate CTA border; the implementation intentionally uses a lighter gold outline and glow to keep the cover visually quiet.

final result: passed
