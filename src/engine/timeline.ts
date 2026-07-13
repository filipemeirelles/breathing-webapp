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
  /** Infinity = fase livre (count-up), resolvida com resolveRetention. */
  end: number;
  countUp: boolean;
}

interface Built {
  segs: Segment[];
  t: number;
}

function seg(phase: Phase, round: number, breath: number, start: number, end: number, countUp = false): Segment {
  return { phase, round, breath, start, end, countUp };
}

/** As respirações ativas (inspire/expire) de um round, a partir de `t`. */
function buildRoundBreathing(config: ExerciseConfig, round: number, t: number): Built {
  const segs: Segment[] = [];
  const inhaleSec = config.breathPaceMs / 1000;
  const exhaleSec = config.breathPaceMs / 1000;
  for (let b = 1; b <= config.breathsPerRound; b++) {
    const inStart = t + (b - 1) * (inhaleSec + exhaleSec);
    segs.push(seg('BREATHING_INHALE', round, b, inStart, inStart + inhaleSec));
    segs.push(seg('BREATHING_EXHALE', round, b, inStart + inhaleSec, inStart + inhaleSec + exhaleSec));
  }
  return { segs, t: t + config.breathsPerRound * (inhaleSec + exhaleSec) };
}

/** A apnéia de um round: contagem regressiva ou livre (count-up, sem fim). */
function buildRoundApnea(config: ExerciseConfig, round: number, t: number): Built & { open: boolean } {
  if (config.retentionMode === 'countup') {
    return { segs: [seg('APNEA', round, 0, t, Infinity, true)], t: Infinity, open: true };
  }
  const apneaSec = config.apneaTimesSeconds[round] ?? config.apneaTimesSeconds[config.apneaTimesSeconds.length - 1] ?? 60;
  return { segs: [seg('APNEA', round, 0, t, t + apneaSec)], t: t + apneaSec, open: false };
}

/** A recuperação: inspiração funda segurada por `recoveryHoldSeconds`. */
function buildRoundRecovery(config: ExerciseConfig, round: number, t: number): Built {
  const end = t + config.recoveryHoldSeconds;
  return { segs: [seg('RECOVERY_HOLD', round, 0, t, end)], t: end };
}

/**
 * Solta o ar retido na recuperação antes de iniciar o próximo round —
 * sem isso a timeline pulava direto da retenção pra próxima inspiração
 * com os pulmões ainda cheios.
 */
function buildRoundRelease(config: ExerciseConfig, round: number, t: number): Built {
  const releaseSec = config.breathPaceMs / 1000;
  const end = t + releaseSec;
  return { segs: [seg('RECOVERY_RELEASE', round, 0, t, end)], t: end };
}

/** Recuperação + soltar o ar + o que vem depois (próximo round ou fim). */
function buildAfterApnea(config: ExerciseConfig, round: number, t: number): Segment[] {
  const out: Segment[] = [];
  const recovery = buildRoundRecovery(config, round, t);
  out.push(...recovery.segs);
  const release = buildRoundRelease(config, round, recovery.t);
  out.push(...release.segs);

  if (round + 1 < config.rounds) {
    out.push(...buildFromRound(config, round + 1, release.t));
  } else {
    out.push(...buildEnding(config, release.t));
  }
  return out;
}

/**
 * Gera segmentos a partir da fase de respiração do round `round`, parando
 * logo após uma apnéia count-up (fim indeterminado) ou no ALL_COMPLETE.
 */
function buildFromRound(config: ExerciseConfig, round: number, t: number): Segment[] {
  const out: Segment[] = [];
  for (let r = round; r < config.rounds; r++) {
    const breathing = buildRoundBreathing(config, r, t);
    out.push(...breathing.segs);
    t = breathing.t;

    const apnea = buildRoundApnea(config, r, t);
    out.push(...apnea.segs);
    if (apnea.open) return out;
    t = apnea.t;

    out.push(...buildAfterApnea(config, r, t));
    return out;
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
  return [...segments.slice(0, -1), resolved, ...buildAfterApnea(config, last.round, endTime)];
}

/** Reinicia a respiração do `round` do zero, a partir de `t`. */
export function restartBreathing(config: ExerciseConfig, round: number, t: number): Segment[] {
  return buildFromRound(config, round, t);
}

/** Reinicia a apnéia do `round` do zero (regressiva com o tempo cheio, ou livre voltando a 0). */
export function restartApnea(config: ExerciseConfig, round: number, t: number): Segment[] {
  const out: Segment[] = [];
  const apnea = buildRoundApnea(config, round, t);
  out.push(...apnea.segs);
  if (apnea.open) return out;
  out.push(...buildAfterApnea(config, round, apnea.t));
  return out;
}

/** Reinicia a recuperação do `round` do zero. */
export function restartRecovery(config: ExerciseConfig, round: number, t: number): Segment[] {
  const out: Segment[] = [];
  const recovery = buildRoundRecovery(config, round, t);
  out.push(...recovery.segs);
  const release = buildRoundRelease(config, round, recovery.t);
  out.push(...release.segs);
  if (round + 1 < config.rounds) {
    out.push(...buildFromRound(config, round + 1, release.t));
  } else {
    out.push(...buildEnding(config, release.t));
  }
  return out;
}

/** Reinicia o "soltar o ar" do `round` do zero. */
export function restartRelease(config: ExerciseConfig, round: number, t: number): Segment[] {
  const out: Segment[] = [];
  const release = buildRoundRelease(config, round, t);
  out.push(...release.segs);
  if (round + 1 < config.rounds) {
    out.push(...buildFromRound(config, round + 1, release.t));
  } else {
    out.push(...buildEnding(config, release.t));
  }
  return out;
}

/** Reinicia a meditação do zero (fixa: volta ao tempo cheio; sem limite: volta a 0). */
export function restartMeditation(config: ExerciseConfig, t: number): Segment[] {
  return buildEnding(config, t);
}

/** Reinicia a sessão inteira a partir do "Prepare-se". */
export function restartPrepare(config: ExerciseConfig, t: number): Segment[] {
  return buildTimeline(config, t);
}

/** Índice do segmento ativo no instante `t` (o último com start <= t < end). */
export function segmentIndexAt(segments: Segment[], t: number): number {
  for (let i = 0; i < segments.length; i++) {
    if (t < segments[i].end) return i;
  }
  return segments.length - 1;
}
