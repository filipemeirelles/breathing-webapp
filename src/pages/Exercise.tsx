import { useEffect, useReducer, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { ExerciseConfig, ExerciseState, Phase, SessionResult } from '../types';
import { UNLIMITED_MEDITATION } from '../types';
import BreathingCircle from '../components/BreathingCircle';
import RoundProgress from '../components/RoundProgress';
import { BreathEngine, type EngineEvent } from '../engine/breathEngine';
import {
  getAudioSink,
  onAudioStateChange,
  setAmbienceVolume,
  setMuted,
  startBackground,
  stopBackground,
} from '../audio';
import { acquireWakeLock, releaseWakeLock } from '../wakeLock';
import { vibrateForPhase } from '../haptics';
import { formatDuration } from '../format';
import { saveConfig } from '../storage';
import { IconPause, IconPlay, IconSound, IconMuted, IconUndo } from '../components/Icons';
import './Exercise.css';

type Action =
  | { type: 'SEGMENT'; phase: Phase; round: number; breath: number; seconds: number; duration: number }
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
      segmentDuration: action.duration,
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
    // Sem preparo, a primeira inspiração já é a respiração 1 (evita um "0").
    currentBreath: config.prepSeconds > 0 ? 0 : 1,
    phase: config.prepSeconds > 0 ? 'PREPARE' : 'BREATHING_INHALE',
    seconds: config.prepSeconds,
    segmentDuration: config.prepSeconds,
    paused: false,
  };
}

const PHASE_BADGES: Record<Phase, string> = {
  PREPARE: 'Prepare-se',
  BREATHING_INHALE: 'Respiração',
  BREATHING_EXHALE: 'Respiração',
  APNEA: 'Retenção',
  RECOVERY_HOLD: 'Recuperação',
  RECOVERY_RELEASE: 'Recuperação',
  MEDITATION: 'Meditação',
  ALL_COMPLETE: '',
};

/** Tom de cor do fundo/orbe por fase (ver :root[data-tone] em index.css). */
const PHASE_TONES: Record<Phase, string> = {
  PREPARE: 'breath',
  BREATHING_INHALE: 'breath',
  BREATHING_EXHALE: 'breath',
  APNEA: 'hold',
  RECOVERY_HOLD: 'recover',
  RECOVERY_RELEASE: 'recover',
  MEDITATION: 'meditate',
  ALL_COMPLETE: 'meditate',
};

/** Texto do botão "Voltar": na recuperação ele desfaz o fim da apneia. */
const RESTART_LABELS: Partial<Record<Phase, string>> = {
  PREPARE: 'Recomeçar o preparo',
  BREATHING_INHALE: 'Recomeçar as respirações',
  BREATHING_EXHALE: 'Recomeçar as respirações',
  APNEA: 'Recomeçar a retenção',
  RECOVERY_HOLD: 'Voltar para a retenção',
  RECOVERY_RELEASE: 'Recomeçar a recuperação',
  MEDITATION: 'Recomeçar a meditação',
};
const RESTART_LABEL_DEFAULT = 'Voltar ao início desta etapa';

interface Props {
  config: ExerciseConfig;
  onComplete: (result: SessionResult) => void;
}

export default function Exercise({ config, onComplete }: Props) {
  const [state, dispatch] = useReducer(reducer, config, makeInitialState);
  const [muted, setMutedState] = useState(false);
  const [volume, setVolume] = useState(config.ambienceVolume);
  const engineRef = useRef<BreathEngine | null>(null);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const { phase, currentRound, currentBreath, seconds, segmentDuration, paused } = state;

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
        if (config.haptics) vibrateForPhase(e.phase);
        dispatch({
          type: 'SEGMENT',
          phase: e.phase,
          round: e.round,
          breath: e.breath,
          seconds: e.seconds,
          duration: e.duration,
        });
      } else {
        dispatch({ type: 'TICK', seconds: e.seconds });
      }
    });
    // O SO pode suspender o AudioContext (ex.: tela bloqueada); como todo o
    // relógio da sessão vive nele, tratamos como pausa e pedimos um toque
    // para retomar (o gesto é exigido pelo navegador para religar o áudio).
    const unsubscribe = onAudioStateChange((audioState) => {
      if ((audioState === 'suspended' || audioState === 'interrupted') && !engine.isPaused()) {
        void engine.pause();
        dispatch({ type: 'SET_PAUSED', paused: true });
      }
    });
    startBackground(config.soundscape, config.binaural, config.ambienceVolume);
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

  // Cor do fundo acompanha a fase
  useEffect(() => {
    document.documentElement.dataset.tone = PHASE_TONES[phase];
  }, [phase]);
  useEffect(() => () => {
    delete document.documentElement.dataset.tone;
  }, []);

  const showBreatheButton = phase === 'APNEA' && config.retentionMode === 'countup';
  const showFinishMeditation =
    phase === 'MEDITATION' && config.meditationSeconds === UNLIMITED_MEDITATION;

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

  function handleBreathe() {
    engineRef.current?.endRetentionNow();
  }

  function handleVolume(v: number) {
    setVolume(v);
    setAmbienceVolume(v);
    saveConfig({ ...config, ambienceVolume: v });
  }

  // Teclado: Espaço/Enter respira na retenção livre; senão Espaço pausa.
  const keyHandlerRef = useRef<(e: KeyboardEvent) => void>(() => undefined);
  useEffect(() => {
    keyHandlerRef.current = (e: KeyboardEvent) => {
      if (e.repeat || e.target instanceof HTMLInputElement) return;
      if (e.key === ' ' || e.key === 'Enter') {
        // Botões focados já respondem a Enter/Espaço sozinhos
        if (e.target instanceof HTMLButtonElement) return;
        e.preventDefault();
        if (showBreatheButton && !paused) handleBreathe();
        else if (e.key === ' ') handlePauseToggle();
      } else if (e.key === 'Escape' && !paused) {
        handlePauseToggle();
      } else if (e.key === 'm' || e.key === 'M') {
        toggleMute();
      }
    };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyHandlerRef.current(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const isBreathing = phase === 'BREATHING_INHALE' || phase === 'BREATHING_EXHALE';
  let upNext = '';
  if (isBreathing) {
    const apnea = config.apneaTimesSeconds[currentRound] ?? config.apneaTimesSeconds[config.apneaTimesSeconds.length - 1];
    upNext = config.retentionMode === 'countup'
      ? 'Depois: retenção livre'
      : `Depois: retenção de ${formatDuration(apnea ?? 60)}`;
  }

  return (
    <div className="exercise-page" data-phase={phase}>
      <header className="exercise-header">
        <RoundProgress currentRound={currentRound} totalRounds={config.rounds} />
        <span className="phase-badge">{PHASE_BADGES[phase]}</span>
        <div className="header-right">
          <button className="icon-btn mute-btn" onClick={toggleMute} title={muted ? 'Ativar som' : 'Silenciar'}>
            {muted ? <IconMuted /> : <IconSound />}
          </button>
          <button className="icon-btn mute-btn" onClick={handlePauseToggle} title={paused ? 'Continuar' : 'Pausar'}>
            {paused ? <IconPlay /> : <IconPause />}
          </button>
        </div>
      </header>

      <main className="exercise-main">
        <BreathingCircle
          phase={phase}
          breathCount={currentBreath}
          totalBreaths={config.breathsPerRound}
          seconds={seconds}
          segmentDuration={segmentDuration}
          breathPaceMs={config.breathPaceMs}
          paused={paused}
          onTap={showBreatheButton ? handleBreathe : undefined}
        />
        {/* Altura reservada: o conteúdo troca sem deslocar o orbe */}
        <div className="action-slot">
          {showFinishMeditation && !paused ? (
            <button className="btn-primary breathe-btn" onClick={handleFinishEarly}>
              Concluir
            </button>
          ) : (
            upNext && <span className="up-next">{upNext}</span>
          )}
        </div>
      </main>

      {paused && (
        <div className="pause-overlay" role="dialog" aria-modal="true" aria-labelledby="pause-title">
          <div className="pause-card">
            <h2 className="pause-title" id="pause-title">Pausado</h2>
            <p className="pause-sub">
              {PHASE_BADGES[phase]} · round {currentRound + 1} de {config.rounds}
            </p>
            <button className="btn-primary breathe-btn" onClick={handlePauseToggle} autoFocus>
              Continuar
            </button>
            <button className="btn-ghost restart-btn-secondary" onClick={handleRestartPhase}>
              <IconUndo />
              {RESTART_LABELS[phase] ?? RESTART_LABEL_DEFAULT}
            </button>
            {config.soundscape !== 'none' && (
              <label className="pause-volume">
                <span>Som de fundo</span>
                <input
                  type="range"
                  className="slider"
                  min={0}
                  max={1}
                  step={0.05}
                  value={volume}
                  style={{ '--fill': `${volume * 100}%` } as CSSProperties}
                  onChange={(e) => handleVolume(Number(e.target.value))}
                  aria-label="Volume do som de fundo"
                />
              </label>
            )}
            <button className="finish-btn" onClick={handleFinishEarly}>
              Encerrar exercício
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
