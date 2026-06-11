import { describe, expect, it } from 'vitest';
import type { Player, Slot } from '@otto/shared';
import { FORMATIONS } from '@otto/shared';
import { mulberry32, poisson, simulateMatch, teamScores } from '../src/simulate.js';

const team = (rating: number): Slot[] =>
  FORMATIONS['4-4-2'].map((position, i) => ({
    position,
    player: {
      id: `p${rating}-${i}`, name: `p${i}`, position, rating,
      year: 2022, country: 'X',
    } satisfies Player,
  }));

describe('mulberry32', () => {
  it('is deterministic per seed and emits values in [0,1)', () => {
    const a = mulberry32(42); const b = mulberry32(42);
    const seq = Array.from({ length: 5 }, () => a());
    expect(seq).toEqual(Array.from({ length: 5 }, () => b()));
    for (const v of seq) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
  });
});

describe('poisson', () => {
  it('sample mean approximates lambda', () => {
    const rng = mulberry32(1);
    const n = 5000;
    let sum = 0;
    for (let i = 0; i < n; i++) sum += poisson(1.5, rng);
    expect(sum / n).toBeGreaterThan(1.3);
    expect(sum / n).toBeLessThan(1.7);
  });
});

describe('teamScores', () => {
  it('all-natural full-strength team gets the balance bonus', () => {
    const t = teamScores(team(90));
    expect(t.attack).toBeGreaterThan(90); // 90 weighted avg + bonus
    expect(t.defense).toBeGreaterThan(90);
  });
});

describe('simulateMatch', () => {
  it('same seed gives the same result', () => {
    const a = simulateMatch(team(90), team(80), { homeSeatId: 'h', awaySeatId: 'a', isFinal: false, seed: 7 });
    const b = simulateMatch(team(90), team(80), { homeSeatId: 'h', awaySeatId: 'a', isFinal: false, seed: 7 });
    expect(a).toEqual(b);
  });

  it('clearly stronger team wins the large majority of matches', () => {
    let strongWins = 0; let weakWins = 0;
    for (let seed = 0; seed < 400; seed++) {
      const r = simulateMatch(team(95), team(70), { homeSeatId: 'h', awaySeatId: 'a', isFinal: false, seed });
      if (r.homeGoals > r.awayGoals) strongWins++;
      if (r.awayGoals > r.homeGoals) weakWins++;
    }
    expect(strongWins).toBeGreaterThan(280); // >70%
    expect(weakWins).toBeLessThan(60);       // upsets exist but are rare
  });

  it('a final never ends level: penalties decide drawn matches', () => {
    for (let seed = 0; seed < 200; seed++) {
      const r = simulateMatch(team(85), team(85), { homeSeatId: 'h', awaySeatId: 'a', isFinal: true, seed });
      if (r.homeGoals === r.awayGoals) {
        expect(r.penalties).toBeDefined();
        expect(r.penalties!.home).not.toBe(r.penalties!.away);
      } else {
        expect(r.penalties).toBeUndefined();
      }
    }
  });
});
