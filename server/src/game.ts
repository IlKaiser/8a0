import type { FormationId, GameMode, MatchResult } from '@otto/shared';
import {
  FORMATIONS, MIN_SEATS, TEAM_SIZE, TURN_TIMER_CHOICES, WILDCARDS_PER_PLAYER,
  penaltyExtraMs,
} from '@otto/shared';
import type { Squad } from './data.js';
import { autoPick, eligibleSlotIndices, personKey, rollSquad, snakeOrder } from './draft.js';
import type { Room, Seat, TournamentPhaseState } from './rooms.js';
import { simulateMatch } from './simulate.js';
import { computeStandings, roundRobinFixtures } from './tournament.js';

export interface GameDeps {
  squads: Squad[];
  broadcast: (room: Room) => void;
  playMs?: number; // wall-clock length of one 90' live playback
  gapMs?: number; // pause between matches
}

const DEFAULT_PLAY_MS = 20_000;
const DEFAULT_GAP_MS = 2_500;

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
    draftedPersons: new Set(),
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
  d.roll = rollSquad(deps.squads, d.draftedPersons, seat.slots, room.rng);
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
  d.draftedPersons.add(personKey(player));
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

  room.tournament = {
    kind: 'cup', matches, revealedCount: 0, playingIndex: null,
    playStartedAt: null, playDurationMs: deps.playMs ?? DEFAULT_PLAY_MS,
    championSeatId: null, timer: null,
  };
  runPlayback(room, deps);
}

export function matchWinner(m: MatchResult): string {
  const homeWon = m.penalties
    ? m.penalties.home > m.penalties.away
    : m.homeGoals > m.awayGoals;
  return homeWon ? m.homeSeatId : m.awaySeatId;
}

// Play matches one at a time: live playback for playMs, short gap, next.
// The champion is the winner of the last match (cup final / series clincher).
function runPlayback(room: Room, deps: GameDeps): void {
  const t = room.tournament;
  if (!t) return;
  const playNext = (): void => {
    t.playingIndex = t.revealedCount;
    t.playStartedAt = Date.now();
    room.lastActivity = Date.now();
    deps.broadcast(room);
    // a drawn match gets extra playback time for the shootout animation
    const playTime = t.playDurationMs + penaltyExtraMs(t.matches[t.playingIndex]);
    t.timer = setTimeout(() => {
      t.playingIndex = null;
      t.playStartedAt = null;
      t.revealedCount++;
      room.lastActivity = Date.now();
      if (t.revealedCount >= t.matches.length) {
        t.timer = null;
        t.championSeatId = matchWinner(t.matches[t.matches.length - 1]);
        room.phase = 'results';
        deps.broadcast(room);
      } else {
        deps.broadcast(room);
        t.timer = setTimeout(playNext, deps.gapMs ?? DEFAULT_GAP_MS);
      }
    }, playTime);
  };
  playNext();
}

/** Same drafted teams, brand-new cup (fresh seeds, so new results). */
export function replaySameTeams(room: Room, seatId: string, deps: GameDeps): void {
  requireHost(room, seatId);
  if (room.phase !== 'results' || !room.tournament) {
    throw new Error('no finished game to replay');
  }
  if (room.tournament.timer) clearTimeout(room.tournament.timer);
  room.tournament = null;
  startTournament(room, deps);
}

const SERIES_TARGET = 4; // best of 7

/** The two finalists of the finished game settle it over a first-to-4 series. */
export function startBestOf7(room: Room, seatId: string, deps: GameDeps): void {
  requireHost(room, seatId);
  if (room.phase !== 'results' || !room.tournament) {
    throw new Error('no finished game to continue');
  }
  const prev = room.tournament;
  if (prev.timer) clearTimeout(prev.timer);
  const decider = prev.matches[prev.matches.length - 1];
  const [a, b] = [decider.homeSeatId, decider.awaySeatId];
  const slotsOf = (id: string) => seatOf(room, id).slots;
  const seed = () => Math.floor(room.rng() * 2 ** 31);

  const matches: MatchResult[] = [];
  const wins: Record<string, number> = { [a]: 0, [b]: 0 };
  while (matches.length < 7 && wins[a] < SERIES_TARGET && wins[b] < SERIES_TARGET) {
    const [home, away] = matches.length % 2 === 0 ? [a, b] : [b, a]; // alternate home side
    const m = simulateMatch(slotsOf(home), slotsOf(away), {
      homeSeatId: home, awaySeatId: away, isFinal: false, seed: seed(),
    });
    wins[matchWinner(m)]++;
    matches.push(m);
  }

  room.phase = 'tournament';
  room.tournament = {
    kind: 'series', matches, revealedCount: 0, playingIndex: null,
    playStartedAt: null, playDurationMs: deps.playMs ?? DEFAULT_PLAY_MS,
    championSeatId: null, timer: null,
  };
  runPlayback(room, deps);
}

export function rematch(room: Room, seatId: string, deps: GameDeps): void {
  requireHost(room, seatId);
  if (room.phase !== 'results') throw new Error('no finished game to rematch');
  if (room.tournament?.timer) clearTimeout(room.tournament.timer);
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
