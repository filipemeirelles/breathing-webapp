import './Complete.css';

interface Props {
  rounds: number;
  totalSeconds: number;
  onRestart: () => void;
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}min ${s > 0 ? s + 's' : ''}`;
}

export default function Complete({ rounds, totalSeconds, onRestart }: Props) {
  return (
    <div className="complete-page">
      <div className="complete-card">
        <div className="complete-circle">
          <svg viewBox="0 0 60 60" width="36" height="36">
            <polyline
              points="12,30 24,44 48,18"
              fill="none"
              stroke="white"
              strokeWidth="4.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <h2 className="complete-title">Exercício concluído!</h2>
        <p className="complete-sub">Muito bem. Você completou todos os rounds.</p>

        <div className="complete-stats">
          <div className="stat">
            <span className="stat-value">{rounds}</span>
            <span className="stat-label">rounds</span>
          </div>
          <div className="stat-divider" />
          <div className="stat">
            <span className="stat-value">{formatTime(totalSeconds)}</span>
            <span className="stat-label">duração total</span>
          </div>
        </div>

        <button className="restart-btn" onClick={onRestart}>
          Novo exercício
        </button>
      </div>
    </div>
  );
}
