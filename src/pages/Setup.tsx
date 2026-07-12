import { useState } from 'react';
import type { ExerciseConfig, RetentionMode } from '../types';
import { DEFAULT_CONFIG } from '../types';
import { initAudio } from '../audio';
import './Setup.css';

interface Props {
  onStart: (config: ExerciseConfig) => void;
  initialConfig?: ExerciseConfig;
}

function formatSecondsShort(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}min ${s > 0 ? s + 's' : ''}` : `${s}s`;
}

function formatPace(ms: number) {
  return `${(ms / 1000).toLocaleString('pt-BR')}s`;
}

export default function Setup({ onStart, initialConfig }: Props) {
  const base = initialConfig ?? DEFAULT_CONFIG;
  const [rounds, setRounds] = useState(base.rounds);
  const [breathsPerRound, setBreathsPerRound] = useState(base.breathsPerRound);
  const [breathPaceMs, setBreathPaceMs] = useState(base.breathPaceMs);
  const [apneaTimes, setApneaTimes] = useState<number[]>(base.apneaTimesSeconds.slice(0, base.rounds));
  const [retentionMode, setRetentionMode] = useState<RetentionMode>(base.retentionMode);
  const [recoveryHoldSeconds, setRecoveryHoldSeconds] = useState(base.recoveryHoldSeconds);
  const [meditationSeconds, setMeditationSeconds] = useState(base.meditationSeconds);
  const [loading, setLoading] = useState(false);

  function handleRoundsChange(n: number) {
    const next = Math.max(1, Math.min(10, n));
    setRounds(next);
    setApneaTimes((prev) => {
      const updated = [...prev];
      while (updated.length < next) updated.push(updated[updated.length - 1] ?? 60);
      return updated.slice(0, next);
    });
  }

  function handleApneaChange(index: number, value: number) {
    setApneaTimes((prev) => {
      const updated = [...prev];
      updated[index] = Math.max(10, Math.min(600, value));
      return updated;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await initAudio();
    onStart({
      rounds,
      breathsPerRound,
      breathPaceMs,
      apneaTimesSeconds: apneaTimes,
      retentionMode,
      recoveryHoldSeconds,
      meditationSeconds,
      prepSeconds: base.prepSeconds,
    });
  }

  return (
    <div className="setup-page">
      <header className="setup-header">
        <div className="setup-logo">
          <div className="logo-circle" />
        </div>
        <h1 className="setup-title">Respiração</h1>
        <p className="setup-subtitle">Exercício de respiração profunda e apnéia</p>
      </header>

      <form className="setup-form" onSubmit={handleSubmit}>
        <div className="form-card">
          <label className="form-label">Número de rounds</label>
          <div className="stepper">
            <button
              type="button"
              className="stepper-btn"
              onClick={() => handleRoundsChange(rounds - 1)}
              disabled={rounds <= 1}
            >−</button>
            <span className="stepper-value">{rounds}</span>
            <button
              type="button"
              className="stepper-btn"
              onClick={() => handleRoundsChange(rounds + 1)}
              disabled={rounds >= 10}
            >+</button>
          </div>
        </div>

        <div className="form-card">
          <label className="form-label">
            Respirações por round
            <span className="form-value-badge">{breathsPerRound}</span>
          </label>
          <input
            type="range"
            min={30}
            max={60}
            value={breathsPerRound}
            onChange={(e) => setBreathsPerRound(Number(e.target.value))}
            className="slider"
          />
          <div className="slider-range-labels">
            <span>30</span>
            <span>60</span>
          </div>
        </div>

        <div className="form-card">
          <label className="form-label">
            Ritmo da respiração
            <span className="form-value-badge">{formatPace(breathPaceMs)}</span>
          </label>
          <input
            type="range"
            min={1500}
            max={4000}
            step={250}
            value={breathPaceMs}
            onChange={(e) => setBreathPaceMs(Number(e.target.value))}
            className="slider"
          />
          <div className="slider-range-labels">
            <span>Rápido</span>
            <span>Lento</span>
          </div>
          <p className="form-hint">Duração de cada inspiração e expiração</p>
        </div>

        <div className="form-card">
          <label className="form-label">Retenção (apnéia)</label>
          <div className="mode-toggle">
            <button
              type="button"
              className={`mode-btn${retentionMode === 'countdown' ? ' active' : ''}`}
              onClick={() => setRetentionMode('countdown')}
            >
              Cronômetro
            </button>
            <button
              type="button"
              className={`mode-btn${retentionMode === 'countup' ? ' active' : ''}`}
              onClick={() => setRetentionMode('countup')}
            >
              Livre
            </button>
          </div>
          {retentionMode === 'countdown' ? (
            <div className="apnea-inputs">
              {apneaTimes.map((t, i) => (
                <div key={i} className="apnea-row">
                  <span className="apnea-round-label">Round {i + 1}</span>
                  <div className="apnea-control">
                    <button
                      type="button"
                      className="stepper-btn small"
                      onClick={() => handleApneaChange(i, t - 10)}
                    >−</button>
                    <span className="apnea-value">{formatSecondsShort(t)}</span>
                    <button
                      type="button"
                      className="stepper-btn small"
                      onClick={() => handleApneaChange(i, t + 10)}
                    >+</button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="form-hint">
              Segure até sentir vontade de respirar e toque em “Respirar”. Seu tempo é registrado a cada round.
            </p>
          )}
        </div>

        <div className="form-card">
          <label className="form-label">
            Tempo de recuperação
            <span className="form-value-badge">{recoveryHoldSeconds}s</span>
          </label>
          <div className="stepper">
            <button
              type="button"
              className="stepper-btn"
              onClick={() => setRecoveryHoldSeconds(Math.max(5, recoveryHoldSeconds - 5))}
              disabled={recoveryHoldSeconds <= 5}
            >−</button>
            <span className="stepper-value">{recoveryHoldSeconds}s</span>
            <button
              type="button"
              className="stepper-btn"
              onClick={() => setRecoveryHoldSeconds(Math.min(60, recoveryHoldSeconds + 5))}
              disabled={recoveryHoldSeconds >= 60}
            >+</button>
          </div>
          <p className="form-hint">Inspire fundo e segure após cada apnéia</p>
        </div>

        <div className="form-card">
          <label className="form-label">Meditação final</label>
          <div className="stepper">
            <button
              type="button"
              className="stepper-btn"
              onClick={() => setMeditationSeconds(Math.max(0, meditationSeconds - 60))}
              disabled={meditationSeconds <= 0}
            >−</button>
            <span className="stepper-value">
              {meditationSeconds === 0 ? 'Desativada' : `${meditationSeconds / 60}min`}
            </span>
            <button
              type="button"
              className="stepper-btn"
              onClick={() => setMeditationSeconds(Math.min(1200, meditationSeconds + 60))}
              disabled={meditationSeconds >= 1200}
            >+</button>
          </div>
          <p className="form-hint">Tempo de meditação após o último round</p>
        </div>

        <button type="submit" className="start-btn" disabled={loading}>
          {loading ? 'Carregando...' : 'Começar'}
        </button>
      </form>
    </div>
  );
}
