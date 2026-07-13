import type { CSSProperties } from 'react';
import type { Phase } from '../types';
import './BreathingCircle.css';

interface Props {
  phase: Phase;
  breathCount: number;
  totalBreaths: number;
  seconds: number;
  breathPaceMs: number;
  paused?: boolean;
}

const LABELS: Record<Phase, string> = {
  PREPARE: 'Prepare-se',
  BREATHING_INHALE: 'Inspire',
  BREATHING_EXHALE: 'Expire',
  APNEA: 'Apnéia',
  RECOVERY_HOLD: 'Segure o ar',
  RECOVERY_RELEASE: 'Solte o ar',
  MEDITATION: 'Meditação',
  ALL_COMPLETE: '',
};

const SUBLABELS: Record<Phase, string> = {
  PREPARE: 'encontre uma posição confortável',
  BREATHING_INHALE: 'pelo nariz',
  BREATHING_EXHALE: 'pela boca',
  APNEA: 'Segure a respiração',
  RECOVERY_HOLD: 'inspire fundo',
  RECOVERY_RELEASE: 'relaxe e solte',
  MEDITATION: 'relaxe e observe',
  ALL_COMPLETE: '',
};

function formatSeconds(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}:${sec.toString().padStart(2, '0')}` : `${sec}`;
}

export default function BreathingCircle({ phase, breathCount, totalBreaths, seconds, breathPaceMs, paused = false }: Props) {
  const isBreathing = phase === 'BREATHING_INHALE' || phase === 'BREATHING_EXHALE';
  const showTimer =
    phase === 'PREPARE' || phase === 'APNEA' || phase === 'RECOVERY_HOLD' || phase === 'MEDITATION';

  const style = { '--breath-duration': `${breathPaceMs}ms` } as CSSProperties;

  return (
    <div className="breathing-circle-wrapper" style={style}>
      <div
        className={`breathing-circle${paused ? ' paused' : ''}`}
        data-phase={phase}
        key={`${phase}-${breathCount}`}
      />
      <div className="breathing-info">
        <div className="breathing-label">{LABELS[phase]}</div>
        <div className="breathing-sublabel">{SUBLABELS[phase]}</div>
        {isBreathing && (
          <div className="breath-counter">{breathCount} / {totalBreaths}</div>
        )}
        {showTimer && (
          <div className="timer-display">{formatSeconds(seconds)}</div>
        )}
      </div>
    </div>
  );
}
