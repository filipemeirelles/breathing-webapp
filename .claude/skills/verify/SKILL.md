---
name: verify
description: Build, launch and drive the breathing webapp end-to-end in headless Chromium to verify changes at the real UI surface.
---

# Verifying the breathing webapp

## Build & launch

```bash
npm install            # if node_modules missing
npm run build          # tsc -b && vite build
npx vite preview --port 4173 &   # serves dist/
```

## Drive (headless Chromium + playwright-core)

Install `playwright-core` in a scratch dir and launch with the
pre-installed browser:

```js
chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--autoplay-policy=no-user-gesture-required'] })
```

Useful selectors:
- Setup: `.form-card` (per control, filter by label text), `.stepper-btn`,
  `input[type="range"]` (index 0 = breaths, 1 = pace), `.mode-btn`
  (Cronômetro/Livre), `.start-btn`.
- Exercise: `.breathing-circle[data-phase="..."]` (PREPARE,
  BREATHING_INHALE, BREATHING_EXHALE, APNEA, RECOVERY_HOLD, MEDITATION),
  `.breath-counter`, `.timer-display`, `.phase-badge`,
  `button[title="Pausar"]`, `.breathe-btn` (count-up retention),
  `.pause-overlay`, `.finish-btn`.
- Complete: `.complete-page`, `.complete-stats`, `.retention-row`.

## Gotchas

- React range sliders need the native-setter trick (set value via
  `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set`
  then dispatch `input`), not `fill()`.
- The UI clamps breaths to ≥30, so the shortest real round is ~90s at the
  1.5s pace. For fast runs, seed `localStorage['breathing.config.v1']`
  with e.g. `breathsPerRound: 2, prepSeconds: 2` before reload —
  `loadConfig()` accepts values outside the UI ranges.
- Session history lives in `localStorage['breathing.history.v1']`.
- Sync check: at pace 1.5s the breath counter must advance exactly every
  3.0s with no cumulative drift over a round (30 breaths = 90.0s).
