import { describe, expect, it } from 'vitest';
import type { Player, Slot } from '@otto/shared';
import { FORMATIONS } from '@otto/shared';
import {
  autoPick, eligibleSlotIndices, rollSquad, snakeOrder, squadHasEligible,
} from '../src/draft.js';
import type { Squad } from '../src/data.js';

const P = (id: string, position: Player['position'], rating: number): Player =>
  ({ id, name: id, position, rating, year: 2022, country: 'X' });

const emptySlots = (): Slot[] =>
  FORMATIONS['4-3-3'].map((position) => ({ position, player: null }));

describe('snakeOrder', () => {
  it('reverses direction every round', () => {
    expect(snakeOrder(['a', 'b', 'c'], 3)).toEqual([
      'a', 'b', 'c', 'c', 'b', 'a', 'a', 'b', 'c',
    ]);
  });
  it('covers seats x rounds picks', () => {
    expect(snakeOrder(['a', 'b'], 11)).toHaveLength(22);
  });
});

describe('eligibleSlotIndices', () => {
  it('GK only fits the GK slot and vice versa', () => {
    const slots = emptySlots();
    expect(eligibleSlotIndices(slots, 'GK')).toEqual([0]);
    slots[0].player = P('gk1', 'GK', 80);
    expect(eligibleSlotIndices(slots, 'GK')).toEqual([]);
  });
  it('outfield players fit natural + adjacent open slots only', () => {
    const slots = emptySlots(); // 4-3-3: GK, 4xDF(1-4), 3xMF(5-7), 3xFW(8-10)
    expect(eligibleSlotIndices(slots, 'FW')).toEqual([5, 6, 7, 8, 9, 10]);
    expect(eligibleSlotIndices(slots, 'DF')).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});

describe('squadHasEligible / rollSquad', () => {
  it('detects squads with no eligible player', () => {
    const slots = emptySlots();
    for (let i = 1; i < 11; i++) slots[i].player = P(`x${i}`, slots[i].position, 70);
    // only GK slot open -> a squad with no GK is ineligible
    expect(squadHasEligible([P('fw', 'FW', 90)], slots)).toBe(false);
    expect(squadHasEligible([P('gk', 'GK', 70)], slots)).toBe(true);
  });

  it('rollSquad skips drafted players and ineligible squads', () => {
    const slots = emptySlots();
    for (let i = 1; i < 11; i++) slots[i].player = P(`x${i}`, slots[i].position, 70);
    const squads: Squad[] = [
      { year: 1970, country: 'NoGK', players: [P('a', 'FW', 90)] },
      { year: 1974, country: 'HasGK', players: [P('b', 'GK', 75), P('c', 'GK', 70)] },
    ];
    const drafted = new Set(['c']);
    // rng: first try squad 0 (no GK -> ineligible), then squad 1
    const seq = [0, 0.9];
    let call = 0;
    const rng = () => seq[Math.min(call++, seq.length - 1)];
    const roll = rollSquad(squads, drafted, slots, rng);
    expect(roll.country).toBe('HasGK');
    expect(roll.players.map((p) => p.id)).toEqual(['b']); // 'c' drafted, filtered out
  });
});

describe('autoPick', () => {
  it('picks highest effective rating and prefers the natural slot', () => {
    const slots = emptySlots();
    const squad = [P('mf', 'MF', 90), P('fw', 'FW', 88)];
    const pick = autoPick(squad, slots);
    // MF 90 natural beats FW 88; natural MF slot indices are 5..7
    expect(pick).toEqual({ playerId: 'mf', slotIndex: 5 });
  });
  it('falls back to adjacent slot when natural slots are full', () => {
    const slots = emptySlots();
    for (const i of [5, 6, 7]) slots[i].player = P(`m${i}`, 'MF', 70);
    const pick = autoPick([P('mf2', 'MF', 95)], slots);
    // MF natural full; adjacent open: DF(1) and FW(8); takes first eligible
    expect(pick?.playerId).toBe('mf2');
    expect([1, 8]).toContain(pick?.slotIndex);
  });
});
