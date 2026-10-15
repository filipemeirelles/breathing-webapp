import type { Phase } from './types';

/** Padrões curtos por fase: dá pra seguir a sessão de olhos fechados. */
const PATTERNS: Partial<Record<Phase, number | number[]>> = {
  APNEA: [60, 80, 60],
  RECOVERY_HOLD: 120,
  RECOVERY_RELEASE: 40,
  MEDITATION: [200, 120, 200],
};

export function vibrateForPhase(phase: Phase) {
  const pattern = PATTERNS[phase];
  if (pattern === undefined || typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Alguns navegadores bloqueiam sem gesto recente — ignorar.
  }
}
