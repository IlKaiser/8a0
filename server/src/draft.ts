import type { Player, Position, Slot, SquadRoll } from '@otto/shared';
import { effectiveRating, slotAccepts } from '@otto/shared';
import type { Squad } from './data.js';

/** Full pick sequence: 1..N then N..1, repeated for `rounds` rounds. */
export function snakeOrder(seatIds: string[], rounds: number): string[] {
  const order: string[] = [];
  for (let r = 0; r < rounds; r++) {
    const round = r % 2 === 0 ? seatIds : [...seatIds].reverse();
    order.push(...round);
  }
  return order;
}

/** Open slot indices that accept a player of `pos`. */
export function eligibleSlotIndices(slots: Slot[], pos: Position): number[] {
  return slots
    .map((slot, i) => (slot.player === null && slotAccepts(slot.position, pos) ? i : -1))
    .filter((i) => i >= 0);
}

export function squadHasEligible(players: Player[], slots: Slot[]): boolean {
  return players.some((p) => eligibleSlotIndices(slots, p.position).length > 0);
}

const MAX_ROLL_TRIES = 500;

/**
 * Roll a random squad that still contains at least one undrafted player
 * eligible for the active seat's open slots (the spec's free auto-reroll).
 */
export function rollSquad(
  squads: Squad[],
  draftedIds: Set<string>,
  slots: Slot[],
  rng: () => number,
): SquadRoll {
  let fallback: SquadRoll | null = null;
  for (let tries = 0; tries < MAX_ROLL_TRIES; tries++) {
    const squad = squads[Math.floor(rng() * squads.length)];
    const players = squad.players.filter((p) => !draftedIds.has(p.id));
    if (players.length === 0) continue;
    fallback = { year: squad.year, country: squad.country, players };
    if (squadHasEligible(players, slots)) return fallback;
  }
  if (!fallback) throw new Error('player pool exhausted');
  return fallback;
}

/** Highest effective rating among eligible players; natural slot preferred. */
export function autoPick(
  players: Player[],
  slots: Slot[],
): { playerId: string; slotIndex: number } | null {
  let best: { playerId: string; slotIndex: number; score: number } | null = null;
  for (const p of players) {
    for (const i of eligibleSlotIndices(slots, p.position)) {
      const score = effectiveRating(p.rating, p.position, slots[i].position);
      if (!best || score > best.score) best = { playerId: p.id, slotIndex: i, score };
    }
  }
  return best ? { playerId: best.playerId, slotIndex: best.slotIndex } : null;
}
