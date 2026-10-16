import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExerciseConfig } from '../types';
import { DEFAULT_CONFIG } from '../types';
import { BreathEngine, type AudioSink, type EngineEvent, type VoiceCue } from './breathEngine';

/** Relógio de áudio falso: o teste avança `t` e chama o agendador à mão. */
function makeSink() {
  const calls: { kind: string; at: number; final?: boolean; cue?: VoiceCue }[] = [];
  let t = 0;
  const sink: AudioSink = {
    now: () => t,
    scheduleBreath: (type, at) => calls.push({ kind: type, at }),
    scheduleVoice: (cue, at) => calls.push({ kind: 'voice', at, cue }),
    scheduleGong: (at) => calls.push({ kind: 'gong', at }),
    scheduleChime: (at) => calls.push({ kind: 'chime', at }),
    scheduleTick: (at, final) => calls.push({ kind: 'tick', at, final }),
    setAmbience: () => undefined,
    cancelScheduled: () => undefined,
    suspend: async () => undefined,
    resume: async () => undefined,
  };
  return { sink, calls, setTime: (v: number) => { t = v; } };
}

const config: ExerciseConfig = {
  ...DEFAULT_CONFIG,
  rounds: 1,
  breathsPerRound: 2,
  breathPaceMs: 1000,
  apneaTimesSeconds: [10],
  recoveryHoldSeconds: 5,
  prepSeconds: 0,
};

let intervalCb: (() => void) | null = null;

beforeEach(() => {
  vi.stubGlobal('window', {
    setInterval: (cb: () => void) => { intervalCb = cb; return 1; },
  });
  vi.stubGlobal('document', { addEventListener: () => undefined, removeEventListener: () => undefined, visibilityState: 'visible' });
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  vi.stubGlobal('clearInterval', () => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  intervalCb = null;
});

function runTo(engine: BreathEngine, setTime: (v: number) => void, end: number) {
  for (let t = 0; t <= end; t += 0.05) {
    setTime(t);
    intervalCb?.();
    // advance é privado; o rAF não roda aqui, então chamamos via cast.
    (engine as unknown as { advance(n: number): void }).advance(t);
  }
}

describe('BreathEngine voice guide', () => {
  const voiceConfig: ExerciseConfig = { ...config, breathsPerRound: 8, voice: 'always' };

  function cues(cfg: ExerciseConfig) {
    const { sink, calls, setTime } = makeSink();
    const engine = new BreathEngine(sink, cfg);
    engine.start();
    runTo(engine, setTime, 60);
    return calls.filter((c) => c.kind === 'voice').map((c) => c.cue);
  }

  it("speaks 'inhale'/'exhale' on every breath in always mode", () => {
    const all = cues(voiceConfig);
    expect(all.filter((c) => c === 'inhale')).toHaveLength(8);
    expect(all.filter((c) => c === 'exhale')).toHaveLength(8);
    // Fases de retenção e recuperação também têm locução
    expect(all).toContain('hold');
    expect(all).toContain('deep');
    expect(all).toContain('release');
    // A voz fala no início da fase: inspira, expira, inspira...
    expect(all.slice(0, 4)).toEqual(['inhale', 'exhale', 'inhale', 'exhale']);
  });

  it('speaks only on the first breaths of each round in intro mode', () => {
    const intro = cues({ ...voiceConfig, voice: 'intro' });
    expect(intro.filter((c) => c === 'inhale')).toHaveLength(5);
    expect(intro.filter((c) => c === 'exhale')).toHaveLength(5);
    expect(intro).toContain('hold');
  });

  it('is silent when the voice is off', () => {
    expect(cues({ ...voiceConfig, voice: 'off' })).toHaveLength(0);
  });
});

describe('BreathEngine countdown cues', () => {
  it('schedules 3 ticks before the end of apnea and recovery, last one final', () => {
    const { sink, calls, setTime } = makeSink();
    const engine = new BreathEngine(sink, config);
    engine.start();
    // t0 = 0.1; respiração 4s → apnéia 4.1–14.1 → recuperação 14.1–19.1
    runTo(engine, setTime, 20);
    const ticks = calls.filter((c) => c.kind === 'tick');
    expect(ticks.map((c) => Number(c.at.toFixed(2)))).toEqual([11.1, 12.1, 13.1, 16.1, 17.1, 18.1]);
    expect(ticks.map((c) => c.final)).toEqual([false, false, true, false, false, true]);
  });

  it('emits segment durations, Infinity for free retention', () => {
    const { sink, setTime } = makeSink();
    const engine = new BreathEngine(sink, { ...config, retentionMode: 'countup' });
    const events: EngineEvent[] = [];
    engine.onEvent((e) => events.push(e));
    engine.start();
    runTo(engine, setTime, 6);
    const segs = events.filter((e) => e.type === 'segment');
    expect(segs[0]).toMatchObject({ phase: 'BREATHING_INHALE', duration: 1 });
    const apnea = segs.find((e) => e.phase === 'APNEA');
    expect(apnea?.duration).toBe(Infinity);
  });

  it('skips ticks when countdown cues are off', () => {
    const { sink, calls, setTime } = makeSink();
    const engine = new BreathEngine(sink, { ...config, countdownCues: false });
    engine.start();
    runTo(engine, setTime, 20);
    expect(calls.some((c) => c.kind === 'tick')).toBe(false);
  });
});
