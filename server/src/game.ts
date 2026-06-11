import type { FormationId, GameMode, MatchResult } from '@otto/shared';
import {
  FORMATIONS, MIN_SEATS, TEAM_SIZE, TURN_TIMER_CHOICES, WILDCARDS_PER_PLAYER,
} from '@otto/shared';
import type { Squad } from './data.js';
import { autoPick, eligibleSlotIndices, rollSquad, snakeOrder } from './draft.js';
import type { Room, Seat, TournamentPhaseState } from './rooms.js';
import { simulateMatch } from './simulate.js';
import { computeStandings, roundRobinFixtures } from './tournament.js';

export interface GameDeps {
  squads: Squad[];
  broadcast: (room: Room) => void;
  revealMs?: number; // tournament reveal cadence (tests use a small value)
}

const DEFAULT_REVEAL_MS = 2500;

function seatOf(room: Room, seatId: string): Seat {
  const seat = room.seats.find((s) => s.id === seatId);
  if (!seat) throw new Error('seat not found');
  return seat;
}

function requireHost(room: Room, seatId: string): Seat {
  const seat = seatOf(room, seatId);
  if (!seat.isHost) throw new Error('host only');
  return seat;
}

export function setOptions(
  room: Room,
  seatId: string,
  opts: { mode?: GameMode; turnTimerSec?: number },
): void {
  requireHost(room, seatId);
  if (room.phase !== 'lobby') throw new Error('options are locked after start');
  if (opts.mode) room.mode = opts.mode;
  if (opts.turnTimerSec !== undefined) {
    if (!(TURN_TIMER_CHOICES as readonly number[]).includes(opts.turnTimerSec)) {
      throw new Error('invalid turn timer');
    }
    room.turnTimerSec = opts.turnTimerSec;
  }
}

export function startGame(room: Room, seatId: string): void {
  requireHost(room, seatId);
  if (room.phase !== 'lobby') throw new Error('already started');
  if (room.seats.length < MIN_SEATS) throw new Error('need at least 2 players');
  room.phase = 'formation';
}

export function chooseFormation(
  room: Room,
  seatId: string,
  formation: FormationId,
  deps: GameDeps,
): void {
  if (room.phase !== 'formation') throw new Error('not picking formations');
  if (!FORMATIONS[formation]) throw new Error('unknown formation');
  const seat = seatOf(room, seatId);
  seat.formation = formation;
  seat.slots = FORMATIONS[formation].map((position) => ({ position, player: null }));
  if (room.seats.every((s) => s.formation !== null)) beginDraft(room, deps);
}

function shuffled<T>(items: T[], rng: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function beginDraft(room: Room, deps: GameDeps): void {
  room.phase = 'draft';
  room.draft = {
    order: snakeOrder(shuffled(room.seats.map((s) => s.id), room.rng), TEAM_SIZE),
    pickNumber: 0,
    draftedIds: new Set(),
    roll: null,
    deadline: null,
    log: [],
    timer: null,
  };
  startTurn(room, deps);
}

function startTurn(room: Room, deps: GameDeps): void {
  const d = room.draft;
  if (!d) return;
  const seat = seatOf(room, d.order[d.pickNumber]);
  d.roll = rollSquad(deps.squads, d.draftedIds, seat.slots, room.rng);
  if (room.turnTimerSec > 0) {
    d.deadline = Date.now() + room.turnTimerSec * 1000;
    d.timer = setTimeout(() => {
      const pick = autoPick(d.roll?.players ?? [], seat.slots);
      if (pick) applyPick(room, seat.id, pick.playerId, pick.slotIndex, true, deps);
    }, room.turnTimerSec * 1000);
  } else {
    d.deadline = null;
  }
  deps.broadcast(room);
}

export function handlePick(
  room: Room,
  seatId: string,
  playerId: string,
  slotIndex: number,
  deps: GameDeps,
): void {
  applyPick(room, seatId, playerId, slotIndex, false, deps);
}

function applyPick(
  room: Room,
  seatId: string,
  playerId: string,
  slotIndex: number,
  auto: boolean,
  deps: GameDeps,
): void {
  if (room.phase !== 'draft' || !room.draft) throw new Error('not drafting');
  const d = room.draft;
  if (d.order[d.pickNumber] !== seatId) throw new Error('not your turn');
  const seat = seatOf(room, seatId);
  const player = d.roll?.players.find((p) => p.id === playerId);
  if (!player) throw new Error('player not in the rolled squad');
  if (!eligibleSlotIndices(seat.slots, player.position).includes(slotIndex)) {
    throw new Error('slot not eligible for this player');
  }
  if (d.timer) { clearTimeout(d.timer); d.timer = null; }
  seat.slots[slotIndex].player = player;
  d.draftedIds.add(player.id);
  d.log.push({
    pickNumber: d.pickNumber, seatId, nickname: seat.nickname,
    player, slotIndex, auto,
  });
  d.pickNumber++;
  room.lastActivity = Date.now();
  if (d.pickNumber >= d.order.length) startTournament(room, deps);
  else startTurn(room, deps);
}

export function handleWildcard(room: Room, seatId: string, deps: GameDeps): void {
  if (room.phase !== 'draft' || !room.draft) throw new Error('not drafting');
  const d = room.draft;
  if (d.order[d.pickNumber] !== seatId) throw new Error('not your turn');
  const seat = seatOf(room, seatId);
  if (seat.wildcardsLeft <= 0) throw new Error('no wildcards left');
  seat.wildcardsLeft--;
  if (d.timer) { clearTimeout(d.timer); d.timer = null; }
  startTurn(room, deps); // rerolls for the same pickNumber/seat
}

function startTournament(room: Room, deps: GameDeps): void {
  room.phase = 'tournament';
  if (room.draft?.timer) { clearTimeout(room.draft.timer); room.draft.timer = null; }
  const ids = room.seats.map((s) => s.id);
  const slotsOf = (id: string) => seatOf(room, id).slots;
  const seed = () => Math.floor(room.rng() * 2 ** 31);

  const matches: MatchResult[] = roundRobinFixtures(ids).map(([h, a]) =>
    simulateMatch(slotsOf(h), slotsOf(a), {
      homeSeatId: h, awaySeatId: a, isFinal: false, seed: seed(),
    }),
  );
  const finalists = ids.length === 2
    ? ids
    : computeStandings(ids, matches).slice(0, 2).map((r) => r.seatId);
  matches.push(simulateMatch(slotsOf(finalists[0]), slotsOf(finalists[1]), {
    homeSeatId: finalists[0], awaySeatId: finalists[1], isFinal: true, seed: seed(),
  }));

  const t: TournamentPhaseState = {
    matches, revealedCount: 0, championSeatId: null, timer: null,
  };
  room.tournament = t;
  deps.broadcast(room);

  t.timer = setInterval(() => {
    t.revealedCount++;
    if (t.revealedCount >= t.matches.length) {
      if (t.timer) clearInterval(t.timer);
      t.timer = null;
      const final = t.matches[t.matches.length - 1];
      const homeWon = final.penalties
        ? final.penalties.home > final.penalties.away
        : final.homeGoals > final.awayGoals;
      t.championSeatId = homeWon ? final.homeSeatId : final.awaySeatId;
      room.phase = 'results';
    }
    room.lastActivity = Date.now();
    deps.broadcast(room);
  }, deps.revealMs ?? DEFAULT_REVEAL_MS);
}

export function rematch(room: Room, seatId: string, deps: GameDeps): void {
  requireHost(room, seatId);
  if (room.phase !== 'results') throw new Error('no finished game to rematch');
  if (room.tournament?.timer) clearInterval(room.tournament.timer);
  for (const s of room.seats) {
    s.formation = null;
    s.slots = [];
    s.wildcardsLeft = WILDCARDS_PER_PLAYER;
  }
  room.draft = null;
  room.tournament = null;
  room.phase = 'formation';
  deps.broadcast(room);
}
