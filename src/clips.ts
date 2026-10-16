/**
 * Escolha do clipe gravado de respiração mais próximo da duração pedida.
 * Os clipes existem em durações fixas (2 s, 3 s, 4 s...); o app os estica ou
 * comprime via playbackRate dentro de uma faixa em que o sopro ainda soa
 * natural. Fora dela, quem chama cai no som sintetizado (que escala livre).
 */
export interface ClipInfo {
  key: string;
  /** Duração do arquivo, em segundos. */
  duration: number;
}

export const RATE_MIN = 0.75;
export const RATE_MAX = 1.4;

export interface ClipChoice {
  key: string;
  /** playbackRate que faz o clipe terminar exatamente em `targetSec`. */
  rate: number;
}

export function pickClip(clips: ClipInfo[], targetSec: number): ClipChoice | null {
  if (!(targetSec > 0)) return null;
  let best: ClipChoice | null = null;
  let bestCost = Infinity;
  for (const clip of clips) {
    const rate = clip.duration / targetSec;
    if (rate < RATE_MIN || rate > RATE_MAX) continue;
    const cost = Math.abs(Math.log(rate));
    if (cost < bestCost) {
      bestCost = cost;
      best = { key: clip.key, rate };
    }
  }
  return best;
}
