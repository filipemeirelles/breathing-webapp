import type { ExerciseConfig, Phase } from '../types';
import { UNLIMITED_MEDITATION } from '../types';

/**
 * Um segmento da sessão com início/fim em tempos absolutos do relógio de
 * áudio (AudioContext.currentTime, em segundos). A timeline é calculada a
 * partir de uma âncora, nunca acumulada de callbacks, então não há drift.
 */
export interface Segment {
  phase: Phase;
  /** Round 0-based; -1 para PREPARE e ALL_COMPLETE. */
  round: number;
  /** Respiração 1-based durante BREATHING_*; 0 nas demais fases. */
  breath: number;
  start: number;
  /** Infinity = retenção livre (count-up), resolvida com resolveRetention. */
  end: number;
  countUp: boolean;
}

function seg(phase: Phase, round: number, breath: number, start: number, end: number, countUp = false): Segment {
  return { phase, round, breath, start, end, countUp };
}

/**
 * Gera segmentos a partir da fase de respiração do round `round`, parando
 * logo após uma apnéia count-up (fim indeterminado) ou no ALL_COMPLETE.
 */
function buildFromRound(config: ExerciseConfig, round: number, t: number): Segment[] {
  const out: Segment[] = [];
  const inhaleSec = config.breathPaceMs / 1000;
  const exhaleSec = config.breathPaceMs / 1000;

  for (let r = round; r < config.rounds; r++) {
    const roundStart = t;
    for (let b = 1; b <= config.breathsPerRound; b++) {
      const inStart = roundStart + (b - 1) * (inhaleSec + exhaleSec);
      out.push(seg('BREATHING_INHALE', r, b, inStart, inStart + inhaleSec));
      out.push(seg('BREATHING_EXHALE', r, b, inStart + inhaleSec, inStart + inhaleSec + exhaleSec));
    }
    t = roundStart + config.breathsPerRound * (inhaleSec + exhaleSec);

    if (config.retentionMode === 'countup') {
      out.push(seg('APNEA', r, 0, t, Infinity, true));
      return out;
    }
    const apneaSec = config.apneaTimesSeconds[r] ?? config.apneaTimesSeconds[config.apneaTimesSeconds.length - 1] ?? 60;
    out.push(seg('APNEA', r, 0, t, t + apneaSec));
    t += apneaSec;

    out.push(seg('RECOVERY_HOLD', r, 0, t, t + config.recoveryHoldSeconds));
    t += config.recoveryHoldSeconds;
  }

  out.push(...buildEnding(config, t));
  return out;
}

function buildEnding(config: ExerciseConfig, t: number): Segment[] {
  const out: Segment[] = [];
  if (config.meditationSeconds === UNLIMITED_MEDITATION) {
    // Sem limite: conta pra cima até o usuário concluir (finishEarly).
    out.push(seg('MEDITATION', config.rounds - 1, 0, t, Infinity, true));
    return out;
  }
  if (config.meditationSeconds > 0) {
    out.push(seg('MEDITATION', config.rounds - 1, 0, t, t + config.meditationSeconds));
    t += config.meditationSeconds;
  }
  out.push(seg('ALL_COMPLETE', -1, 0, t, t));
  return out;
}

/** Timeline inicial: PREPARE seguido dos rounds. */
export function buildTimeline(config: ExerciseConfig, t0: number): Segment[] {
  const out: Segment[] = [];
  let t = t0;
  if (config.prepSeconds > 0) {
    out.push(seg('PREPARE', -1, 0, t, t + config.prepSeconds));
    t += config.prepSeconds;
  }
  out.push(...buildFromRound(config, 0, t));
  return out;
}

/**
 * Resolve a apnéia count-up pendente (último segmento) encerrando-a em
 * `endTime` e estende a timeline com recuperação + rounds/meditação restantes.
 */
export function resolveRetention(config: ExerciseConfig, segments: Segment[], endTime: number): Segment[] {
  const last = segments[segments.length - 1];
  if (!last || last.phase !== 'APNEA' || !last.countUp || last.end !== Infinity) {
    return segments;
  }
  const resolved: Segment = { ...last, end: endTime };
  const out = [...segments.slice(0, -1), resolved];

  const t = endTime + config.recoveryHoldSeconds;
  out.push(seg('RECOVERY_HOLD', last.round, 0, endTime, t));

  if (last.round + 1 < config.rounds) {
    out.push(...buildFromRound(config, last.round + 1, t));
  } else {
    out.push(...buildEnding(config, t));
  }
  return out;
}

/** Índice do segmento ativo no instante `t` (o último com start <= t < end). */
export function segmentIndexAt(segments: Segment[], t: number): number {
  for (let i = 0; i < segments.length; i++) {
    if (t < segments[i].end) return i;
  }
  return segments.length - 1;
}
