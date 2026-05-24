import { useEffect, useReducer, useRef, useState } from 'react';
import type { ExerciseConfig, ExerciseState } from '../types';
import BreathingCircle from '../components/BreathingCircle';
import RoundProgress from '../components/RoundProgress';
import { startBackground, stopBackground, playBreathTone, stopBreathTone, setMuted } from '../audio';
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
  const [muted, setMutedState] = useState(false);
  const startTimeRef = useRef(Date.now());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { phase, currentRound, currentBreath, secondsLeft } = state;

  // Start / stop background audio
  useEffect(() => {
    startBackground();
    return () => {
      stopBackground();
      stopBreathTone();
    };
  }, []);

  // Play breath tone on each phase change
  useEffect(() => {
    if (phase === 'BREATHING_INHALE') {
      playBreathTone('inhale');
    } else if (phase === 'BREATHING_EXHALE') {
      playBreathTone('exhale');
    } else {
      stopBreathTone();
    }
  }, [phase, currentBreath]);

  // Phase transition timers
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

  // Countdown tick for apnea and recovery
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    if (phase === 'APNEA' || phase === 'RECOVERY_HOLD') {
      interval = setInterval(() => dispatch({ type: 'TICK' }), 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [phase]);

  function toggleMute() {
    const next = !muted;
    setMutedState(next);
    setMuted(next);
  }

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
        <div className="header-right">
          <span className="phase-badge">{phaseLabel}</span>
          <button className="mute-btn" onClick={toggleMute} title={muted ? 'Ativar som' : 'Silenciar'}>
            {muted ? <IconMuted /> : <IconSound />}
          </button>
        </div>
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

function IconSound() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  );
}

function IconMuted() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none" />
      <line x1="23" y1="9" x2="17" y2="15" />
      <line x1="17" y1="9" x2="23" y2="15" />
    </svg>
  );
}
