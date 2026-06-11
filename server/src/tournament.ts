import type { MatchResult, StandingRow } from '@otto/shared';

/**
 * Single round robin via the circle method. Pairs play once.
 * 2 seats -> no round robin (the room goes straight to a grand final).
 */
export function roundRobinFixtures(seatIds: string[]): Array<[string, string]> {
  if (seatIds.length <= 2) return [];
  const ids = [...seatIds];
  if (ids.length % 2 === 1) ids.push('__bye__');
  const n = ids.length;
  const fixtures: Array<[string, string]> = [];
  for (let round = 0; round < n - 1; round++) {
    for (let i = 0; i < n / 2; i++) {
      const home = ids[i];
      const away = ids[n - 1 - i];
      if (home !== '__bye__' && away !== '__bye__') fixtures.push([home, away]);
    }
    ids.splice(1, 0, ids.pop()!); // rotate all but the first
  }
  return fixtures;
}

export function computeStandings(
  seatIds: string[],
  results: MatchResult[],
): StandingRow[] {
  const rows = new Map<string, StandingRow>(
    seatIds.map((seatId) => [seatId, {
      seatId, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0,
    }]),
  );
  const apply = (id: string, gf: number, ga: number, wonShootout: boolean | null): void => {
    const r = rows.get(id);
    if (!r) return;
    r.played++; r.gf += gf; r.ga += ga;
    // a shootout win counts as a win: this game has no draws
    if (gf > ga || wonShootout === true) { r.won++; r.points += 3; }
    else if (gf === ga && wonShootout === null) { r.drawn++; r.points += 1; }
    else r.lost++;
  };
  for (const m of results.filter((m) => !m.isFinal)) {
    const homeShootout = m.penalties ? m.penalties.home > m.penalties.away : null;
    apply(m.homeSeatId, m.homeGoals, m.awayGoals, homeShootout);
    apply(m.awaySeatId, m.awayGoals, m.homeGoals, homeShootout === null ? null : !homeShootout);
  }

  const h2h = (a: string, b: string): number => {
    const m = results.find(
      (m) => !m.isFinal &&
        ((m.homeSeatId === a && m.awaySeatId === b) ||
         (m.homeSeatId === b && m.awaySeatId === a)),
    );
    if (!m) return 0;
    const homeWon = m.homeGoals !== m.awayGoals
      ? m.homeGoals > m.awayGoals
      : m.penalties
        ? m.penalties.home > m.penalties.away
        : null;
    if (homeWon === null) return 0;
    const winner = homeWon ? m.homeSeatId : m.awaySeatId;
    return winner === a ? -1 : 1; // negative sorts `a` first
  };

  return [...rows.values()].sort((x, y) =>
    y.points - x.points ||
    (y.gf - y.ga) - (x.gf - x.ga) ||
    y.gf - x.gf ||
    h2h(x.seatId, y.seatId) ||
    seatIds.indexOf(x.seatId) - seatIds.indexOf(y.seatId), // stable: join order
  );
}
