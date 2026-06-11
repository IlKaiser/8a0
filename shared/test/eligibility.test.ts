import { describe, expect, it } from 'vitest';
import {
  FORMATIONS, FORMATION_IDS, OOP_PENALTY, effectiveRating, slotAccepts,
} from '../src/index.js';

describe('formations', () => {
  it('defines all 8 formations with exactly 11 slots and 1 GK', () => {
    expect(FORMATION_IDS).toHaveLength(8);
    for (const id of FORMATION_IDS) {
      const slots = FORMATIONS[id];
      expect(slots).toHaveLength(11);
      expect(slots.filter((p) => p === 'GK')).toHaveLength(1);
    }
  });

  it('formation shape matches its name (e.g. 4-3-3 = 4 DF, 3 MF, 3 FW)', () => {
    const f = FORMATIONS['4-3-3'];
    expect(f.filter((p) => p === 'DF')).toHaveLength(4);
    expect(f.filter((p) => p === 'MF')).toHaveLength(3);
    expect(f.filter((p) => p === 'FW')).toHaveLength(3);
  });
});

describe('slotAccepts', () => {
  it('accepts exact position', () => {
    expect(slotAccepts('FW', 'FW')).toBe(true);
    expect(slotAccepts('GK', 'GK')).toBe(true);
  });
  it('accepts adjacent outfield positions', () => {
    expect(slotAccepts('DF', 'MF')).toBe(true);
    expect(slotAccepts('MF', 'DF')).toBe(true);
    expect(slotAccepts('MF', 'FW')).toBe(true);
    expect(slotAccepts('FW', 'MF')).toBe(true);
  });
  it('rejects non-adjacent and any GK mismatch', () => {
    expect(slotAccepts('DF', 'FW')).toBe(false);
    expect(slotAccepts('FW', 'DF')).toBe(false);
    expect(slotAccepts('GK', 'DF')).toBe(false);
    expect(slotAccepts('MF', 'GK')).toBe(false);
  });
});

describe('effectiveRating', () => {
  it('full rating in natural position, penalty otherwise', () => {
    expect(effectiveRating(90, 'FW', 'FW')).toBe(90);
    expect(effectiveRating(90, 'MF', 'FW')).toBe(90 - OOP_PENALTY);
  });
});
