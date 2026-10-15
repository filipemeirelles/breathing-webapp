import type { CSSProperties } from 'react';
import type { Phase } from '../types';
import { formatClock } from '../format';
import './BreathingCircle.css';

interface Props {
  phase: Phase;
  breathCount: number;
  totalBreaths: number;
  seconds: number;
  /** Duração do segmento atual em s; Infinity = fase livre (count-up). */
  segmentDuration: number;
  breathPaceMs: number;
  paused?: boolean;
  /** Quando presente, o orbe vira um alvo grande e tocável (apnéia livre). */
  onTap?: () => void;
}

const LABELS: Record<Phase, string> = {
  PREPARE: 'Prepare-se',
  BREATHING_INHALE: 'Inspire',
  BREATHING_EXHALE: 'Expire',
  APNEA: 'Segure',
  RECOVERY_HOLD: 'Inspire fundo e segure',
  RECOVERY_RELEASE: 'Solte o ar',
  MEDITATION: 'Meditação',
  ALL_COMPLETE: '',
};

const SUBLABELS: Record<Phase, string> = {
  PREPARE: 'encontre uma posição confortável',
  BREATHING_INHALE: 'pelo nariz, enchendo a barriga',
  BREATHING_EXHALE: 'pela boca, sem forçar',
  APNEA: 'pulmões vazios, corpo relaxado',
  RECOVERY_HOLD: 'pulmões cheios',
  RECOVERY_RELEASE: 'relaxe e solte',
  MEDITATION: 'relaxe e observe',
  ALL_COMPLETE: '',
};

/** Fases com contagem de tempo no centro do orbe. */
const TIMED: Phase[] = ['PREPARE', 'APNEA', 'RECOVERY_HOLD', 'MEDITATION'];

const RING_LENGTH = 100;

export default function BreathingCircle({
  phase,
  breathCount,
  totalBreaths,
  seconds,
  segmentDuration,
  breathPaceMs,
  paused = false,
  onTap,
}: Props) {
  const isBreathing = phase === 'BREATHING_INHALE' || phase === 'BREATHING_EXHALE';
  const isFree = !Number.isFinite(segmentDuration);
  const showTimer = TIMED.includes(phase);

  // Anel: respirações feitas no round, ou tempo restante da fase
  let progress = 0;
  if (isBreathing) progress = breathCount / Math.max(1, totalBreaths);
  else if (showTimer && !isFree && segmentDuration > 0) progress = seconds / segmentDuration;

  const style = { '--breath-duration': `${breathPaceMs}ms` } as CSSProperties;
  const segKey = `${phase}-${breathCount}`;
  // O anel remonta ao trocar de fase (sem animar do valor anterior),
  // mas não a cada respiração — aí ele avança suavemente.
  const ringKey = isBreathing ? 'breathing' : phase;

  const stage = (
    <>
      <svg className="orb-ring" viewBox="0 0 100 100" aria-hidden="true">
        <circle className="orb-ring-track" cx="50" cy="50" r="47" />
        {isFree && showTimer ? (
          <circle key="free" className="orb-ring-free" cx="50" cy="50" r="47" pathLength={RING_LENGTH} />
        ) : (
          <circle
            key={ringKey}
            className="orb-ring-progress"
            cx="50"
            cy="50"
            r="47"
            pathLength={RING_LENGTH}
            style={{ strokeDashoffset: RING_LENGTH * (1 - progress) }}
          />
        )}
      </svg>
      <div className={`breathing-circle${paused ? ' paused' : ''}`} data-phase={phase} key={segKey} />
      <div className="orb-center">
        {isBreathing && (
          <div className="breath-counter">
            <span className="breath-counter-value">{breathCount}</span>
            <span className="breath-counter-total">de {totalBreaths}</span>
          </div>
        )}
        {showTimer && <div className="timer-display">{formatClock(seconds, true)}</div>}
      </div>
    </>
  );

  return (
    <div className="breathing-circle-wrapper" style={style} data-phase={phase}>
      {onTap ? (
        <button
          type="button"
          className={`orb-stage tappable breathe-giant-circle${paused ? ' paused' : ''}`}
          onClick={onTap}
          disabled={paused}
          aria-label="Respirar: encerrar a retenção"
        >
          {stage}
        </button>
      ) : (
        <div className="orb-stage">{stage}</div>
      )}
      <div className="breathing-info">
        <div className="breathing-label">{LABELS[phase]}</div>
        <div className="breathing-sublabel">
          {onTap ? 'toque no círculo quando precisar respirar' : SUBLABELS[phase]}
        </div>
      </div>
    </div>
  );
}
