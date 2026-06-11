import type { GoalEvent, MatchResult, Position, Slot } from '@otto/shared';

/** Small fast seeded PRNG (public-domain mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function poisson(lambda: number, rng: () => number): number {
  const limit = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do { k++; p *= rng(); } while (p > limit);
  return k - 1;
}

const ATTACK_W: Record<Position, number> = { GK: 0, DF: 0.2, MF: 0.6, FW: 1 };
const DEFENSE_W: Record<Position, number> = { GK: 1, DF: 1, MF: 0.5, FW: 0 };

export interface TeamScores { attack: number; defense: number }

export function teamScores(slots: Slot[]): TeamScores {
  let att = 0; let attW = 0; let def = 0; let defW = 0;
  for (const slot of slots) {
    if (!slot.player) continue;
    att += slot.player.rating * ATTACK_W[slot.position]; attW += ATTACK_W[slot.position];
    def += slot.player.rating * DEFENSE_W[slot.position]; defW += DEFENSE_W[slot.position];
  }
  return {
    attack: attW ? att / attW : 0,
    defense: defW ? def / defW : 0,
  };
}

const BASE_GOALS = 1.35;
const GOALS_PER_RATING_DIFF = 0.06;

export function expectedGoals(attack: number, defense: number): number {
  const xg = BASE_GOALS + GOALS_PER_RATING_DIFF * (attack - defense);
  return Math.min(3.5, Math.max(0.3, xg));
}

function bestKickers(slots: Slot[]): number[] {
  return slots
    .filter((s) => s.player && s.position !== 'GK')
    .map((s) => s.player!.rating)
    .sort((a, b) => b - a)
    .slice(0, 5);
}

function keeperRating(slots: Slot[]): number {
  const gk = slots.find((s) => s.position === 'GK' && s.player);
  return gk?.player?.rating ?? 70;
}

export function penaltyShootout(
  home: Slot[],
  away: Slot[],
  rng: () => number,
): { home: number; away: number } {
  const hk = bestKickers(home); const ak = bestKickers(away);
  const hKeeper = keeperRating(home); const aKeeper = keeperRating(away);
  const convert = (kicker: number, keeper: number): boolean => {
    const p = Math.min(0.92, Math.max(0.4, 0.72 + 0.004 * (kicker - keeper)));
    return rng() < p;
  };
  let h = 0; let a = 0;
  let round = 0;
  // 5 regulation rounds, then sudden death until decided.
  while (round < 5 || h === a) {
    if (convert(hk[round % hk.length], aKeeper)) h++;
    if (convert(ak[round % ak.length], hKeeper)) a++;
    round++;
    if (round > 30) { h++; break; } // hard stop, statistically unreachable
  }
  return { home: h, away: a };
}

// Likelihood of scoring a goal, by the slot occupied.
const GOAL_W: Record<Position, number> = { GK: 0, DF: 0.7, MF: 2, FW: 4 };

function pickScorer(slots: Slot[], rng: () => number): string {
  const cands = slots.filter((s) => s.player && s.position !== 'GK');
  if (cands.length === 0) return '???';
  const weights = cands.map((s) => GOAL_W[s.position] * (s.player!.rating / 80));
  let r = rng() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < cands.length; i++) {
    r -= weights[i];
    if (r <= 0) return cands[i].player!.name;
  }
  return cands[cands.length - 1].player!.name;
}

function goalEvents(
  slots: Slot[],
  seatId: string,
  goals: number,
  rng: () => number,
): GoalEvent[] {
  return Array.from({ length: goals }, () => ({
    minute: 1 + Math.floor(rng() * 90),
    scorerName: pickScorer(slots, rng),
    seatId,
  }));
}

export interface MatchOptions {
  homeSeatId: string;
  awaySeatId: string;
  isFinal: boolean;
  seed: number;
}

export function simulateMatch(home: Slot[], away: Slot[], opts: MatchOptions): MatchResult {
  const rng = mulberry32(opts.seed);
  const hs = teamScores(home); const as = teamScores(away);
  const homeGoals = poisson(expectedGoals(hs.attack, as.defense), rng);
  const awayGoals = poisson(expectedGoals(as.attack, hs.defense), rng);
  const events = [
    ...goalEvents(home, opts.homeSeatId, homeGoals, rng),
    ...goalEvents(away, opts.awaySeatId, awayGoals, rng),
  ].sort((a, b) => a.minute - b.minute);
  const result: MatchResult = {
    homeSeatId: opts.homeSeatId,
    awaySeatId: opts.awaySeatId,
    homeGoals,
    awayGoals,
    events,
    isFinal: opts.isFinal,
    seed: opts.seed,
  };
  if (homeGoals === awayGoals) {
    // no draws in this game: every level match goes to a shootout
    result.penalties = penaltyShootout(home, away, rng);
  }
  return result;
}
