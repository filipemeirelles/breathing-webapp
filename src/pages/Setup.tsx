import { useState } from 'react';
import type { ExerciseConfig } from '../types';
import { initAudio } from '../audio';
import './Setup.css';

interface Props {
  onStart: (config: ExerciseConfig) => void;
}

export default function Setup({ onStart }: Props) {
  const [rounds, setRounds] = useState(3);
  const [breathsPerRound, setBreathsPerRound] = useState(30);
  const [apneaTimes, setApneaTimes] = useState<number[]>([60, 90, 120]);

  function handleRoundsChange(n: number) {
    const next = Math.max(1, Math.min(10, n));
    setRounds(next);
    setApneaTimes((prev) => {
      const updated = [...prev];
      while (updated.length < next) updated.push(updated[updated.length - 1] ?? 60);
      return updated.slice(0, next);
    });
  }

  function handleApneaChange(index: number, value: string) {
    const num = parseInt(value, 10);
    if (isNaN(num) || num < 0) return;
    setApneaTimes((prev) => {
      const updated = [...prev];
      updated[index] = num;
      return updated;
    });
  }

  function formatApneaDisplay(seconds: number) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}min ${s > 0 ? s + 's' : ''}` : `${s}s`;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    initAudio();
    onStart({ rounds, breathsPerRound, apneaTimesSeconds: apneaTimes });
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
          <label className="form-label">Tempo de apnéia por round</label>
          <div className="apnea-inputs">
            {apneaTimes.map((t, i) => (
              <div key={i} className="apnea-row">
                <span className="apnea-round-label">Round {i + 1}</span>
                <div className="apnea-control">
                  <button
                    type="button"
                    className="stepper-btn small"
                    onClick={() => handleApneaChange(i, String(Math.max(10, t - 10)))}
                  >−</button>
                  <span className="apnea-value">{formatApneaDisplay(t)}</span>
                  <button
                    type="button"
                    className="stepper-btn small"
                    onClick={() => handleApneaChange(i, String(Math.min(600, t + 10)))}
                  >+</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <button type="submit" className="start-btn">
          Começar
        </button>
      </form>
    </div>
  );
}
