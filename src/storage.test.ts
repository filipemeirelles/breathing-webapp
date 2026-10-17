import { describe, expect, it } from 'vitest';
import { computeStats } from './storage';
import type { SessionResult } from './types';

function session(date: Date, retention: number[]): SessionResult {
  return { rounds: retention.length, totalSeconds: 600, retentionSeconds: retention, meditationSeconds: 0, date: date.toISOString() };
}

const today = new Date(2026, 9, 15, 20, 0);
const daysAgo = (n: number) => new Date(2026, 9, 15 - n, 9, 0);

describe('computeStats', () => {
  it('handles an empty history', () => {
    expect(computeStats([], today)).toEqual({ sessions: 0, bestRetention: 0, streakDays: 0 });
  });

  it('finds the best retention across sessions', () => {
    const stats = computeStats([session(daysAgo(0), [60, 95]), session(daysAgo(3), [120])], today);
    expect(stats.bestRetention).toBe(120);
    expect(stats.sessions).toBe(2);
  });

  it('counts consecutive days, still alive if today has no session yet', () => {
    const history = [daysAgo(1), daysAgo(2), daysAgo(2), daysAgo(3), daysAgo(5)].map((d) => session(d, [60]));
    expect(computeStats(history, today).streakDays).toBe(3);
    expect(computeStats([session(daysAgo(0), [60]), ...history], today).streakDays).toBe(4);
    expect(computeStats([session(daysAgo(2), [60])], today).streakDays).toBe(0);
  });
});
