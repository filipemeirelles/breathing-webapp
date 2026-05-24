import type { Phase } from '../types';
import './BreathingCircle.css';

interface Props {
  phase: Phase;
  breathCount: number;
  totalBreaths: number;
  secondsLeft: number;
}

const LABELS: Record<Phase, string> = {
  BREATHING_INHALE: 'Inspire',
  BREATHING_EXHALE: 'Expire',
  APNEA: 'Apnéia',
  RECOVERY_HOLD: 'Segure o ar',
  ALL_COMPLETE: '',
};

const SUBLABELS: Record<Phase, string> = {
  BREATHING_INHALE: 'pelo nariz',
  BREATHING_EXHALE: 'pela boca',
  APNEA: 'Segure a respiração',
  RECOVERY_HOLD: 'inspire fundo',
  ALL_COMPLETE: '',
};

function formatSeconds(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}:${sec.toString().padStart(2, '0')}` : `${sec}`;
}

export default function BreathingCircle({ phase, breathCount, totalBreaths, secondsLeft }: Props) {
  const isBreathing = phase === 'BREATHING_INHALE' || phase === 'BREATHING_EXHALE';

  return (
    <div className="breathing-circle-wrapper">
      <div className="breathing-circle" data-phase={phase} key={`${phase}-${breathCount}`} />
      <div>
        <div className="breathing-label">{LABELS[phase]}</div>
        <div className="breathing-sublabel">{SUBLABELS[phase]}</div>
        {isBreathing && (
          <div className="breath-counter">{breathCount} / {totalBreaths}</div>
        )}
        {(phase === 'APNEA' || phase === 'RECOVERY_HOLD') && (
          <div className="timer-display">{formatSeconds(secondsLeft)}</div>
        )}
      </div>
    </div>
  );
}
