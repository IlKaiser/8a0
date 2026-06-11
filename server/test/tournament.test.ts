import { describe, expect, it } from 'vitest';
import type { MatchResult } from '@otto/shared';
import { computeStandings, roundRobinFixtures } from '../src/tournament.js';

const match = (h: string, a: string, hg: number, ag: number): MatchResult =>
  ({ homeSeatId: h, awaySeatId: a, homeGoals: hg, awayGoals: ag, events: [], isFinal: false, seed: 0 });

describe('roundRobinFixtures', () => {
  it('every pair meets exactly once', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const fixtures = roundRobinFixtures(ids);
    expect(fixtures).toHaveLength((5 * 4) / 2);
    const keys = fixtures.map(([h, a]) => [h, a].sort().join('-'));
    expect(new Set(keys).size).toBe(fixtures.length);
  });
  it('returns no fixtures for 2 seats (they go straight to the final)', () => {
    expect(roundRobinFixtures(['a', 'b'])).toEqual([]);
  });
});

describe('computeStandings', () => {
  it('orders by points, then goal difference, then goals scored', () => {
    const results = [
      match('a', 'b', 2, 0), // a 3pts +2
      match('a', 'c', 1, 1), // a 4pts, c 1pt
      match('b', 'c', 3, 0), // b 3pts +1, c 1pt -4
    ];
    const rows = computeStandings(['a', 'b', 'c'], results);
    expect(rows.map((r) => r.seatId)).toEqual(['a', 'b', 'c']);
    expect(rows[0]).toMatchObject({ points: 4, won: 1, drawn: 1, lost: 0, gf: 3, ga: 1 });
  });

  it('breaks a two-way tie on head-to-head result', () => {
    // 4 teams: a and b finish equal on points, gd, and gf;
    // b won the head-to-head, so b ranks above a.
    const four = [
      match('a', 'b', 0, 1),
      match('a', 'c', 2, 0),
      match('a', 'd', 2, 0),
      match('b', 'c', 0, 1),
      match('b', 'd', 3, 0),
      match('c', 'd', 0, 0),
    ];
    // a: W2 L1, 6pts, gf4 ga1, gd+3 ; b: W2 L1, 6pts, gf4 ga1, gd+3
    const rows = computeStandings(['a', 'b', 'c', 'd'], four);
    expect(rows[0].seatId).toBe('b'); // h2h winner above a
    expect(rows[1].seatId).toBe('a');
  });

  it('a penalty shootout win counts as a full win (no draws)', () => {
    const m = {
      ...match('a', 'b', 1, 1),
      penalties: {
        home: 4, away: 3,
        kicks: { home: [true, true, true, true], away: [true, true, true, false] },
      },
    };
    const rows = computeStandings(['a', 'b'], [m]);
    const a = rows.find((r) => r.seatId === 'a')!;
    const b = rows.find((r) => r.seatId === 'b')!;
    expect(a).toMatchObject({ won: 1, drawn: 0, lost: 0, points: 3 });
    expect(b).toMatchObject({ won: 0, drawn: 0, lost: 1, points: 0 });
    expect(rows[0].seatId).toBe('a');
  });
});
