import { useEffect, useReducer, useRef } from 'react';
import type { ExerciseConfig, ExerciseState } from '../types';
import BreathingCircle from '../components/BreathingCircle';
import RoundProgress from '../components/RoundProgress';
import './Exercise.css';

const INHALE_MS = 2000;
const EXHALE_MS = 2000;
const RECOVERY_SECONDS = 10;

type Action =
  | { type: 'NEXT_PHASE' }
  | { type: 'TICK' };

function nextPhase(state: ExerciseState): ExerciseState {
  const { config, currentRound, currentBreath, phase } = state;

  if (phase === 'BREATHING_INHALE') {
    return { ...state, phase: 'BREATHING_EXHALE' };
  }

  if (phase === 'BREATHING_EXHALE') {
    const nextBreath = currentBreath + 1;
    if (nextBreath <= config.breathsPerRound) {
      return { ...state, phase: 'BREATHING_INHALE', currentBreath: nextBreath };
    }
    return {
      ...state,
      phase: 'APNEA',
      secondsLeft: config.apneaTimesSeconds[currentRound],
    };
  }

  if (phase === 'APNEA') {
    return { ...state, phase: 'RECOVERY_HOLD', secondsLeft: RECOVERY_SECONDS };
  }

  if (phase === 'RECOVERY_HOLD') {
    const nextRound = currentRound + 1;
    if (nextRound < config.rounds) {
      return {
        ...state,
        currentRound: nextRound,
        currentBreath: 1,
        phase: 'BREATHING_INHALE',
        secondsLeft: 0,
      };
    }
    return { ...state, phase: 'ALL_COMPLETE' };
  }

  return state;
}

function reducer(state: ExerciseState, action: Action): ExerciseState {
  if (action.type === 'NEXT_PHASE') return nextPhase(state);
  if (action.type === 'TICK') {
    if (state.secondsLeft <= 1) return nextPhase(state);
    return { ...state, secondsLeft: state.secondsLeft - 1 };
  }
  return state;
}

function makeInitialState(config: ExerciseConfig): ExerciseState {
  return {
    config,
    currentRound: 0,
    currentBreath: 1,
    phase: 'BREATHING_INHALE',
    secondsLeft: 0,
  };
}

interface Props {
  config: ExerciseConfig;
  onComplete: (rounds: number, totalSeconds: number) => void;
}

export default function Exercise({ config, onComplete }: Props) {
  const [state, dispatch] = useReducer(reducer, config, makeInitialState);
  const startTimeRef = useRef(Date.now());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { phase, currentRound, currentBreath, secondsLeft } = state;

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    if (phase === 'ALL_COMPLETE') {
      const elapsed = Math.round((Date.now() - startTimeRef.current) / 1000);
      onComplete(config.rounds, elapsed);
      return;
    }

    if (phase === 'BREATHING_INHALE') {
      timerRef.current = setTimeout(() => dispatch({ type: 'NEXT_PHASE' }), INHALE_MS);
    } else if (phase === 'BREATHING_EXHALE') {
      timerRef.current = setTimeout(() => dispatch({ type: 'NEXT_PHASE' }), EXHALE_MS);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [phase, currentBreath, currentRound]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    if (phase === 'APNEA' || phase === 'RECOVERY_HOLD') {
      interval = setInterval(() => dispatch({ type: 'TICK' }), 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [phase]);

  const phaseLabel =
    phase === 'APNEA'
      ? 'Apnéia'
      : phase === 'RECOVERY_HOLD'
      ? 'Recuperação'
      : 'Respirando';

  return (
    <div className="exercise-page">
      <header className="exercise-header">
        <RoundProgress currentRound={currentRound} totalRounds={config.rounds} />
        <span className="phase-badge">{phaseLabel}</span>
      </header>

      <main className="exercise-main">
        <BreathingCircle
          phase={phase}
          breathCount={currentBreath}
          totalBreaths={config.breathsPerRound}
          secondsLeft={secondsLeft}
        />
      </main>
    </div>
  );
}
