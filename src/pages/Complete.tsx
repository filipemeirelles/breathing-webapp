import type { SessionResult } from '../types';
import './Complete.css';

interface Props {
  result: SessionResult;
  onRestart: () => void;
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}min ${s > 0 ? s + 's' : ''}`;
}

function formatClock(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function Complete({ result, onRestart }: Props) {
  const { rounds, totalSeconds, retentionSeconds, meditationSeconds } = result;

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
        <p className="complete-sub">Muito bem. Você completou {rounds === 1 ? '1 round' : `${rounds} rounds`}.</p>

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
          {meditationSeconds > 0 && (
            <>
              <div className="stat-divider" />
              <div className="stat">
                <span className="stat-value">{formatTime(meditationSeconds)}</span>
                <span className="stat-label">meditação</span>
              </div>
            </>
          )}
        </div>

        {retentionSeconds.length > 0 && (
          <div className="retention-list">
            <span className="retention-title">Retenção por round</span>
            {retentionSeconds.map((t, i) => (
              <div key={i} className="retention-row">
                <span className="retention-round">Round {i + 1}</span>
                <span className="retention-time">{formatClock(t)}</span>
              </div>
            ))}
          </div>
        )}

        <button className="restart-btn" onClick={onRestart}>
          Novo exercício
        </button>
      </div>
    </div>
  );
}
