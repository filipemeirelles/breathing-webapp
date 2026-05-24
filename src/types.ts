export interface ExerciseConfig {
  rounds: number;
  breathsPerRound: number;
  apneaTimesSeconds: number[];
}

export type Phase =
  | 'BREATHING_INHALE'
  | 'BREATHING_EXHALE'
  | 'APNEA'
  | 'RECOVERY_HOLD'
  | 'ALL_COMPLETE';

export interface ExerciseState {
  config: ExerciseConfig;
  currentRound: number;
  currentBreath: number;
  phase: Phase;
  secondsLeft: number;
}
