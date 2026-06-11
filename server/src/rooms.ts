import { randomUUID } from 'node:crypto';
import type {
  DraftMode, FormationId, GameMode, MatchResult, Phase, PickLogEntry, Player,
  Position, RoomSnapshot, SeatView, Slot, SquadRoll,
} from '@otto/shared';
import { MAX_SEATS, WILDCARDS_PER_PLAYER } from '@otto/shared';
import { mulberry32 } from './simulate.js';
import { computeStandings } from './tournament.js';

export interface Seat {
  id: string;
  token: string;
  nickname: string;
  isHost: boolean;
  connected: boolean;
  formation: FormationId | null;
  slots: Slot[];
  wildcardsLeft: number;
}

export interface DraftPhaseState {
  order: string[];
  pickNumber: number;
  requiredPosition: Position | null; // blind draft: imposed role for this turn
  draftedPersons: Set<string>; // personKey() of every drafted player
  roll: SquadRoll | null;
  deadline: number | null;
  log: PickLogEntry[];
  timer: ReturnType<typeof setTimeout> | null;
}

export interface TournamentPhaseState {
  kind: 'cup' | 'series';
  matches: MatchResult[]; // round-robin matches, final last; simulated upfront
  revealedCount: number; // matches fully played back
  playingIndex: number | null; // match currently in live playback
  playStartedAt: number | null;
  playDurationMs: number;
  championSeatId: string | null;
  timer: ReturnType<typeof setTimeout> | null;
}

export interface Room {
  code: string;
  phase: Phase;
  mode: GameMode;
  draftMode: DraftMode;
  turnTimerSec: number;
  seats: Seat[];
  draft: DraftPhaseState | null;
  tournament: TournamentPhaseState | null;
  rng: () => number;
  lastActivity: number;
}

export const rooms = new Map<string, Room>();

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I/O (ambiguous)

export function generateCode(rng: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)];
  }
  return code;
}

function makeSeat(nickname: string, isHost: boolean): Seat {
  return {
    id: randomUUID(), token: randomUUID(), nickname, isHost,
    connected: true, formation: null, slots: [],
    wildcardsLeft: WILDCARDS_PER_PLAYER,
  };
}

export function createRoom(
  nickname: string,
  seed: number = Date.now(),
): { room: Room; seat: Seat } {
  let code = generateCode();
  while (rooms.has(code)) code = generateCode();
  const seat = makeSeat(nickname, true);
  const room: Room = {
    code, phase: 'lobby', mode: 'classic', draftMode: 'free', turnTimerSec: 60,
    seats: [seat], draft: null, tournament: null,
    rng: mulberry32(seed), lastActivity: Date.now(),
  };
  rooms.set(code, room);
  return { room, seat };
}

export function joinRoom(room: Room, nickname: string): Seat {
  if (room.phase !== 'lobby') throw new Error('game already started');
  if (room.seats.length >= MAX_SEATS) throw new Error('room is full');
  const seat = makeSeat(nickname, false);
  room.seats.push(seat);
  return seat;
}

export function reconnect(room: Room, token: string): Seat | null {
  const seat = room.seats.find((s) => s.token === token) ?? null;
  if (seat) seat.connected = true;
  return seat;
}

export function disconnectSeat(room: Room, seatId: string): void {
  const seat = room.seats.find((s) => s.id === seatId);
  if (!seat) return;
  seat.connected = false;
  if (seat.isHost) {
    const next = room.seats.find((s) => s.connected);
    if (next) { seat.isHost = false; next.isHost = true; }
  }
}

const ROOM_TTL_MS = 2 * 60 * 60 * 1000;
const ABANDONED_TTL_MS = 15 * 60 * 1000;

export function gcRooms(now: number = Date.now()): void {
  for (const [code, room] of rooms) {
    const idle = now - room.lastActivity;
    const abandoned = room.seats.every((s) => !s.connected);
    if (idle > ROOM_TTL_MS || (abandoned && idle > ABANDONED_TTL_MS)) {
      if (room.draft?.timer) clearTimeout(room.draft.timer);
      if (room.tournament?.timer) clearTimeout(room.tournament.timer);
      rooms.delete(code);
    }
  }
}

// ---------- Snapshot (sanitized view model) ----------

const hidePlayer = (p: Player): Player => ({ ...p, rating: 0 });
const hideSlots = (slots: Slot[]): Slot[] =>
  slots.map((s) => ({ ...s, player: s.player ? hidePlayer(s.player) : null }));

export function snapshot(room: Room): RoomSnapshot {
  const hidden = room.mode === 'memory' &&
    (room.phase === 'lobby' || room.phase === 'formation' || room.phase === 'draft');

  const seats: SeatView[] = room.seats.map((s) => ({
    id: s.id, nickname: s.nickname, connected: s.connected, isHost: s.isHost,
    formation: s.formation,
    slots: hidden ? hideSlots(s.slots) : s.slots,
    wildcardsLeft: s.wildcardsLeft,
  }));

  const d = room.draft;
  const t = room.tournament;
  const revealed = t ? t.matches.slice(0, t.revealedCount) : [];
  const revealedFinal = revealed.find((m) => m.isFinal) ?? null;

  return {
    code: room.code,
    phase: room.phase,
    mode: room.mode,
    draftMode: room.draftMode,
    turnTimerSec: room.turnTimerSec,
    seats,
    draft: d && room.phase === 'draft'
      ? {
          currentSeatId: d.order[d.pickNumber] ?? null,
          pickNumber: d.pickNumber,
          totalPicks: d.order.length,
          requiredPosition: d.requiredPosition,
          roll: d.roll && hidden
            ? { ...d.roll, players: d.roll.players.map(hidePlayer) }
            : d.roll,
          deadline: d.deadline,
          log: hidden
            ? d.log.map((e) => ({ ...e, player: hidePlayer(e.player) }))
            : d.log,
        }
      : null,
    tournament: t
      ? {
          kind: t.kind,
          revealed,
          playing: t.playingIndex !== null ? t.matches[t.playingIndex] : null,
          playStartedAt: t.playStartedAt,
          playDurationMs: t.playDurationMs,
          totalMatches: t.matches.length,
          standings: computeStandings(room.seats.map((s) => s.id), revealed),
          final: revealedFinal,
          championSeatId: t.championSeatId,
        }
      : null,
  };
}
