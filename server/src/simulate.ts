import type { MatchResult, Position, Slot } from '@otto/shared';
import { effectiveRating } from '@otto/shared';

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
const BALANCE_BONUS = 2;

export interface TeamScores { attack: number; defense: number }

export function teamScores(slots: Slot[]): TeamScores {
  let att = 0; let attW = 0; let def = 0; let defW = 0;
  let allNatural = true;
  for (const slot of slots) {
    if (!slot.player) { allNatural = false; continue; }
    const eff = effectiveRating(slot.player.rating, slot.player.position, slot.position);
    if (slot.player.position !== slot.position) allNatural = false;
    att += eff * ATTACK_W[slot.position]; attW += ATTACK_W[slot.position];
    def += eff * DEFENSE_W[slot.position]; defW += DEFENSE_W[slot.position];
  }
  const bonus = allNatural ? BALANCE_BONUS : 0;
  return {
    attack: (attW ? att / attW : 0) + bonus,
    defense: (defW ? def / defW : 0) + bonus,
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
  const result: MatchResult = {
    homeSeatId: opts.homeSeatId,
    awaySeatId: opts.awaySeatId,
    homeGoals,
    awayGoals,
    isFinal: opts.isFinal,
    seed: opts.seed,
  };
  if (opts.isFinal && homeGoals === awayGoals) {
    result.penalties = penaltyShootout(home, away, rng);
  }
  return result;
}
