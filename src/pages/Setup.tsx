import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { ExerciseConfig, RetentionMode, Soundscape } from '../types';
import { UNLIMITED_MEDITATION } from '../types';
import { initAudio, previewSoundscape, stopPreview } from '../audio';
import { computeStats, loadConfig, loadHistory, saveConfig } from '../storage';
import { buildTimeline } from '../engine/timeline';
import { formatApproxMinutes, formatDuration } from '../format';
import { IconHeadphones, IconPlayPreview } from '../components/Icons';
import './Setup.css';

interface Props {
  onStart: (config: ExerciseConfig) => void;
}

const HISTORY_DISPLAY_LIMIT = 5;
const MAX_ROUNDS = 10;
const APNEA_STEP = 10;
const APNEA_MIN = 10;
const APNEA_MAX = 600;
/** Retenção assumida por round no modo livre, só para estimar a duração. */
const FREE_RETENTION_ESTIMATE = 90;

/** Escada de presets da meditação (em segundos); termina em "Sem limite". */
const MEDITATION_STEPS = [0, 60, 120, 180, 300, 600, 900, 1200, 1800, 2700, 3600, UNLIMITED_MEDITATION];

const SOUNDSCAPES: { value: Soundscape; label: string }[] = [
  { value: 'breeze', label: 'Brisa' },
  { value: 'ocean', label: 'Oceano' },
  { value: 'rain', label: 'Chuva' },
  { value: 'drone', label: 'Ressonância' },
  { value: 'none', label: 'Silêncio' },
];

interface Preset {
  id: string;
  label: string;
  hint: string;
  values: Pick<ExerciseConfig, 'rounds' | 'breathsPerRound' | 'breathPaceMs' | 'apneaTimesSeconds' | 'retentionMode'>;
}

const PRESETS: Preset[] = [
  {
    id: 'beginner',
    label: 'Iniciante',
    hint: '3 rounds · retenções curtas',
    values: { rounds: 3, breathsPerRound: 30, breathPaceMs: 2250, apneaTimesSeconds: [45, 60, 75], retentionMode: 'countdown' },
  },
  {
    id: 'classic',
    label: 'Clássico',
    hint: '3 rounds · 1, 1:30 e 2 min',
    values: { rounds: 3, breathsPerRound: 30, breathPaceMs: 2000, apneaTimesSeconds: [60, 90, 120], retentionMode: 'countdown' },
  },
  {
    id: 'advanced',
    label: 'Avançado',
    hint: '4 rounds · 40 respirações',
    values: { rounds: 4, breathsPerRound: 40, breathPaceMs: 1750, apneaTimesSeconds: [90, 120, 150, 180], retentionMode: 'countdown' },
  },
  {
    id: 'free',
    label: 'Livre',
    hint: 'segure o quanto quiser',
    values: { rounds: 3, breathsPerRound: 30, breathPaceMs: 2000, apneaTimesSeconds: [60, 90, 120], retentionMode: 'countup' },
  },
];

function presetMatches(p: Preset, c: ExerciseConfig): boolean {
  const v = p.values;
  if (v.rounds !== c.rounds || v.breathsPerRound !== c.breathsPerRound) return false;
  if (v.breathPaceMs !== c.breathPaceMs || v.retentionMode !== c.retentionMode) return false;
  // No modo livre os tempos de apnéia não importam
  if (v.retentionMode === 'countup') return true;
  return v.apneaTimesSeconds.every((t, i) => c.apneaTimesSeconds[i] === t);
}

function fitApnea(times: number[], rounds: number): number[] {
  const arr = times.slice(0, rounds);
  while (arr.length < rounds) arr.push(arr[arr.length - 1] ?? 60);
  return arr;
}

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
  if (seconds === 0) return 'Desligada';
  if (seconds === UNLIMITED_MEDITATION) return 'Sem limite';
  return `${seconds / 60} min`;
}

function formatPace(ms: number) {
  return `${(ms / 1000).toLocaleString('pt-BR')}s`;
}

/** Duração estimada da sessão, a partir da própria timeline do motor. */
function estimateSeconds(c: ExerciseConfig): number {
  const timed: ExerciseConfig = {
    ...c,
    retentionMode: 'countdown',
    apneaTimesSeconds: c.retentionMode === 'countup'
      ? Array(c.rounds).fill(FREE_RETENTION_ESTIMATE)
      : c.apneaTimesSeconds,
    meditationSeconds: c.meditationSeconds === UNLIMITED_MEDITATION ? 0 : c.meditationSeconds,
  };
  const segs = buildTimeline(timed, 0);
  return segs[segs.length - 1].start;
}

function fillStyle(value: number, min: number, max: number): CSSProperties {
  return { '--fill': `${((value - min) / (max - min)) * 100}%` } as CSSProperties;
}

export default function Setup({ onStart }: Props) {
  const base = useMemo(() => loadConfig(), []);
  const history = useMemo(() => loadHistory(), []);
  const stats = useMemo(() => computeStats(history), [history]);
  const [rounds, setRounds] = useState(base.rounds);
  const [breathsPerRound, setBreathsPerRound] = useState(base.breathsPerRound);
  const [breathPaceMs, setBreathPaceMs] = useState(base.breathPaceMs);
  const [apneaTimes, setApneaTimes] = useState<number[]>(() => fitApnea(base.apneaTimesSeconds, base.rounds));
  const [retentionMode, setRetentionMode] = useState<RetentionMode>(base.retentionMode);
  const [recoveryHoldSeconds, setRecoveryHoldSeconds] = useState(base.recoveryHoldSeconds);
  const [meditationSeconds, setMeditationSeconds] = useState(base.meditationSeconds);
  const [soundscape, setSoundscape] = useState<Soundscape>(base.soundscape);
  const [ambienceVolume, setAmbienceVolume] = useState(base.ambienceVolume);
  const [binaural, setBinaural] = useState(base.binaural);
  const [haptics, setHaptics] = useState(base.haptics);
  const [countdownCues, setCountdownCues] = useState(base.countdownCues);
  const [loading, setLoading] = useState(false);

  const canVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

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
    ambienceVolume,
    haptics,
    countdownCues,
  };

  const activePreset = PRESETS.find((p) => presetMatches(p, config))?.id ?? null;
  const estimate = estimateSeconds(config);
  const estimateIsApprox = retentionMode === 'countup' || meditationSeconds === UNLIMITED_MEDITATION;

  // Para a prévia de som se o usuário sair da tela no meio dela
  useEffect(() => () => stopPreview(), []);

  function applyPreset(p: Preset) {
    setRounds(p.values.rounds);
    setBreathsPerRound(p.values.breathsPerRound);
    setBreathPaceMs(p.values.breathPaceMs);
    setRetentionMode(p.values.retentionMode);
    setApneaTimes(fitApnea(p.values.apneaTimesSeconds, p.values.rounds));
  }

  function stepMeditation(delta: 1 | -1) {
    const idx = meditationIndex(meditationSeconds);
    const next = Math.max(0, Math.min(MEDITATION_STEPS.length - 1, idx + delta));
    setMeditationSeconds(MEDITATION_STEPS[next]);
  }

  function handleRoundsChange(n: number) {
    const next = Math.max(1, Math.min(MAX_ROUNDS, n));
    setRounds(next);
    setApneaTimes((prev) => fitApnea(prev, next));
  }

  function handleApneaChange(index: number, value: number) {
    setApneaTimes((prev) => {
      const updated = [...prev];
      updated[index] = Math.max(APNEA_MIN, Math.min(APNEA_MAX, value));
      return updated;
    });
  }

  function handleSoundscape(s: Soundscape) {
    setSoundscape(s);
    previewSoundscape(s, ambienceVolume);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    stopPreview();
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
        <div className="setup-logo" aria-hidden="true">
          <div className="logo-ring" />
          <div className="logo-circle" />
        </div>
        <h1 className="setup-title">Respiração</h1>
        <p className="setup-subtitle">Respiração profunda, retenção e calma</p>
      </header>

      {history.length > 0 && (
        <section className="stats-strip" aria-label="Seu progresso">
          <Stat value={String(stats.sessions)} label={stats.sessions === 1 ? 'sessão' : 'sessões'} />
          <Stat value={formatDuration(stats.bestRetention)} label="melhor retenção" />
          <Stat value={String(stats.streakDays)} label={stats.streakDays === 1 ? 'dia seguido' : 'dias seguidos'} />
        </section>
      )}

      <form className="setup-form" onSubmit={handleSubmit}>
        <div className="preset-row" role="radiogroup" aria-label="Predefinições">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={activePreset === p.id}
              className={`preset-chip${activePreset === p.id ? ' active' : ''}`}
              onClick={() => applyPreset(p)}
            >
              <span className="preset-label">{p.label}</span>
              <span className="preset-hint">{p.hint}</span>
            </button>
          ))}
        </div>

        <Section title="Respiração">
          <div className="form-card form-card-row">
            <div className="form-label">Rounds</div>
            <Stepper
              small
              value={String(rounds)}
              onDec={() => handleRoundsChange(rounds - 1)}
              onInc={() => handleRoundsChange(rounds + 1)}
              decDisabled={rounds <= 1}
              incDisabled={rounds >= MAX_ROUNDS}
              label="rounds"
            />
          </div>

          <div className="form-card">
            <label className="form-label" htmlFor="breaths">
              Respirações por round
              <span className="form-value-badge">{breathsPerRound}</span>
            </label>
            <input
              id="breaths"
              type="range"
              min={20}
              max={60}
              value={breathsPerRound}
              style={fillStyle(breathsPerRound, 20, 60)}
              onChange={(e) => setBreathsPerRound(Number(e.target.value))}
              className="slider"
            />
            <div className="slider-range-labels">
              <span>20</span>
              <span>60</span>
            </div>
          </div>

          <div className="form-card">
            <label className="form-label" htmlFor="pace">
              Ritmo
              <span className="form-value-badge">{formatPace(breathPaceMs)}</span>
            </label>
            <input
              id="pace"
              type="range"
              min={1500}
              max={4000}
              step={250}
              value={breathPaceMs}
              style={fillStyle(breathPaceMs, 1500, 4000)}
              onChange={(e) => setBreathPaceMs(Number(e.target.value))}
              className="slider"
            />
            <div className="slider-range-labels">
              <span>Rápido</span>
              <span>Lento</span>
            </div>
            <p className="form-hint">Duração de cada inspiração e de cada expiração</p>
          </div>
        </Section>

        <Section title="Retenção">
          <div className="form-card">
            <div className="form-label">Modo</div>
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
                    <Stepper
                      small
                      value={formatDuration(t)}
                      onDec={() => handleApneaChange(i, t - APNEA_STEP)}
                      onInc={() => handleApneaChange(i, t + APNEA_STEP)}
                      decDisabled={t <= APNEA_MIN}
                      incDisabled={t >= APNEA_MAX}
                      label={`retenção do round ${i + 1}`}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="form-hint">
                Segure até sentir vontade de respirar e toque no círculo. Seu tempo é registrado a cada round.
              </p>
            )}
          </div>

          <div className="form-card form-card-row">
            <div>
              <div className="form-label">Recuperação</div>
              <p className="form-hint">Inspire fundo e segure após cada retenção</p>
            </div>
            <Stepper
              small
              value={`${recoveryHoldSeconds}s`}
              onDec={() => setRecoveryHoldSeconds(Math.max(5, recoveryHoldSeconds - 5))}
              onInc={() => setRecoveryHoldSeconds(Math.min(60, recoveryHoldSeconds + 5))}
              decDisabled={recoveryHoldSeconds <= 5}
              incDisabled={recoveryHoldSeconds >= 60}
              label="recuperação"
            />
          </div>

          <div className="form-card form-card-row">
            <div>
              <div className="form-label">Meditação final</div>
              <p className="form-hint">
                {meditationSeconds === UNLIMITED_MEDITATION
                  ? 'Medite o quanto quiser e toque em “Concluir”'
                  : 'Silêncio guiado após o último round'}
              </p>
            </div>
            <Stepper
              small
              wide
              value={meditationLabel(meditationSeconds)}
              onDec={() => stepMeditation(-1)}
              onInc={() => stepMeditation(1)}
              decDisabled={meditationSeconds === 0}
              incDisabled={meditationSeconds === UNLIMITED_MEDITATION}
              label="meditação"
            />
          </div>
        </Section>

        <Section title="Som e sensações">
          <div className="form-card">
            <div className="form-label">Som de fundo</div>
            <div className="sound-grid">
              {SOUNDSCAPES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  className={`mode-btn sound-btn${soundscape === s.value ? ' active' : ''}`}
                  onClick={() => handleSoundscape(s.value)}
                  aria-pressed={soundscape === s.value}
                >
                  {s.value !== 'none' && <IconPlayPreview />}
                  {s.label}
                </button>
              ))}
            </div>
            {soundscape !== 'none' && (
              <>
                <label className="form-label form-label-sub" htmlFor="volume">
                  Volume do fundo
                  <span className="form-value-badge">{Math.round(ambienceVolume * 100)}%</span>
                </label>
                <input
                  id="volume"
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={ambienceVolume}
                  style={fillStyle(ambienceVolume, 0, 1)}
                  onChange={(e) => setAmbienceVolume(Number(e.target.value))}
                  className="slider"
                />
              </>
            )}
          </div>

          <div className="form-card switch-list">
            <Switch
              checked={countdownCues}
              onChange={setCountdownCues}
              title="Contagem sonora"
              sub="bipes nos 3 últimos segundos de cada fase"
            />
            {canVibrate && (
              <Switch checked={haptics} onChange={setHaptics} title="Vibração" sub="sinaliza as trocas de fase" />
            )}
            <Switch
              checked={binaural}
              onChange={setBinaural}
              title="Batidas binaurais"
              sub="use fones de ouvido"
              icon={<IconHeadphones />}
            />
          </div>
        </Section>

        <div className="start-bar">
          <button type="submit" className="btn-primary start-btn" disabled={loading}>
            {loading ? 'Preparando…' : 'Começar'}
            {!loading && (
              <span className="start-duration">
                {estimateIsApprox ? '≈ ' : ''}
                {formatApproxMinutes(estimate)}
              </span>
            )}
          </button>
        </div>
      </form>

      {history.length > 0 && (
        <section className="history-section">
          <h2 className="section-title">Sessões recentes</h2>
          <div className="history-list">
            {history.slice(0, HISTORY_DISPLAY_LIMIT).map((s, i) => {
              const best = Math.max(0, ...s.retentionSeconds);
              return (
                <div key={i} className="history-row">
                  <span className="history-date">{formatHistoryDate(s.date)}</span>
                  <span className="history-bars" aria-hidden="true">
                    {s.retentionSeconds.map((r, j) => (
                      <span
                        key={j}
                        className="history-bar"
                        style={{ height: `${Math.max(12, (r / Math.max(1, stats.bestRetention)) * 100)}%` }}
                      />
                    ))}
                  </span>
                  <span className="history-detail">
                    {s.rounds} {s.rounds === 1 ? 'round' : 'rounds'}
                    {best > 0 && <> · <strong>{formatDuration(best)}</strong></>}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <footer className="setup-footer">
        Pratique sentado ou deitado, nunca na água ou dirigindo.
      </footer>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="form-section">
      <h2 className="section-title">{title}</h2>
      {children}
    </section>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="stat-chip">
      <span className="stat-chip-value">{value}</span>
      <span className="stat-chip-label">{label}</span>
    </div>
  );
}

interface StepperProps {
  value: string;
  label: string;
  onDec: () => void;
  onInc: () => void;
  decDisabled?: boolean;
  incDisabled?: boolean;
  small?: boolean;
  wide?: boolean;
}

function Stepper({ value, label, onDec, onInc, decDisabled, incDisabled, small, wide }: StepperProps) {
  return (
    <div className={`stepper${small ? ' small' : ''}`}>
      <button type="button" className="stepper-btn" onClick={onDec} disabled={decDisabled} aria-label={`Diminuir ${label}`}>
        −
      </button>
      <span className={`stepper-value${wide ? ' wide' : ''}`} aria-live="polite">{value}</span>
      <button type="button" className="stepper-btn" onClick={onInc} disabled={incDisabled} aria-label={`Aumentar ${label}`}>
        +
      </button>
    </div>
  );
}

interface SwitchProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  title: string;
  sub: string;
  icon?: ReactNode;
}

function Switch({ checked, onChange, title, sub, icon }: SwitchProps) {
  return (
    <label className="switch-row">
      <span className="switch-text">
        <span className="switch-title">
          {icon}
          {title}
        </span>
        <span className="switch-sub">{sub}</span>
      </span>
      <input
        type="checkbox"
        className="switch-input"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="switch-track" aria-hidden="true" />
    </label>
  );
}

function formatHistoryDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
}
