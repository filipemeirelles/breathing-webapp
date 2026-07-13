import { useEffect, useReducer, useRef, useState } from 'react';
import type { ExerciseConfig, ExerciseState, Phase, SessionResult } from '../types';
import { UNLIMITED_MEDITATION } from '../types';
import BreathingCircle from '../components/BreathingCircle';
import RoundProgress from '../components/RoundProgress';
import { BreathEngine, type EngineEvent } from '../engine/breathEngine';
import { getAudioSink, startBackground, stopBackground, setMuted, onAudioStateChange } from '../audio';
import { acquireWakeLock, releaseWakeLock } from '../wakeLock';
import './Exercise.css';

type Action =
  | { type: 'SEGMENT'; phase: Phase; round: number; breath: number; seconds: number }
  | { type: 'TICK'; seconds: number }
  | { type: 'SET_PAUSED'; paused: boolean };

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
  if (action.type === 'SET_PAUSED') {
    return { ...state, paused: action.paused };
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
  RECOVERY_RELEASE: 'Recuperação',
  MEDITATION: 'Meditação',
  ALL_COMPLETE: '',
};

/** Texto do botão "Voltar": na recuperação ele desfaz o fim da apneia. */
const RESTART_LABELS: Partial<Record<Phase, string>> = {
  RECOVERY_HOLD: 'Voltar para a apnéia',
};
const RESTART_LABEL_DEFAULT = 'Voltar ao início desta etapa';

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

  const { phase, currentRound, currentBreath, seconds, paused } = state;

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
    // O SO pode suspender o AudioContext (ex.: tela bloqueada); como todo o
    // relógio da sessão vive nele, tratamos como pausa e pedimos um toque
    // para retomar (o gesto é exigido pelo navegador para religar o áudio).
    const unsubscribe = onAudioStateChange((audioState) => {
      if (audioState === 'suspended' && !engine.isPaused()) {
        void engine.pause();
        dispatch({ type: 'SET_PAUSED', paused: true });
      }
    });
    startBackground(config.soundscape, config.binaural);
    engine.start();
    void acquireWakeLock();

    return () => {
      unsubscribe();
      engine.stop();
      stopBackground();
      releaseWakeLock();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleMute() {
    const next = !muted;
    setMutedState(next);
    setMuted(next);
  }

  function handlePauseToggle() {
    const engine = engineRef.current;
    if (!engine) return;
    if (paused) {
      void engine.resume();
      dispatch({ type: 'SET_PAUSED', paused: false });
    } else {
      void engine.pause();
      dispatch({ type: 'SET_PAUSED', paused: true });
    }
  }

  function handleFinishEarly() {
    const engine = engineRef.current;
    if (!engine) return;
    // finishEarly emite 'complete', que leva à tela de resumo.
    void engine.resume();
    engine.finishEarly();
  }

  function handleRestartPhase() {
    const engine = engineRef.current;
    if (!engine) return;
    void engine.resume();
    engine.restartCurrentPhase();
    dispatch({ type: 'SET_PAUSED', paused: false });
  }

  const showBreatheButton = phase === 'APNEA' && config.retentionMode === 'countup';
  const showFinishMeditation =
    phase === 'MEDITATION' && config.meditationSeconds === UNLIMITED_MEDITATION;

  return (
    <div className="exercise-page">
      <header className="exercise-header">
        <RoundProgress currentRound={currentRound} totalRounds={config.rounds} />
        <div className="header-right">
          <span className="phase-badge">{PHASE_BADGES[phase]}</span>
          <button className="mute-btn" onClick={handlePauseToggle} title={paused ? 'Continuar' : 'Pausar'}>
            {paused ? <IconPlay /> : <IconPause />}
          </button>
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
          paused={paused}
        />
        {/* Altura reservada: o botão aparece sem deslocar o círculo */}
        <div className="action-slot">
          {showBreatheButton && !paused && (
            <button className="breathe-btn" onClick={() => engineRef.current?.endRetentionNow()}>
              Respirar
            </button>
          )}
          {showFinishMeditation && !paused && (
            <button className="breathe-btn" onClick={handleFinishEarly}>
              Concluir
            </button>
          )}
        </div>
      </main>

      {paused && (
        <div className="pause-overlay">
          <div className="pause-card">
            <h2 className="pause-title">Pausado</h2>
            <button className="breathe-btn" onClick={handlePauseToggle}>
              Continuar
            </button>
            <button className="restart-btn-secondary" onClick={handleRestartPhase}>
              <IconUndo />
              {RESTART_LABELS[phase] ?? RESTART_LABEL_DEFAULT}
            </button>
            <button className="finish-btn" onClick={handleFinishEarly}>
              Encerrar exercício
            </button>
          </div>
        </div>
      )}
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

function IconPause() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
      <rect x="6" y="4" width="4" height="16" rx="1.5" />
      <rect x="14" y="4" width="4" height="16" rx="1.5" />
    </svg>
  );
}

function IconPlay() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
      <path d="M8 5.14v13.72c0 .93 1.03 1.5 1.82.99l10.4-6.86c.7-.46.7-1.52 0-1.98L9.82 4.15C9.03 3.64 8 4.2 8 5.14z" />
    </svg>
  );
}

function IconUndo() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7v6h6" />
      <path d="M3.51 13a9 9 0 1 0 2.13-9.36L3 7" />
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
