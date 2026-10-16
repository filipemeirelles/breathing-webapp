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
- Setup: `.preset-chip`, `.form-card` (per control, filter by label text),
  `.stepper-btn`, `input[type="range"]` (#breaths, #pace, #volume),
  `.mode-btn` (Cronômetro/Livre; also `.sound-btn` soundscapes), `.start-btn`.
- Exercise: `.breathing-circle[data-phase="..."]` (PREPARE,
  BREATHING_INHALE, BREATHING_EXHALE, APNEA, RECOVERY_HOLD, MEDITATION),
  `.breath-counter`, `.timer-display`, `.phase-badge`,
  `.orb-ring-progress`, `button[title="Pausar"]`, `.breathe-giant-circle`
  (count-up retention; Space/Enter also works), `.pause-overlay`,
  `.finish-btn`.
- Complete: `.complete-page`, `.complete-stats`, `.retention-row`,
  `.restart-btn` (repeat), `.home-btn`.

## Gotchas

- React range sliders need the native-setter trick (set value via
  `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set`
  then dispatch `input`), not `fill()`.
- The UI clamps breaths to ≥20, so the shortest real round is ~60s at the
  1.5s pace. For fast runs, seed `localStorage['breathing.config.v1']`
  with e.g. `breathsPerRound: 2, prepSeconds: 2` before reload —
  `loadConfig()` accepts values outside the UI ranges.
- Session history lives in `localStorage['breathing.history.v1']`.
- Sync check: at pace 1.5s the breath counter must advance exactly every
  3.0s with no cumulative drift over a round (30 breaths = 90.0s).
- Audio levels: wrap `AudioNode.prototype.connect` in an init script to tap
  an `AnalyserNode` before `ctx.destination` and measure RMS/peak per
  soundscape (hold phase ≈ -30 to -35 dB, peaks < 0.8).
- Voice/clips: patch `AudioBufferSourceNode.prototype.start` in an init
  script to log `{buffer.duration, playbackRate}` per start; at pace 4000 ms
  the exhale must fall back to the synth (no clip logged). Voice cues and
  clips live in `public/audio/` (see docs/audio.md).
- Gong level: sample the analyser every 250 ms from RECOVERY_RELEASE on
  (not from MEDITATION, which misses the attack). Targets: opening gong
  ≈ -20 dB RMS, closing gong ≈ -23 dB, i.e. just below the breath guide
  (≈ -19.6 dB). Constants: GONG_LEVEL / GONG_CLOSING_FACTOR in src/audio.ts.
