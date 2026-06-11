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
  it('uniform-rated team scores its rating on both axes', () => {
    const t = teamScores(team(90));
    expect(t.attack).toBeCloseTo(90, 5);
    expect(t.defense).toBeCloseTo(90, 5);
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

  it('a moderate rating edge (88 vs 81) wins a clear majority', () => {
    let strongWins = 0;
    for (let seed = 1000; seed < 1400; seed++) {
      const r = simulateMatch(team(88), team(81), { homeSeatId: 'h', awaySeatId: 'a', isFinal: false, seed });
      const homeWon = r.penalties
        ? r.penalties.home > r.penalties.away
        : r.homeGoals > r.awayGoals;
      if (homeWon) strongWins++;
    }
    expect(strongWins).toBeGreaterThan(240); // >60% incl. shootouts
  });

  it('equal teams split results across seeds (rng matters)', () => {
    let homeWins = 0; let awayWins = 0;
    const scorelines = new Set<string>();
    for (let seed = 0; seed < 200; seed++) {
      const r = simulateMatch(team(85), team(85), { homeSeatId: 'h', awaySeatId: 'a', isFinal: false, seed });
      scorelines.add(`${r.homeGoals}-${r.awayGoals}`);
      const homeWon = r.penalties
        ? r.penalties.home > r.penalties.away
        : r.homeGoals > r.awayGoals;
      if (homeWon) homeWins++; else awayWins++;
    }
    expect(homeWins).toBeGreaterThan(40);
    expect(awayWins).toBeGreaterThan(40);
    expect(scorelines.size).toBeGreaterThan(8); // plenty of distinct results
  });

  it('no match ends level: penalties decide every drawn match', () => {
    for (let seed = 0; seed < 200; seed++) {
      const r = simulateMatch(team(85), team(85), { homeSeatId: 'h', awaySeatId: 'a', isFinal: false, seed });
      if (r.homeGoals === r.awayGoals) {
        expect(r.penalties).toBeDefined();
        expect(r.penalties!.home).not.toBe(r.penalties!.away);
      } else {
        expect(r.penalties).toBeUndefined();
      }
    }
  });

  it('emits one goal event per goal, minute-ordered, scored by an outfield player of the right team', () => {
    const homeNames = new Set(team(90).map((s) => s.player!.name));
    for (let seed = 0; seed < 50; seed++) {
      const r = simulateMatch(team(90), team(75), { homeSeatId: 'h', awaySeatId: 'a', isFinal: false, seed });
      expect(r.events).toHaveLength(r.homeGoals + r.awayGoals);
      let prev = 0;
      for (const e of r.events) {
        expect(e.minute).toBeGreaterThanOrEqual(1);
        expect(e.minute).toBeLessThanOrEqual(90);
        expect(e.minute).toBeGreaterThanOrEqual(prev);
        prev = e.minute;
        if (e.seatId === 'h') {
          expect(homeNames.has(e.scorerName)).toBe(true);
          expect(e.scorerName).not.toBe('p0'); // p0 is the GK slot
        }
      }
      expect(r.events.filter((e) => e.seatId === 'h')).toHaveLength(r.homeGoals);
    }
  });
});
