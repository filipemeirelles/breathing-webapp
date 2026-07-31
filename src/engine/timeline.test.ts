import { describe, expect, it } from 'vitest';
import type { ExerciseConfig } from '../types';
import { UNLIMITED_MEDITATION } from '../types';
import {
  buildTimeline,
  resolveRetention,
  restartApnea,
  restartBreathing,
  restartRecovery,
  segmentIndexAt,
} from './timeline';

const baseConfig: ExerciseConfig = {
  rounds: 2,
  breathsPerRound: 3,
  breathPaceMs: 2000,
  apneaTimesSeconds: [60, 90],
  retentionMode: 'countdown',
  recoveryHoldSeconds: 15,
  meditationSeconds: 0,
  prepSeconds: 5,
  soundscape: 'breeze',
  binaural: false,
};

describe('buildTimeline (countdown)', () => {
  it('anchors every boundary to t0 with no accumulation error', () => {
    const t0 = 100;
    const segs = buildTimeline(baseConfig, t0);

    expect(segs[0]).toMatchObject({ phase: 'PREPARE', start: 100, end: 105 });

    // Round 0: 3 breaths of 2s+2s starting at 105
    expect(segs[1]).toMatchObject({ phase: 'BREATHING_INHALE', round: 0, breath: 1, start: 105, end: 107 });
    expect(segs[2]).toMatchObject({ phase: 'BREATHING_EXHALE', round: 0, breath: 1, start: 107, end: 109 });
    expect(segs[6]).toMatchObject({ phase: 'BREATHING_EXHALE', round: 0, breath: 3, start: 115, end: 117 });

    expect(segs[7]).toMatchObject({ phase: 'APNEA', round: 0, start: 117, end: 177 });
    expect(segs[8]).toMatchObject({ phase: 'RECOVERY_HOLD', round: 0, start: 177, end: 192 });
    // Solta o ar retido antes do próximo round
    expect(segs[9]).toMatchObject({ phase: 'RECOVERY_RELEASE', round: 0, start: 192, end: 194 });

    // Round 1 breathing só começa depois de soltar o ar
    expect(segs[10]).toMatchObject({ phase: 'BREATHING_INHALE', round: 1, breath: 1, start: 194 });
    // Round 1 apnea uses its own configured time (90s)
    const apnea1 = segs.find((s) => s.phase === 'APNEA' && s.round === 1)!;
    expect(apnea1.end - apnea1.start).toBe(90);

    const last = segs[segs.length - 1];
    expect(last.phase).toBe('ALL_COMPLETE');
    // 5 prep + 2*(12 breathing) + 60 + 90 apnea + 2*15 recovery + 2*2 release
    expect(last.start).toBe(100 + 5 + 24 + 60 + 90 + 30 + 4);
  });

  it('appends a meditation segment when configured', () => {
    const segs = buildTimeline({ ...baseConfig, meditationSeconds: 300 }, 0);
    const meditation = segs.find((s) => s.phase === 'MEDITATION')!;
    const complete = segs[segs.length - 1];
    expect(meditation.end - meditation.start).toBe(300);
    expect(complete.start).toBe(meditation.end);
  });

  it('ends with an open count-up meditation when unlimited', () => {
    const segs = buildTimeline({ ...baseConfig, meditationSeconds: UNLIMITED_MEDITATION }, 0);
    const last = segs[segs.length - 1];
    expect(last).toMatchObject({ phase: 'MEDITATION', end: Infinity, countUp: true });
    // Sem ALL_COMPLETE: a sessão termina quando o usuário conclui
    expect(segs.some((s) => s.phase === 'ALL_COMPLETE')).toBe(false);
  });

  it('skips PREPARE when prepSeconds is 0', () => {
    const segs = buildTimeline({ ...baseConfig, prepSeconds: 0 }, 50);
    expect(segs[0]).toMatchObject({ phase: 'BREATHING_INHALE', start: 50 });
  });
});

describe('buildTimeline (countup) + resolveRetention', () => {
  const countupConfig: ExerciseConfig = { ...baseConfig, retentionMode: 'countup' };

  it('stops at the open-ended apnea of round 0', () => {
    const segs = buildTimeline(countupConfig, 0);
    const last = segs[segs.length - 1];
    expect(last).toMatchObject({ phase: 'APNEA', round: 0, countUp: true, end: Infinity });
  });

  it('resolves retention and continues with recovery, release and the next round', () => {
    const segs = buildTimeline(countupConfig, 0);
    const apneaStart = segs[segs.length - 1].start;
    const resolved = resolveRetention(countupConfig, segs, apneaStart + 42);

    const apnea = resolved.find((s) => s.phase === 'APNEA' && s.round === 0)!;
    expect(apnea.end - apnea.start).toBe(42);

    const recovery = resolved.find((s) => s.phase === 'RECOVERY_HOLD' && s.round === 0)!;
    expect(recovery).toMatchObject({ start: apnea.end, end: apnea.end + 15 });

    const release = resolved.find((s) => s.phase === 'RECOVERY_RELEASE' && s.round === 0)!;
    expect(release).toMatchObject({ start: recovery.end, end: recovery.end + 2 });

    // Next round's breathing resumes only after soltar o ar, and ends at another open apnea
    const round1Inhale = resolved.find((s) => s.phase === 'BREATHING_INHALE' && s.round === 1)!;
    expect(round1Inhale.start).toBe(release.end);
    const last = resolved[resolved.length - 1];
    expect(last).toMatchObject({ phase: 'APNEA', round: 1, end: Infinity });
  });

  it('ends the session after the final round retention resolves', () => {
    const oneRound: ExerciseConfig = { ...countupConfig, rounds: 1, meditationSeconds: 120 };
    const segs = buildTimeline(oneRound, 0);
    const resolved = resolveRetention(oneRound, segs, segs[segs.length - 1].start + 30);

    const phases = resolved.map((s) => s.phase);
    expect(phases.slice(-4)).toEqual(['RECOVERY_HOLD', 'RECOVERY_RELEASE', 'MEDITATION', 'ALL_COMPLETE']);
  });

  it('is a no-op when the last segment is not an open apnea', () => {
    const segs = buildTimeline(baseConfig, 0);
    expect(resolveRetention(baseConfig, segs, 999)).toBe(segs);
  });
});

describe('segmentIndexAt', () => {
  it('finds the active segment for a time (fast-forward after background)', () => {
    const segs = buildTimeline(baseConfig, 0);
    expect(segs[segmentIndexAt(segs, 2)].phase).toBe('PREPARE');
    expect(segs[segmentIndexAt(segs, 5)].phase).toBe('BREATHING_INHALE'); // boundary belongs to next
    expect(segs[segmentIndexAt(segs, 20)].phase).toBe('APNEA');
    expect(segs[segmentIndexAt(segs, 10_000)].phase).toBe('ALL_COMPLETE');
  });
});

describe('restart helpers', () => {
  it('restartBreathing rebuilds the round from breath 1', () => {
    const segs = restartBreathing(baseConfig, 0, 500);
    expect(segs[0]).toMatchObject({ phase: 'BREATHING_INHALE', round: 0, breath: 1, start: 500 });
    const apnea = segs.find((s) => s.phase === 'APNEA' && s.round === 0)!;
    expect(apnea.start).toBe(500 + 12); // 3 respirações * 4s
  });

  it('restartApnea (countdown) restores the full configured time', () => {
    const segs = restartApnea(baseConfig, 1, 1000);
    expect(segs[0]).toMatchObject({ phase: 'APNEA', round: 1, start: 1000, end: 1090 }); // apneaTimesSeconds[1]=90
  });

  it('restartApnea (countup) reopens a fresh count-up hold', () => {
    const countupConfig: ExerciseConfig = { ...baseConfig, retentionMode: 'countup' };
    const segs = restartApnea(countupConfig, 0, 1000);
    expect(segs).toEqual([{ phase: 'APNEA', round: 0, breath: 0, start: 1000, end: Infinity, countUp: true }]);
  });

  it('restartRecovery goes straight to a fresh recovery hold followed by release', () => {
    const segs = restartRecovery(baseConfig, 0, 200);
    expect(segs[0]).toMatchObject({ phase: 'RECOVERY_HOLD', round: 0, start: 200, end: 215 });
    const release = segs.find((s) => s.phase === 'RECOVERY_RELEASE')!;
    expect(release).toMatchObject({ start: 215, end: 217 });
  });
});
