import { describe, expect, it } from 'vitest';
import { pickClip, RATE_MAX, RATE_MIN, type ClipInfo } from './clips';

const inhale: ClipInfo[] = [
  { key: '2s', duration: 1.99 },
  { key: '3s', duration: 3.0 },
  { key: '4s', duration: 4.08 },
];
const exhale: ClipInfo[] = [
  { key: '2s', duration: 2.04 },
  { key: '3s', duration: 2.69 },
];

describe('pickClip', () => {
  it('picks the clip closest to the requested duration', () => {
    expect(pickClip(inhale, 2)?.key).toBe('2s');
    expect(pickClip(inhale, 3)?.key).toBe('3s');
    expect(pickClip(inhale, 4)?.key).toBe('4s');
    // 2,5 s: 3 s esticado em 1,2x (|ln| menor) vence 2 s a 0,8x
    expect(pickClip(inhale, 2.5)?.key).toBe('3s');
  });

  it('returns a rate that makes the clip end exactly at the target', () => {
    const choice = pickClip(inhale, 3.2)!;
    expect(choice.key).toBe('3s');
    expect(choice.rate).toBeCloseTo(3.0 / 3.2, 6);
  });

  it('stays inside the natural-sounding rate range', () => {
    for (let t = 1.5; t <= 4; t += 0.25) {
      const choice = pickClip(inhale, t);
      expect(choice).not.toBeNull();
      expect(choice!.rate).toBeGreaterThanOrEqual(RATE_MIN);
      expect(choice!.rate).toBeLessThanOrEqual(RATE_MAX);
    }
  });

  it('gives up (null) when no clip fits, so the caller can use the synth', () => {
    // Expiração de 4 s: o clipe mais longo (2,69 s) exigiria 0,67x
    expect(pickClip(exhale, 4)).toBeNull();
    expect(pickClip(exhale, 1.5)).not.toBeNull();
    expect(pickClip([], 2)).toBeNull();
    expect(pickClip(inhale, 0)).toBeNull();
  });
});
