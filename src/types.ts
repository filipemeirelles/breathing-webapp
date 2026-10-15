export type RetentionMode = 'countdown' | 'countup';
export type Soundscape = 'breeze' | 'ocean' | 'rain' | 'drone' | 'none';

/** Sentinela de meditationSeconds: medita até o usuário tocar em "Concluir". */
export const UNLIMITED_MEDITATION = -1;

export interface ExerciseConfig {
  rounds: number;
  breathsPerRound: number;
  /** Duração de cada inspiração e de cada expiração, em ms. */
  breathPaceMs: number;
  /** Tempos de apnéia por round (modo 'countdown'). */
  apneaTimesSeconds: number[];
  retentionMode: RetentionMode;
  recoveryHoldSeconds: number;
  /** 0 = desativada; UNLIMITED_MEDITATION = sem limite. */
  meditationSeconds: number;
  prepSeconds: number;
  soundscape: Soundscape;
  /** Batidas binaurais (requer fones de ouvido). */
  binaural: boolean;
  /** Volume do som de fundo (0–1). Não afeta a respiração guiada. */
  ambienceVolume: number;
  /** Vibração nas trocas de fase (onde o aparelho suportar). */
  haptics: boolean;
  /** Bipes suaves nos últimos 3s de apnéia, recuperação e preparo. */
  countdownCues: boolean;
}

export const DEFAULT_CONFIG: ExerciseConfig = {
  rounds: 3,
  breathsPerRound: 30,
  breathPaceMs: 2000,
  apneaTimesSeconds: [60, 90, 120],
  retentionMode: 'countdown',
  recoveryHoldSeconds: 15,
  meditationSeconds: 0,
  prepSeconds: 5,
  soundscape: 'breeze',
  binaural: false,
  ambienceVolume: 0.7,
  haptics: true,
  countdownCues: true,
};

export type Phase =
  | 'PREPARE'
  | 'BREATHING_INHALE'
  | 'BREATHING_EXHALE'
  | 'APNEA'
  | 'RECOVERY_HOLD'
  | 'RECOVERY_RELEASE'
  | 'MEDITATION'
  | 'ALL_COMPLETE';

export interface ExerciseState {
  config: ExerciseConfig;
  currentRound: number;
  currentBreath: number;
  phase: Phase;
  /** Contagem exibida: regressiva ou progressiva conforme a fase/modo. */
  seconds: number;
  /** Duração total do segmento atual em s (Infinity nas fases livres). */
  segmentDuration: number;
  paused: boolean;
}

export interface SessionResult {
  rounds: number;
  totalSeconds: number;
  retentionSeconds: number[];
  meditationSeconds: number;
  date: string;
}
