import { describe, expect, it } from 'vitest';
import { loadSquads } from '../src/data.js';

const squads = loadSquads();

describe('squads dataset', () => {
  it('has at least 40 squads across at least 10 editions', () => {
    expect(squads.length).toBeGreaterThanOrEqual(40);
    expect(new Set(squads.map((s) => s.year)).size).toBeGreaterThanOrEqual(10);
  });

  it('every squad has >=14 players incl. >=1 GK, >=4 DF, >=4 MF, >=3 FW', () => {
    for (const s of squads) {
      expect(s.players.length, `${s.year} ${s.country}`).toBeGreaterThanOrEqual(14);
      const count = (p: string) => s.players.filter((x) => x.position === p).length;
      expect(count('GK'), `${s.year} ${s.country} GK`).toBeGreaterThanOrEqual(1);
      expect(count('DF'), `${s.year} ${s.country} DF`).toBeGreaterThanOrEqual(4);
      expect(count('MF'), `${s.year} ${s.country} MF`).toBeGreaterThanOrEqual(4);
      expect(count('FW'), `${s.year} ${s.country} FW`).toBeGreaterThanOrEqual(3);
    }
  });

  it('all ratings are 60..99 and ids are globally unique', () => {
    const ids = new Set<string>();
    for (const s of squads) {
      for (const p of s.players) {
        expect(p.rating).toBeGreaterThanOrEqual(60);
        expect(p.rating).toBeLessThanOrEqual(99);
        expect(ids.has(p.id), `duplicate id ${p.id}`).toBe(false);
        ids.add(p.id);
      }
    }
    expect(ids.size).toBeGreaterThanOrEqual(800);
  });
});
