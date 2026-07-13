import type { ExerciseConfig, Phase } from '../types';
import {
  buildTimeline,
  resolveRetention,
  restartApnea,
  restartBreathing,
  restartMeditation,
  restartPrepare,
  restartRelease,
  type Segment,
} from './timeline';

/**
 * Saída de áudio que o motor agenda no relógio do AudioContext. Injetável
 * para permitir testes com relógio falso.
 */
export interface AudioSink {
  /** AudioContext.currentTime, em segundos. */
  now(): number;
  scheduleBreath(type: 'inhale' | 'exhale', atTime: number, durationSec: number): void;
  scheduleGong(atTime: number): void;
  scheduleChime(atTime: number): void;
  setAmbience(mode: 'breathing' | 'hold' | 'meditation', atTime: number): void;
  /** Cancela apenas fontes ainda não iniciadas. */
  cancelScheduled(): void;
  suspend(): Promise<void>;
  resume(): Promise<void>;
}

export type EngineEvent =
  | { type: 'segment'; phase: Phase; round: number; breath: number; seconds: number }
  | { type: 'tick'; seconds: number }
  | {
      type: 'complete';
      roundsCompleted: number;
      elapsedSeconds: number;
      retentionSeconds: number[];
      meditationSeconds: number;
    };

const LOOKAHEAD_VISIBLE_SEC = 0.2;
const LOOKAHEAD_HIDDEN_SEC = 2.5;
const SCHEDULER_INTERVAL_MS = 25;
const START_DELAY_SEC = 0.1;
/** Chime de aviso quando faltam 3 respirações para o fim do round. */
const LAST_BREATHS_WARNING = 3;

/**
 * Relógio único da sessão: a timeline inteira vive em tempos absolutos do
 * relógio de áudio. Um setInterval curto agenda o áudio com lookahead
 * ("A Tale of Two Clocks") e um loop de requestAnimationFrame dispara as
 * transições de fase da UI a partir do mesmo relógio — som, animação e
 * contador não podem derivar entre si. Pausar = suspender o AudioContext,
 * que congela tudo atomicamente.
 */
export class BreathEngine {
  private cfg: ExerciseConfig;
  private sink: AudioSink;
  private segments: Segment[] = [];
  private index = 0;
  private scheduleCursor = 0;
  private lookahead = LOOKAHEAD_VISIBLE_SEC;
  private intervalId: number | null = null;
  private rafId: number | null = null;
  private listener: ((e: EngineEvent) => void) | null = null;
  private lastTickSeconds = -1;
  private retention: number[] = [];
  private startedAt = 0;
  private done = false;
  private paused = false;

  constructor(sink: AudioSink, config: ExerciseConfig) {
    this.sink = sink;
    this.cfg = config;
  }

  onEvent(cb: (e: EngineEvent) => void) {
    this.listener = cb;
  }

  start() {
    const t0 = this.sink.now() + START_DELAY_SEC;
    this.startedAt = t0;
    this.segments = buildTimeline(this.cfg, t0);
    this.emitSegment(this.segments[0]);
    this.scheduleAhead();
    this.intervalId = window.setInterval(() => this.scheduleAhead(), SCHEDULER_INTERVAL_MS);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.loop();
  }

  stop() {
    if (this.intervalId !== null) clearInterval(this.intervalId);
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.intervalId = null;
    this.rafId = null;
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.sink.cancelScheduled();
    this.done = true;
  }

  async pause() {
    if (this.paused || this.done) return;
    this.paused = true;
    await this.sink.suspend();
  }

  async resume() {
    if (!this.paused) return;
    this.paused = false;
    await this.sink.resume();
  }

  isPaused() {
    return this.paused;
  }

  /** Encerra a retenção livre atual ("preciso respirar"). */
  endRetentionNow() {
    const now = this.sink.now();
    const seg = this.segments[this.index];
    if (this.done || seg?.phase !== 'APNEA' || !seg.countUp) return;
    this.segments = resolveRetention(this.cfg, this.segments, now);
    this.advance(now);
    this.scheduleAhead();
  }

  /**
   * Reinicia a fase atual do zero (ex.: uma ligação interrompeu a
   * respiração — refaz o round inteiro em vez de retomar no meio).
   * Na recuperação, "voltar" significa desfazer a apnéia que acabou de
   * terminar (por exemplo um toque acidental em "Respirar") e refazê-la.
   */
  restartCurrentPhase() {
    if (this.done) return;
    const now = this.sink.now() + START_DELAY_SEC;
    const seg = this.segments[this.index];
    if (!seg) return;

    let rebuilt: Segment[];
    let spliceIdx: number;

    switch (seg.phase) {
      case 'PREPARE':
        rebuilt = restartPrepare(this.cfg, now);
        spliceIdx = 0;
        break;
      case 'BREATHING_INHALE':
      case 'BREATHING_EXHALE':
        rebuilt = restartBreathing(this.cfg, seg.round, now);
        spliceIdx = this.segments.findIndex((s) => s.round === seg.round);
        break;
      case 'APNEA':
        rebuilt = restartApnea(this.cfg, seg.round, now);
        spliceIdx = this.segments.findIndex((s) => s.round === seg.round && s.phase === 'APNEA');
        break;
      case 'RECOVERY_HOLD':
        // Volta para a apneia deste round (desfaz o fim da retenção).
        rebuilt = restartApnea(this.cfg, seg.round, now);
        spliceIdx = this.segments.findIndex((s) => s.round === seg.round && s.phase === 'APNEA');
        this.retention.pop();
        break;
      case 'RECOVERY_RELEASE':
        rebuilt = restartRelease(this.cfg, seg.round, now);
        spliceIdx = this.segments.findIndex((s) => s.round === seg.round && s.phase === 'RECOVERY_RELEASE');
        break;
      case 'MEDITATION':
        rebuilt = restartMeditation(this.cfg, now);
        spliceIdx = this.index;
        break;
      default:
        return;
    }

    if (spliceIdx < 0) spliceIdx = this.index;
    this.segments = [...this.segments.slice(0, spliceIdx), ...rebuilt];
    this.index = spliceIdx;
    this.scheduleCursor = spliceIdx;
    this.sink.cancelScheduled();
    this.emitSegment(this.segments[this.index]);
    this.scheduleAhead();
  }

  /** Termina a sessão antecipadamente com resultado parcial. */
  finishEarly() {
    if (this.done) return;
    const now = this.sink.now();
    const seg = this.segments[this.index];
    // Retenções de menos de 1s não dizem nada — não poluem o resumo.
    if (seg?.phase === 'APNEA' && now > seg.start + 1) {
      this.retention.push(Math.round(Math.min(now, seg.end) - seg.start));
    }
    this.finish(now);
  }

  private emit(e: EngineEvent) {
    this.listener?.(e);
  }

  private emitSegment(seg: Segment) {
    this.lastTickSeconds = -1;
    this.emit({
      type: 'segment',
      phase: seg.phase,
      round: Math.max(0, seg.round),
      breath: seg.breath,
      seconds: this.displaySeconds(seg, seg.start),
    });
  }

  private displaySeconds(seg: Segment, now: number): number {
    if (seg.countUp) return Math.max(0, Math.floor(now - seg.start));
    if (
      seg.phase === 'APNEA' ||
      seg.phase === 'RECOVERY_HOLD' ||
      seg.phase === 'MEDITATION' ||
      seg.phase === 'PREPARE'
    ) {
      return Math.max(0, Math.ceil(seg.end - now));
    }
    return 0;
  }

  private loop = () => {
    if (this.done) return;
    this.rafId = requestAnimationFrame(this.loop);
    this.advance(this.sink.now());
  };

  private advance(now: number) {
    while (!this.done) {
      const seg = this.segments[this.index];
      if (!seg) return;
      if (now < seg.end) break;

      if (seg.phase === 'APNEA') {
        this.retention.push(Math.round(seg.end - seg.start));
      }
      const next = this.segments[this.index + 1];
      if (!next) return; // aguardando resolveRetention
      if (next.phase === 'ALL_COMPLETE') {
        this.finish(next.start);
        return;
      }
      this.index++;
      this.emitSegment(next);
    }

    if (this.done) return;
    const seg = this.segments[this.index];
    const secs = this.displaySeconds(seg, now);
    const isTimed =
      seg.countUp ||
      seg.phase === 'APNEA' ||
      seg.phase === 'RECOVERY_HOLD' ||
      seg.phase === 'MEDITATION' ||
      seg.phase === 'PREPARE';
    if (isTimed && secs !== this.lastTickSeconds) {
      this.lastTickSeconds = secs;
      this.emit({ type: 'tick', seconds: secs });
    }
  }

  private finish(now: number) {
    if (this.done) return;
    const seg = this.segments[this.index];
    let meditationActual = 0;
    if (seg?.phase === 'MEDITATION') {
      meditationActual = Math.round(Math.min(now, seg.end) - seg.start);
    }
    const elapsed = Math.max(0, Math.round(now - this.startedAt));
    const retention = [...this.retention];
    this.stop();
    this.emit({
      type: 'complete',
      roundsCompleted: retention.length,
      elapsedSeconds: elapsed,
      retentionSeconds: retention,
      meditationSeconds: meditationActual,
    });
  }

  private scheduleAhead() {
    if (this.done || this.paused) return;
    const now = this.sink.now();
    const horizon = now + this.lookahead;
    while (this.scheduleCursor < this.segments.length) {
      const seg = this.segments[this.scheduleCursor];
      if (seg.start > horizon) break;
      if (import.meta.env?.DEV && seg.start < now - 0.05 && seg.phase.startsWith('BREATHING')) {
        console.debug(`[breathEngine] agendamento atrasado ${((now - seg.start) * 1000).toFixed(0)}ms`, seg);
      }
      this.scheduleAudioFor(seg);
      this.scheduleCursor++;
    }
  }

  private scheduleAudioFor(seg: Segment) {
    const dur = seg.end - seg.start;
    switch (seg.phase) {
      case 'BREATHING_INHALE':
        this.sink.scheduleBreath('inhale', seg.start, dur);
        if (seg.breath === 1) this.sink.setAmbience('breathing', seg.start);
        if (seg.breath === this.cfg.breathsPerRound - (LAST_BREATHS_WARNING - 1)) {
          this.sink.scheduleChime(seg.start);
        }
        break;
      case 'BREATHING_EXHALE':
        this.sink.scheduleBreath('exhale', seg.start, dur);
        break;
      case 'APNEA':
        this.sink.scheduleChime(seg.start);
        this.sink.setAmbience('hold', seg.start);
        break;
      case 'RECOVERY_HOLD':
        // A respiração profunda de recuperação do WHM.
        this.sink.scheduleBreath('inhale', seg.start, Math.min(2.5, dur));
        break;
      case 'RECOVERY_RELEASE':
        // Solta o ar retido antes do próximo round.
        this.sink.scheduleBreath('exhale', seg.start, dur);
        break;
      case 'MEDITATION':
        this.sink.scheduleGong(seg.start);
        this.sink.setAmbience('meditation', seg.start);
        if (Number.isFinite(seg.end)) this.sink.scheduleGong(seg.end);
        break;
      default:
        break;
    }
  }

  private onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      this.lookahead = LOOKAHEAD_HIDDEN_SEC;
      this.scheduleAhead();
    } else {
      this.lookahead = LOOKAHEAD_VISIBLE_SEC;
      // Fast-forward imediato: o rAF não roda em aba oculta.
      this.advance(this.sink.now());
    }
  };
}
