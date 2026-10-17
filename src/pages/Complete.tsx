import type { SessionResult } from '../types';
import { formatClock, formatDuration } from '../format';
import { IconCheck, IconUndo } from '../components/Icons';
import './Complete.css';

interface Props {
  result: SessionResult;
  /** Melhor retenção do histórico antes desta sessão (0 = primeira). */
  previousBest: number;
  onRepeat: () => void;
  onHome: () => void;
}

export default function Complete({ result, previousBest, onRepeat, onHome }: Props) {
  const { rounds, totalSeconds, retentionSeconds, meditationSeconds } = result;
  const best = Math.max(0, ...retentionSeconds);
  const average = retentionSeconds.length
    ? Math.round(retentionSeconds.reduce((a, b) => a + b, 0) / retentionSeconds.length)
    : 0;
  const isRecord = best > 0 && previousBest > 0 && best > previousBest;
  const scale = Math.max(best, previousBest, 1);

  return (
    <div className="complete-page">
      <div className="complete-card">
        <div className="complete-circle">
          <IconCheck />
        </div>

        <h2 className="complete-title">Sessão concluída</h2>
        <p className="complete-sub">
          {rounds === 0
            ? 'Encerrada antes da primeira retenção. Tudo bem — volte quando quiser.'
            : `Você completou ${rounds === 1 ? '1 round' : `${rounds} rounds`}. Repare como o corpo está agora.`}
        </p>

        {isRecord && (
          <div className="record-badge" role="status">
            Novo recorde · antes {formatClock(previousBest)}
          </div>
        )}

        <div className="complete-stats">
          <div className="stat">
            <span className="stat-value">{formatDuration(totalSeconds)}</span>
            <span className="stat-label">duração</span>
          </div>
          {best > 0 && (
            <div className="stat">
              <span className="stat-value">{formatClock(best)}</span>
              <span className="stat-label">melhor retenção</span>
            </div>
          )}
          {retentionSeconds.length > 1 && (
            <div className="stat">
              <span className="stat-value">{formatClock(average)}</span>
              <span className="stat-label">média</span>
            </div>
          )}
          {meditationSeconds > 0 && (
            <div className="stat">
              <span className="stat-value">{formatDuration(meditationSeconds)}</span>
              <span className="stat-label">meditação</span>
            </div>
          )}
        </div>

        {retentionSeconds.length > 0 && (
          <div className="retention-list">
            <span className="retention-title">Retenção por round</span>
            {retentionSeconds.map((t, i) => (
              <div key={i} className={`retention-row${t === best ? ' best' : ''}`}>
                <span className="retention-round">{i + 1}</span>
                <span className="retention-bar-track">
                  <span className="retention-bar" style={{ width: `${(t / scale) * 100}%`, animationDelay: `${i * 90}ms` }} />
                  {previousBest > 0 && (
                    <span className="retention-mark" style={{ left: `${(previousBest / scale) * 100}%` }} />
                  )}
                </span>
                <span className="retention-time">{formatClock(t)}</span>
              </div>
            ))}
            {previousBest > 0 && <span className="retention-legend">a linha marca seu recorde anterior</span>}
          </div>
        )}

        <div className="complete-actions">
          <button className="btn-primary restart-btn" onClick={onRepeat}>
            Repetir sessão
          </button>
          <button className="btn-ghost home-btn" onClick={onHome}>
            <IconUndo />
            Ajustar e voltar
          </button>
        </div>
      </div>
    </div>
  );
}
