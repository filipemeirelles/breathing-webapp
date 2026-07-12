import { useEffect, useReducer, useRef, useState } from 'react';
import type { ExerciseConfig, ExerciseState, Phase, SessionResult } from '../types';
import BreathingCircle from '../components/BreathingCircle';
import RoundProgress from '../components/RoundProgress';
import { BreathEngine, type EngineEvent } from '../engine/breathEngine';
import { getAudioSink, startBackground, stopBackground, setMuted } from '../audio';
import './Exercise.css';

type Action =
  | { type: 'SEGMENT'; phase: Phase; round: number; breath: number; seconds: number }
  | { type: 'TICK'; seconds: number };

function reducer(state: ExerciseState, action: Action): ExerciseState {
  if (action.type === 'SEGMENT') {
    return {
      ...state,
      phase: action.phase,
      currentRound: action.round,
      currentBreath: action.breath,
      seconds: action.seconds,
    };
  }
  if (action.type === 'TICK') {
    return { ...state, seconds: action.seconds };
  }
  return state;
}

function makeInitialState(config: ExerciseConfig): ExerciseState {
  return {
    config,
    currentRound: 0,
    currentBreath: 0,
    phase: config.prepSeconds > 0 ? 'PREPARE' : 'BREATHING_INHALE',
    seconds: config.prepSeconds,
    paused: false,
  };
}

const PHASE_BADGES: Record<Phase, string> = {
  PREPARE: 'Prepare-se',
  BREATHING_INHALE: 'Respirando',
  BREATHING_EXHALE: 'Respirando',
  APNEA: 'Apnéia',
  RECOVERY_HOLD: 'Recuperação',
  MEDITATION: 'Meditação',
  ALL_COMPLETE: '',
};

interface Props {
  config: ExerciseConfig;
  onComplete: (result: SessionResult) => void;
}

export default function Exercise({ config, onComplete }: Props) {
  const [state, dispatch] = useReducer(reducer, config, makeInitialState);
  const [muted, setMutedState] = useState(false);
  const engineRef = useRef<BreathEngine | null>(null);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const { phase, currentRound, currentBreath, seconds } = state;

  useEffect(() => {
    const engine = new BreathEngine(getAudioSink(), config);
    engineRef.current = engine;
    engine.onEvent((e: EngineEvent) => {
      if (e.type === 'complete') {
        onCompleteRef.current({
          rounds: e.roundsCompleted,
          totalSeconds: e.elapsedSeconds,
          retentionSeconds: e.retentionSeconds,
          meditationSeconds: e.meditationSeconds,
          date: new Date().toISOString(),
        });
      } else if (e.type === 'segment') {
        dispatch({ type: 'SEGMENT', phase: e.phase, round: e.round, breath: e.breath, seconds: e.seconds });
      } else {
        dispatch({ type: 'TICK', seconds: e.seconds });
      }
    });
    startBackground();
    engine.start();

    return () => {
      engine.stop();
      stopBackground();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleMute() {
    const next = !muted;
    setMutedState(next);
    setMuted(next);
  }

  const showBreatheButton = phase === 'APNEA' && config.retentionMode === 'countup';

  return (
    <div className="exercise-page">
      <header className="exercise-header">
        <RoundProgress currentRound={currentRound} totalRounds={config.rounds} />
        <div className="header-right">
          <span className="phase-badge">{PHASE_BADGES[phase]}</span>
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
          seconds={seconds}
          breathPaceMs={config.breathPaceMs}
        />
        {showBreatheButton && (
          <button className="breathe-btn" onClick={() => engineRef.current?.endRetentionNow()}>
            Respirar
          </button>
        )}
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
