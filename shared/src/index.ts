export const APP_NAME = 'Otto a Zero';

// ---------- Domain primitives ----------
export type Position = 'GK' | 'DF' | 'MF' | 'FW';
export type GameMode = 'classic' | 'memory';
export type DraftMode = 'free' | 'blind'; // blind: a random open role is imposed each turn
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
export const WILDCARDS_PER_PLAYER = 3;
export const TEAM_SIZE = 11;
export const MIN_SEATS = 2;
export const MAX_SEATS = 8;
export const TURN_TIMER_CHOICES = [0, 30, 60] as const; // seconds, 0 = off

// ---------- Eligibility ----------
/** Strict: a slot accepts only its exact position (no FW in midfield). */
export function slotAccepts(slotPos: Position, playerPos: Position): boolean {
  return slotPos === playerPos;
}

// ---------- Team strength (shared so the UI shows the simulator's numbers) ----------
export const ATTACK_W: Record<Position, number> = { GK: 0, DF: 0.2, MF: 0.6, FW: 1 };
export const DEFENSE_W: Record<Position, number> = { GK: 1, DF: 1, MF: 0.5, FW: 0 };

export interface TeamScores { attack: number; defense: number }

/** Weighted rating means over the filled slots. */
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

// ---------- Penalty shootout playback timing (server schedules, client animates) ----------
export const PEN_INTRO_MS = 1500;
export const PEN_KICK_MS = 700;
export const PEN_OUTRO_MS = 1500;

export function penaltyExtraMs(m: MatchResult): number {
  if (!m.penalties) return 0;
  const kicks = m.penalties.kicks.home.length + m.penalties.kicks.away.length;
  return PEN_INTRO_MS + kicks * PEN_KICK_MS + PEN_OUTRO_MS;
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
  requiredPosition: Position | null; // blind draft: only this role is pickable
  roll: SquadRoll | null;
  deadline: number | null; // epoch ms, null when timer off
  log: PickLogEntry[];
}

export interface GoalEvent {
  minute: number; // 1..90
  scorerName: string;
  seatId: string; // scoring team
}

export interface MatchResult {
  homeSeatId: string;
  awaySeatId: string;
  homeGoals: number;
  awayGoals: number;
  events: GoalEvent[]; // goals in minute order
  penalties?: {
    home: number;
    away: number;
    // per-round kick outcomes, both teams kick every round (true = scored)
    kicks: { home: boolean[]; away: boolean[] };
  };
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
  kind: 'cup' | 'series'; // cup: round robin + final · series: best of 7
  revealed: MatchResult[]; // fully played matches
  playing: MatchResult | null; // match currently being played out live
  playStartedAt: number | null; // epoch ms when live playback began
  playDurationMs: number; // wall-clock length of one 90' playback
  totalMatches: number; // round-robin matches + 1 final
  standings: StandingRow[]; // recomputed from fully played matches
  final: MatchResult | null; // set once fully played
  championSeatId: string | null;
}

export interface RoomSnapshot {
  code: string;
  phase: Phase;
  mode: GameMode;
  draftMode: DraftMode;
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
  'room:options': (p: {
    mode?: GameMode;
    draftMode?: DraftMode;
    turnTimerSec?: number;
  }) => void;
  'room:start': () => void;
  'formation:choose': (p: { formation: FormationId }) => void;
  'draft:pick': (p: { playerId: string; slotIndex: number }) => void;
  'draft:wildcard': () => void;
  'room:rematch': () => void; // new draft from scratch
  'room:replay': () => void; // same teams, new tournament
  'room:bestof7': () => void; // same teams, finalists play first-to-4 series
}
