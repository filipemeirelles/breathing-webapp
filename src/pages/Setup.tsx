import { useMemo, useState } from 'react';
import type { ExerciseConfig, RetentionMode, Soundscape } from '../types';
import { UNLIMITED_MEDITATION } from '../types';
import { initAudio } from '../audio';
import { loadConfig, loadHistory, saveConfig } from '../storage';
import './Setup.css';

interface Props {
  onStart: (config: ExerciseConfig) => void;
}

const HISTORY_DISPLAY_LIMIT = 5;

/** Escada de presets da meditação (em segundos); termina em "Sem limite". */
const MEDITATION_STEPS = [0, 60, 120, 180, 300, 600, 900, 1200, 1800, 2700, 3600, UNLIMITED_MEDITATION];

const SOUNDSCAPES: { value: Soundscape; label: string }[] = [
  { value: 'breeze', label: 'Brisa' },
  { value: 'ocean', label: 'Oceano' },
  { value: 'rain', label: 'Chuva' },
  { value: 'none', label: 'Silêncio' },
];

function meditationIndex(seconds: number): number {
  const idx = MEDITATION_STEPS.indexOf(seconds);
  if (idx !== -1) return idx;
  // Valor fora da escada (config antiga): encaixa no degrau mais próximo
  const finite = MEDITATION_STEPS.filter((s) => s >= 0);
  let best = 0;
  for (let i = 0; i < finite.length; i++) {
    if (Math.abs(finite[i] - seconds) < Math.abs(finite[best] - seconds)) best = i;
  }
  return best;
}

function meditationLabel(seconds: number): string {
  if (seconds === 0) return 'Desativada';
  if (seconds === UNLIMITED_MEDITATION) return 'Sem limite';
  return `${seconds / 60}min`;
}

function formatSecondsShort(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}min ${s > 0 ? s + 's' : ''}` : `${s}s`;
}

function formatPace(ms: number) {
  return `${(ms / 1000).toLocaleString('pt-BR')}s`;
}

export default function Setup({ onStart }: Props) {
  const base = useMemo(() => loadConfig(), []);
  const history = useMemo(() => loadHistory(), []);
  const [rounds, setRounds] = useState(base.rounds);
  const [breathsPerRound, setBreathsPerRound] = useState(base.breathsPerRound);
  const [breathPaceMs, setBreathPaceMs] = useState(base.breathPaceMs);
  const [apneaTimes, setApneaTimes] = useState<number[]>(() => {
    const arr = base.apneaTimesSeconds.slice(0, base.rounds);
    while (arr.length < base.rounds) arr.push(arr[arr.length - 1] ?? 60);
    return arr;
  });
  const [retentionMode, setRetentionMode] = useState<RetentionMode>(base.retentionMode);
  const [recoveryHoldSeconds, setRecoveryHoldSeconds] = useState(base.recoveryHoldSeconds);
  const [meditationSeconds, setMeditationSeconds] = useState(base.meditationSeconds);
  const [soundscape, setSoundscape] = useState<Soundscape>(base.soundscape);
  const [binaural, setBinaural] = useState(base.binaural);
  const [loading, setLoading] = useState(false);

  function stepMeditation(delta: 1 | -1) {
    const idx = meditationIndex(meditationSeconds);
    const next = Math.max(0, Math.min(MEDITATION_STEPS.length - 1, idx + delta));
    setMeditationSeconds(MEDITATION_STEPS[next]);
  }

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
    const config: ExerciseConfig = {
      rounds,
      breathsPerRound,
      breathPaceMs,
      apneaTimesSeconds: apneaTimes,
      retentionMode,
      recoveryHoldSeconds,
      meditationSeconds,
      prepSeconds: base.prepSeconds,
      soundscape,
      binaural,
    };
    saveConfig(config);
    try {
      await initAudio();
    } catch {
      // Sem os sons de respiração (offline, fetch bloqueado) o exercício
      // ainda funciona — scheduleBreath ignora buffers ausentes.
    }
    onStart(config);
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
              onClick={() => stepMeditation(-1)}
              disabled={meditationSeconds === 0}
            >−</button>
            <span className="stepper-value wide">{meditationLabel(meditationSeconds)}</span>
            <button
              type="button"
              className="stepper-btn"
              onClick={() => stepMeditation(1)}
              disabled={meditationSeconds === UNLIMITED_MEDITATION}
            >+</button>
          </div>
          <p className="form-hint">
            {meditationSeconds === UNLIMITED_MEDITATION
              ? 'Medite o quanto quiser e toque em “Concluir” para encerrar'
              : 'Tempo de meditação após o último round'}
          </p>
        </div>

        <div className="form-card">
          <label className="form-label">Som de fundo</label>
          <div className="mode-toggle">
            {SOUNDSCAPES.map((s) => (
              <button
                key={s.value}
                type="button"
                className={`mode-btn${soundscape === s.value ? ' active' : ''}`}
                onClick={() => setSoundscape(s.value)}
              >
                {s.label}
              </button>
            ))}
          </div>
          <label className="switch-row">
            <span className="switch-text">
              Batidas binaurais
              <span className="switch-sub">use fones de ouvido</span>
            </span>
            <input
              type="checkbox"
              className="switch-input"
              checked={binaural}
              onChange={(e) => setBinaural(e.target.checked)}
            />
            <span className="switch-track" aria-hidden="true" />
          </label>
        </div>

        <button type="submit" className="start-btn" disabled={loading}>
          {loading ? 'Carregando...' : 'Começar'}
        </button>
      </form>

      {history.length > 0 && (
        <section className="history-section">
          <h2 className="history-title">Sessões recentes</h2>
          {history.slice(0, HISTORY_DISPLAY_LIMIT).map((s, i) => (
            <div key={i} className="history-row">
              <span className="history-date">{formatHistoryDate(s.date)}</span>
              <span className="history-detail">
                {s.rounds} {s.rounds === 1 ? 'round' : 'rounds'}
                {s.retentionSeconds.length > 0 &&
                  ` · melhor retenção ${formatSecondsShort(Math.max(...s.retentionSeconds))}`}
              </span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function formatHistoryDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}
