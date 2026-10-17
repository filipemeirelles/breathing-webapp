import type { ExerciseConfig, SessionResult, Soundscape, VoiceMode } from './types';
import { DEFAULT_CONFIG } from './types';

const CONFIG_KEY = 'breathing.config.v1';
const HISTORY_KEY = 'breathing.history.v1';
const HISTORY_LIMIT = 100;

const SOUNDSCAPES: Soundscape[] = ['breeze', 'ocean', 'rain', 'drone', 'none'];
const VOICE_MODES: VoiceMode[] = ['always', 'intro', 'off'];

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function loadConfig(): ExerciseConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw) as Partial<ExerciseConfig>;
    // Mescla sobre os defaults para tolerar configs de versões antigas.
    const cfg: ExerciseConfig = { ...DEFAULT_CONFIG, ...parsed };
    if (!Array.isArray(cfg.apneaTimesSeconds) || cfg.apneaTimesSeconds.length === 0) {
      cfg.apneaTimesSeconds = DEFAULT_CONFIG.apneaTimesSeconds;
    }
    // Sem clamp nos campos de tempo: valores fora das faixas da UI são
    // úteis para testes rápidos (ver .claude/skills/verify).
    cfg.rounds = Math.max(1, Math.round(num(cfg.rounds, DEFAULT_CONFIG.rounds)));
    cfg.ambienceVolume = Math.max(0, Math.min(1, num(cfg.ambienceVolume, DEFAULT_CONFIG.ambienceVolume)));
    if (!SOUNDSCAPES.includes(cfg.soundscape)) cfg.soundscape = DEFAULT_CONFIG.soundscape;
    if (!VOICE_MODES.includes(cfg.voice)) cfg.voice = DEFAULT_CONFIG.voice;
    return cfg;
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveConfig(config: ExerciseConfig) {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch {
    // localStorage indisponível (modo privado etc.) — segue sem persistir.
  }
}

export function loadHistory(): SessionResult[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as SessionResult[]).filter(
      (s) => s && typeof s.date === 'string' && Array.isArray(s.retentionSeconds),
    );
  } catch {
    return [];
  }
}

export function appendSession(result: SessionResult) {
  try {
    const history = [result, ...loadHistory()].slice(0, HISTORY_LIMIT);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    // sem persistência disponível
  }
}

export interface HistoryStats {
  sessions: number;
  bestRetention: number;
  /** Dias seguidos com pelo menos uma sessão, terminando hoje ou ontem. */
  streakDays: number;
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function computeStats(history: SessionResult[], today = new Date()): HistoryStats {
  const bestRetention = history.reduce(
    (best, s) => Math.max(best, ...s.retentionSeconds, 0),
    0,
  );
  const days = new Set(history.map((s) => dayKey(new Date(s.date))));
  let streakDays = 0;
  const cursor = new Date(today);
  // Sem sessão hoje ainda não quebra a sequência: conta a partir de ontem.
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (days.has(dayKey(cursor))) {
    streakDays++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return { sessions: history.length, bestRetention, streakDays };
}
