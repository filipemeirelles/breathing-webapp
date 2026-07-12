import type { ExerciseConfig, SessionResult } from './types';
import { DEFAULT_CONFIG } from './types';

const CONFIG_KEY = 'breathing.config.v1';
const HISTORY_KEY = 'breathing.history.v1';
const HISTORY_LIMIT = 100;

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
    return Array.isArray(parsed) ? (parsed as SessionResult[]) : [];
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
