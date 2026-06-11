export const APP_NAME = 'Otto a Zero';

// ---------- Domain primitives ----------
export type Position = 'GK' | 'DF' | 'MF' | 'FW';
export type GameMode = 'classic' | 'memory';
export type Phase = 'lobby' | 'formation' | 'draft' | 'tournament' | 'results';

export interface Player {
  id: string; // `${year}-${country}-${index}`
  name: string;
  position: Position;
  rating: number; // 60..99 (0 when hidden in memory mode)
  year: number;
  country: string;
}

export interface Slot {
  position: Position;
  player: Player | null;
}

export interface SquadRoll {
  year: number;
  country: string;
  players: Player[]; // undrafted players only
}

// ---------- Formations ----------
export const FORMATION_IDS = [
  '4-3-3', '4-4-2', '4-2-3-1', '3-5-2', '3-4-3', '4-5-1', '5-3-2', '5-4-1',
] as const;
export type FormationId = (typeof FORMATION_IDS)[number];

const F = (df: number, mf: number, fw: number): Position[] => [
  'GK',
  ...Array<Position>(df).fill('DF'),
  ...Array<Position>(mf).fill('MF'),
  ...Array<Position>(fw).fill('FW'),
];

export const FORMATIONS: Record<FormationId, Position[]> = {
  '4-3-3': F(4, 3, 3),
  '4-4-2': F(4, 4, 2),
  '4-2-3-1': F(4, 5, 1),
  '3-5-2': F(3, 5, 2),
  '3-4-3': F(3, 4, 3),
  '4-5-1': F(4, 5, 1),
  '5-3-2': F(5, 3, 2),
  '5-4-1': F(5, 4, 1),
};

// ---------- Rules constants ----------
export const OOP_PENALTY = 8;
export const WILDCARDS_PER_PLAYER = 3;
export const TEAM_SIZE = 11;
export const MIN_SEATS = 2;
export const MAX_SEATS = 8;
export const TURN_TIMER_CHOICES = [0, 30, 60] as const; // seconds, 0 = off

// ---------- Eligibility ----------
const ADJACENT: Record<Position, readonly Position[]> = {
  GK: [],
  DF: ['MF'],
  MF: ['DF', 'FW'],
  FW: ['MF'],
};

export function slotAccepts(slotPos: Position, playerPos: Position): boolean {
  if (slotPos === playerPos) return true;
  return ADJACENT[slotPos].includes(playerPos);
}

export function effectiveRating(
  rating: number,
  playerPos: Position,
  slotPos: Position,
): number {
  return playerPos === slotPos ? rating : rating - OOP_PENALTY;
}

// ---------- Snapshot (server -> client view model) ----------
export interface SeatView {
  id: string;
  nickname: string;
  connected: boolean;
  isHost: boolean;
  formation: FormationId | null;
  slots: Slot[];
  wildcardsLeft: number;
}

export interface PickLogEntry {
  pickNumber: number;
  seatId: string;
  nickname: string;
  player: Player;
  slotIndex: number;
  auto: boolean;
}

export interface DraftView {
  currentSeatId: string | null;
  pickNumber: number; // 0-based
  totalPicks: number;
  roll: SquadRoll | null;
  deadline: number | null; // epoch ms, null when timer off
  log: PickLogEntry[];
}

export interface MatchResult {
  homeSeatId: string;
  awaySeatId: string;
  homeGoals: number;
  awayGoals: number;
  penalties?: { home: number; away: number };
  isFinal: boolean;
  seed: number;
}

export interface StandingRow {
  seatId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  points: number;
}

export interface TournamentView {
  revealed: MatchResult[];
  totalMatches: number; // round-robin matches + 1 final
  standings: StandingRow[]; // recomputed from revealed round-robin matches
  final: MatchResult | null; // set once revealed
  championSeatId: string | null;
}

export interface RoomSnapshot {
  code: string;
  phase: Phase;
  mode: GameMode;
  turnTimerSec: number;
  seats: SeatView[];
  draft: DraftView | null;
  tournament: TournamentView | null;
}

// ---------- Socket event contracts ----------
export type JoinAck =
  | { ok: true; code: string; seatId: string; token: string }
  | { ok: false; error: string };

export interface ServerToClientEvents {
  'room:state': (snap: RoomSnapshot) => void;
  'room:error': (message: string) => void;
}

export interface ClientToServerEvents {
  'room:create': (p: { nickname: string }, ack: (r: JoinAck) => void) => void;
  'room:join': (
    p: { code: string; nickname: string; token?: string },
    ack: (r: JoinAck) => void,
  ) => void;
  'room:options': (p: { mode?: GameMode; turnTimerSec?: number }) => void;
  'room:start': () => void;
  'formation:choose': (p: { formation: FormationId }) => void;
  'draft:pick': (p: { playerId: string; slotIndex: number }) => void;
  'draft:wildcard': () => void;
  'room:rematch': () => void;
}
