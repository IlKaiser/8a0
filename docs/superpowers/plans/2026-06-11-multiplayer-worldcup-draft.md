# Otto a Zero — Multiplayer World Cup Draft Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A browser-based multiplayer game where friends join a room, take turns drafting players from historic World Cup squads into formations, then a simulated head-to-head tournament decides the winner.

**Architecture:** Single Node.js server (Express + Socket.IO) holding rooms in memory and serving a built React SPA. Server-authoritative: clients emit intents, the server validates against room state and broadcasts sanitized snapshots. Pure game logic (draft engine, match simulator, tournament) lives in standalone modules with unit tests; the socket layer is thin orchestration.

**Tech Stack:** TypeScript everywhere. npm workspaces (`shared`, `server`, `client`). Server: Express 4, Socket.IO 4, tsx (dev). Client: React 18, Vite 5, socket.io-client 4. Tests: Vitest (unit), Playwright (e2e smoke).

**Spec:** `docs/superpowers/specs/2026-06-11-multiplayer-worldcup-draft-design.md`

---

## File Structure

```
package.json                  # npm workspaces root, scripts
tsconfig.base.json            # shared strict TS config
vitest.config.ts              # unit tests across shared/ and server/
playwright.config.ts          # e2e smoke test config
e2e/smoke.spec.ts             # 2-player full-game smoke test

shared/
  package.json                # @otto/shared (consumed as TS source)
  src/index.ts                # domain types, formations, eligibility helpers,
                              # socket event contracts, constants
  test/eligibility.test.ts

server/
  package.json                # @otto/server
  src/index.ts                # Express + Socket.IO bootstrap, static serving
  src/handlers.ts             # socket event wiring (thin)
  src/rooms.ts                # room registry, codes, seats, tokens, snapshots, GC
  src/game.ts                 # phase orchestration: start, draft turns, timers,
                              # tournament reveal loop, rematch
  src/draft.ts                # pure draft logic: snake order, rolls, picks, auto-pick
  src/simulate.ts             # pure match engine: seeded RNG, Poisson, penalties
  src/tournament.ts           # pure fixtures, standings, tiebreakers
  src/data.ts                 # dataset loader + flattener
  data/squads.json            # curated dataset (~12 editions, 4-6 teams each)
  test/{data,draft,simulate,tournament,rooms,game}.test.ts

client/
  package.json                # @otto/client
  index.html
  vite.config.ts              # dev proxy /socket.io -> :3001, build -> ../server/public
  src/main.tsx
  src/App.tsx                 # phase switch
  src/socket.ts               # typed socket singleton
  src/useRoom.ts              # snapshot subscription + intent actions + session
  src/screens/Home.tsx
  src/screens/Lobby.tsx
  src/screens/FormationPick.tsx
  src/screens/Draft.tsx
  src/screens/Tournament.tsx  # also renders Results phase
  src/components/Pitch.tsx    # formation board
  src/components/SquadCard.tsx
  src/components/Standings.tsx
  src/styles.css
```

Every file stays under 400 lines. Pure logic modules (`draft.ts`, `simulate.ts`, `tournament.ts`) never import Socket.IO or touch timers — they take state in, return state out, so they are fully unit-testable.

---

### Task 1: Workspace scaffolding

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `vitest.config.ts`, `.gitignore`
- Create: `shared/package.json`, `shared/tsconfig.json`, `shared/src/index.ts` (stub)
- Create: `server/package.json`, `server/tsconfig.json`
- Create: `client/package.json` (placeholder — Vite scaffolds it in Task 9)

- [ ] **Step 1: Root files**

`package.json`:

```json
{
  "name": "otto-a-zero",
  "private": true,
  "type": "module",
  "workspaces": ["shared", "server", "client"],
  "scripts": {
    "dev": "concurrently -n server,client \"npm -w @otto/server run dev\" \"npm -w @otto/client run dev\"",
    "build": "npm -w @otto/client run build",
    "start": "npm -w @otto/server run start",
    "test": "vitest run",
    "typecheck": "tsc -p shared && tsc -p server && tsc -p client"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "concurrently": "^8.2.2",
    "tsx": "^4.16.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true
  }
}
```

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['shared/test/**/*.test.ts', 'server/test/**/*.test.ts'],
  },
});
```

`.gitignore`:

```
node_modules/
server/public/
client/dist/
*.log
.DS_Store
test-results/
playwright-report/
```

- [ ] **Step 2: Package manifests**

`shared/package.json` (consumed as raw TS source — `main` points at `src/`, which tsx, Vite, and Vitest all resolve natively):

```json
{
  "name": "@otto/shared",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts"
}
```

`shared/tsconfig.json`:

```json
{ "extends": "../tsconfig.base.json", "include": ["src", "test"] }
```

`server/package.json`:

```json
{
  "name": "@otto/server",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts"
  },
  "dependencies": {
    "@otto/shared": "*",
    "express": "^4.19.0",
    "socket.io": "^4.7.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.21"
  }
}
```

`server/tsconfig.json`:

```json
{ "extends": "../tsconfig.base.json", "include": ["src", "test"] }
```

`client/package.json` (minimal placeholder so the workspace resolves; Task 9 fills it):

```json
{ "name": "@otto/client", "version": "0.0.1", "private": true }
```

`shared/src/index.ts` stub so install + typecheck pass:

```ts
export const APP_NAME = 'Otto a Zero';
```

- [ ] **Step 3: Install and verify**

Run: `npm install && npm run typecheck && npm test`
Expected: install succeeds; typecheck passes; vitest reports "no test files found" exit 0 (if vitest exits 1 on empty, add `passWithNoTests: true` to `vitest.config.ts` test options).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: scaffold npm workspaces (shared/server/client)"
```

---

### Task 2: Shared domain types, formations, eligibility

**Files:**
- Modify: `shared/src/index.ts` (replace stub)
- Test: `shared/test/eligibility.test.ts`

- [ ] **Step 1: Write the failing test**

`shared/test/eligibility.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  FORMATIONS, FORMATION_IDS, OOP_PENALTY, effectiveRating, slotAccepts,
} from '../src/index.js';

describe('formations', () => {
  it('defines all 8 formations with exactly 11 slots and 1 GK', () => {
    expect(FORMATION_IDS).toHaveLength(8);
    for (const id of FORMATION_IDS) {
      const slots = FORMATIONS[id];
      expect(slots).toHaveLength(11);
      expect(slots.filter((p) => p === 'GK')).toHaveLength(1);
    }
  });

  it('formation shape matches its name (e.g. 4-3-3 = 4 DF, 3 MF, 3 FW)', () => {
    const f = FORMATIONS['4-3-3'];
    expect(f.filter((p) => p === 'DF')).toHaveLength(4);
    expect(f.filter((p) => p === 'MF')).toHaveLength(3);
    expect(f.filter((p) => p === 'FW')).toHaveLength(3);
  });
});

describe('slotAccepts', () => {
  it('accepts exact position', () => {
    expect(slotAccepts('FW', 'FW')).toBe(true);
    expect(slotAccepts('GK', 'GK')).toBe(true);
  });
  it('accepts adjacent outfield positions', () => {
    expect(slotAccepts('DF', 'MF')).toBe(true);
    expect(slotAccepts('MF', 'DF')).toBe(true);
    expect(slotAccepts('MF', 'FW')).toBe(true);
    expect(slotAccepts('FW', 'MF')).toBe(true);
  });
  it('rejects non-adjacent and any GK mismatch', () => {
    expect(slotAccepts('DF', 'FW')).toBe(false);
    expect(slotAccepts('FW', 'DF')).toBe(false);
    expect(slotAccepts('GK', 'DF')).toBe(false);
    expect(slotAccepts('MF', 'GK')).toBe(false);
  });
});

describe('effectiveRating', () => {
  it('full rating in natural position, penalty otherwise', () => {
    expect(effectiveRating(90, 'FW', 'FW')).toBe(90);
    expect(effectiveRating(90, 'MF', 'FW')).toBe(90 - OOP_PENALTY);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run shared`
Expected: FAIL — `slotAccepts` etc. not exported.

- [ ] **Step 3: Implement shared module**

`shared/src/index.ts` (complete replacement):

```ts
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
```

Note `'4-2-3-1'` maps to 4 DF / 5 MF / 1 FW (the 2-3 are all midfield bands) — same shape as 4-5-1 but kept as a distinct named choice, matching the original game's 8 formations.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run shared`
Expected: PASS (all 6 tests).

- [ ] **Step 5: Commit**

```bash
git add shared
git commit -m "feat(shared): domain types, formations, eligibility, socket contracts"
```

---

### Task 3: Curated dataset + loader

**Files:**
- Create: `server/data/squads.json`
- Create: `server/src/data.ts`
- Test: `server/test/data.test.ts`

- [ ] **Step 1: Write the failing test**

`server/test/data.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { loadSquads } from '../src/data.js';

const squads = loadSquads();

describe('squads dataset', () => {
  it('has at least 40 squads across at least 10 editions', () => {
    expect(squads.length).toBeGreaterThanOrEqual(40);
    expect(new Set(squads.map((s) => s.year)).size).toBeGreaterThanOrEqual(10);
  });

  it('every squad has >=18 players incl. >=2 GK, >=5 DF, >=5 MF, >=3 FW', () => {
    for (const s of squads) {
      expect(s.players.length, `${s.year} ${s.country}`).toBeGreaterThanOrEqual(18);
      const count = (p: string) => s.players.filter((x) => x.position === p).length;
      expect(count('GK'), `${s.year} ${s.country} GK`).toBeGreaterThanOrEqual(2);
      expect(count('DF'), `${s.year} ${s.country} DF`).toBeGreaterThanOrEqual(5);
      expect(count('MF'), `${s.year} ${s.country} MF`).toBeGreaterThanOrEqual(5);
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/test/data.test.ts`
Expected: FAIL — `../src/data.js` does not exist.

- [ ] **Step 3: Implement the loader**

`server/src/data.ts`:

```ts
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Player, Position } from '@otto/shared';

interface RawPlayer { name: string; position: Position; rating: number }
interface RawTeam { country: string; players: RawPlayer[] }
interface RawEdition { year: number; teams: RawTeam[] }
interface RawDataset { editions: RawEdition[] }

export interface Squad {
  year: number;
  country: string;
  players: Player[];
}

let cache: Squad[] | null = null;

export function loadSquads(): Squad[] {
  if (cache) return cache;
  const here = dirname(fileURLToPath(import.meta.url));
  const raw = JSON.parse(
    readFileSync(join(here, '..', 'data', 'squads.json'), 'utf8'),
  ) as RawDataset;
  cache = raw.editions.flatMap((ed) =>
    ed.teams.map((t) => ({
      year: ed.year,
      country: t.country,
      players: t.players.map((p, i) => ({
        ...p,
        id: `${ed.year}-${t.country}-${i}`,
        year: ed.year,
        country: t.country,
      })),
    })),
  );
  return cache;
}
```

- [ ] **Step 4: Author the dataset**

`server/data/squads.json` — hand-curated from historical World Cup squads. **Required coverage (enforced by the test):**

- Editions: 1970, 1974, 1982, 1986, 1990, 1994, 1998, 2002, 2006, 2010, 2014, 2022.
- 4–6 iconic teams per edition (e.g., 1970: Brazil, Italy, West Germany, England, Uruguay; 1986: Argentina, France, Brazil, Denmark, West Germany; 2010: Spain, Netherlands, Germany, Uruguay, Argentina; 2022: Argentina, France, Brazil, Morocco, Croatia — pick the memorable teams of each edition).
- Each squad: 18–23 real players with real names, positions mapped to GK/DF/MF/FW, ratings 60–99 assigned from historical reputation (all-time greats 95–99: Pelé '70, Maradona '86, Messi '22, Zidane '98, Ronaldo '02; stars 88–94; solid internationals 78–87; squad players 65–77).

Exact JSON shape (one edition shown; repeat the pattern):

```json
{
  "editions": [
    {
      "year": 1970,
      "teams": [
        {
          "country": "Brazil",
          "players": [
            { "name": "Félix", "position": "GK", "rating": 78 },
            { "name": "Ado", "position": "GK", "rating": 68 },
            { "name": "Carlos Alberto", "position": "DF", "rating": 93 },
            { "name": "Brito", "position": "DF", "rating": 82 },
            { "name": "Piazza", "position": "DF", "rating": 81 },
            { "name": "Everaldo", "position": "DF", "rating": 79 },
            { "name": "Marco Antônio", "position": "DF", "rating": 74 },
            { "name": "Fontana", "position": "DF", "rating": 72 },
            { "name": "Baldocchi", "position": "DF", "rating": 68 },
            { "name": "Clodoaldo", "position": "MF", "rating": 86 },
            { "name": "Gérson", "position": "MF", "rating": 92 },
            { "name": "Rivellino", "position": "MF", "rating": 94 },
            { "name": "Paulo Cézar", "position": "MF", "rating": 80 },
            { "name": "Edu", "position": "MF", "rating": 75 },
            { "name": "Zé Maria", "position": "DF", "rating": 73 },
            { "name": "Pelé", "position": "FW", "rating": 99 },
            { "name": "Jairzinho", "position": "FW", "rating": 95 },
            { "name": "Tostão", "position": "FW", "rating": 91 },
            { "name": "Roberto", "position": "FW", "rating": 70 },
            { "name": "Dadá Maravilha", "position": "FW", "rating": 72 }
          ]
        }
      ]
    }
  ]
}
```

The executor authors the full file from historical knowledge following this pattern. Accuracy bar: real squad members of that edition where known; a misremembered fringe player is acceptable, an invented name is not.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run server/test/data.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add server/src/data.ts server/data/squads.json server/test/data.test.ts
git commit -m "feat(server): curated world cup squads dataset and loader"
```

---

### Task 4: Draft engine (pure logic)

**Files:**
- Create: `server/src/draft.ts`
- Test: `server/test/draft.test.ts`

- [ ] **Step 1: Write the failing test**

`server/test/draft.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Player, Slot } from '@otto/shared';
import { FORMATIONS } from '@otto/shared';
import {
  autoPick, eligibleSlotIndices, rollSquad, snakeOrder, squadHasEligible,
} from '../src/draft.js';
import type { Squad } from '../src/data.js';

const P = (id: string, position: Player['position'], rating: number): Player =>
  ({ id, name: id, position, rating, year: 2022, country: 'X' });

const emptySlots = (): Slot[] =>
  FORMATIONS['4-3-3'].map((position) => ({ position, player: null }));

describe('snakeOrder', () => {
  it('reverses direction every round', () => {
    expect(snakeOrder(['a', 'b', 'c'], 3)).toEqual([
      'a', 'b', 'c', 'c', 'b', 'a', 'a', 'b', 'c',
    ]);
  });
  it('covers seats x rounds picks', () => {
    expect(snakeOrder(['a', 'b'], 11)).toHaveLength(22);
  });
});

describe('eligibleSlotIndices', () => {
  it('GK only fits the GK slot and vice versa', () => {
    const slots = emptySlots();
    expect(eligibleSlotIndices(slots, 'GK')).toEqual([0]);
    slots[0].player = P('gk1', 'GK', 80);
    expect(eligibleSlotIndices(slots, 'GK')).toEqual([]);
  });
  it('outfield players fit natural + adjacent open slots only', () => {
    const slots = emptySlots(); // 4-3-3: GK, 4xDF(1-4), 3xMF(5-7), 3xFW(8-10)
    expect(eligibleSlotIndices(slots, 'FW')).toEqual([5, 6, 7, 8, 9, 10]);
    expect(eligibleSlotIndices(slots, 'DF')).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});

describe('squadHasEligible / rollSquad', () => {
  it('detects squads with no eligible player', () => {
    const slots = emptySlots();
    for (let i = 1; i < 11; i++) slots[i].player = P(`x${i}`, slots[i].position, 70);
    // only GK slot open -> a squad with no GK is ineligible
    expect(squadHasEligible([P('fw', 'FW', 90)], slots)).toBe(false);
    expect(squadHasEligible([P('gk', 'GK', 70)], slots)).toBe(true);
  });

  it('rollSquad skips drafted players and ineligible squads', () => {
    const slots = emptySlots();
    for (let i = 1; i < 11; i++) slots[i].player = P(`x${i}`, slots[i].position, 70);
    const squads: Squad[] = [
      { year: 1970, country: 'NoGK', players: [P('a', 'FW', 90)] },
      { year: 1974, country: 'HasGK', players: [P('b', 'GK', 75), P('c', 'GK', 70)] },
    ];
    const drafted = new Set(['c']);
    // rng: first try squad 0 (no GK -> ineligible), then squad 1
    const seq = [0, 0.9];
    let call = 0;
    const rng = () => seq[Math.min(call++, seq.length - 1)];
    const roll = rollSquad(squads, drafted, slots, rng);
    expect(roll.country).toBe('HasGK');
    expect(roll.players.map((p) => p.id)).toEqual(['b']); // 'c' drafted, filtered out
  });
});

describe('autoPick', () => {
  it('picks highest effective rating and prefers the natural slot', () => {
    const slots = emptySlots();
    const squad = [P('mf', 'MF', 90), P('fw', 'FW', 88)];
    const pick = autoPick(squad, slots);
    // MF 90 natural beats FW 88; natural MF slot indices are 5..7
    expect(pick).toEqual({ playerId: 'mf', slotIndex: 5 });
  });
  it('falls back to adjacent slot when natural slots are full', () => {
    const slots = emptySlots();
    for (const i of [5, 6, 7]) slots[i].player = P(`m${i}`, 'MF', 70);
    const pick = autoPick([P('mf2', 'MF', 95)], slots);
    // MF natural full; adjacent open: DF(1) and FW(8); takes first eligible
    expect(pick?.playerId).toBe('mf2');
    expect([1, 8]).toContain(pick?.slotIndex);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/test/draft.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the draft engine**

`server/src/draft.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/test/draft.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/draft.ts server/test/draft.test.ts
git commit -m "feat(server): draft engine - snake order, eligibility, rolls, auto-pick"
```

---

### Task 5: Match simulator (pure logic)

**Files:**
- Create: `server/src/simulate.ts`
- Test: `server/test/simulate.test.ts`

- [ ] **Step 1: Write the failing test**

`server/test/simulate.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Player, Slot } from '@otto/shared';
import { FORMATIONS } from '@otto/shared';
import { mulberry32, poisson, simulateMatch, teamScores } from '../src/simulate.js';

const team = (rating: number): Slot[] =>
  FORMATIONS['4-4-2'].map((position, i) => ({
    position,
    player: {
      id: `p${rating}-${i}`, name: `p${i}`, position, rating,
      year: 2022, country: 'X',
    } satisfies Player,
  }));

describe('mulberry32', () => {
  it('is deterministic per seed and emits values in [0,1)', () => {
    const a = mulberry32(42); const b = mulberry32(42);
    const seq = Array.from({ length: 5 }, () => a());
    expect(seq).toEqual(Array.from({ length: 5 }, () => b()));
    for (const v of seq) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
  });
});

describe('poisson', () => {
  it('sample mean approximates lambda', () => {
    const rng = mulberry32(1);
    const n = 5000;
    let sum = 0;
    for (let i = 0; i < n; i++) sum += poisson(1.5, rng);
    expect(sum / n).toBeGreaterThan(1.3);
    expect(sum / n).toBeLessThan(1.7);
  });
});

describe('teamScores', () => {
  it('all-natural full-strength team gets the balance bonus', () => {
    const t = teamScores(team(90));
    expect(t.attack).toBeGreaterThan(90); // 90 weighted avg + bonus
    expect(t.defense).toBeGreaterThan(90);
  });
});

describe('simulateMatch', () => {
  it('same seed gives the same result', () => {
    const a = simulateMatch(team(90), team(80), { homeSeatId: 'h', awaySeatId: 'a', isFinal: false, seed: 7 });
    const b = simulateMatch(team(90), team(80), { homeSeatId: 'h', awaySeatId: 'a', isFinal: false, seed: 7 });
    expect(a).toEqual(b);
  });

  it('clearly stronger team wins the large majority of matches', () => {
    let strongWins = 0; let weakWins = 0;
    for (let seed = 0; seed < 400; seed++) {
      const r = simulateMatch(team(95), team(70), { homeSeatId: 'h', awaySeatId: 'a', isFinal: false, seed });
      if (r.homeGoals > r.awayGoals) strongWins++;
      if (r.awayGoals > r.homeGoals) weakWins++;
    }
    expect(strongWins).toBeGreaterThan(280); // >70%
    expect(weakWins).toBeLessThan(60);       // upsets exist but are rare
  });

  it('a final never ends level: penalties decide drawn matches', () => {
    for (let seed = 0; seed < 200; seed++) {
      const r = simulateMatch(team(85), team(85), { homeSeatId: 'h', awaySeatId: 'a', isFinal: true, seed });
      if (r.homeGoals === r.awayGoals) {
        expect(r.penalties).toBeDefined();
        expect(r.penalties!.home).not.toBe(r.penalties!.away);
      } else {
        expect(r.penalties).toBeUndefined();
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/test/simulate.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the simulator**

`server/src/simulate.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/test/simulate.test.ts`
Expected: PASS (6 tests). If the 70%-win threshold is flaky, the engine constants (not the test) are wrong — a 25-point rating gap must dominate.

- [ ] **Step 5: Commit**

```bash
git add server/src/simulate.ts server/test/simulate.test.ts
git commit -m "feat(server): seeded match simulator with poisson goals and penalties"
```

---

### Task 6: Tournament scheduling and standings (pure logic)

**Files:**
- Create: `server/src/tournament.ts`
- Test: `server/test/tournament.test.ts`

- [ ] **Step 1: Write the failing test**

`server/test/tournament.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { MatchResult } from '@otto/shared';
import { computeStandings, roundRobinFixtures } from '../src/tournament.js';

const match = (h: string, a: string, hg: number, ag: number): MatchResult =>
  ({ homeSeatId: h, awaySeatId: a, homeGoals: hg, awayGoals: ag, isFinal: false, seed: 0 });

describe('roundRobinFixtures', () => {
  it('every pair meets exactly once', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const fixtures = roundRobinFixtures(ids);
    expect(fixtures).toHaveLength((5 * 4) / 2);
    const keys = fixtures.map(([h, a]) => [h, a].sort().join('-'));
    expect(new Set(keys).size).toBe(fixtures.length);
  });
  it('returns no fixtures for 2 seats (they go straight to the final)', () => {
    expect(roundRobinFixtures(['a', 'b'])).toEqual([]);
  });
});

describe('computeStandings', () => {
  it('orders by points, then goal difference, then goals scored', () => {
    const results = [
      match('a', 'b', 2, 0), // a 3pts +2
      match('a', 'c', 1, 1), // a 4pts, c 1pt
      match('b', 'c', 3, 0), // b 3pts +1, c 1pt -4
    ];
    const rows = computeStandings(['a', 'b', 'c'], results);
    expect(rows.map((r) => r.seatId)).toEqual(['a', 'b', 'c']);
    expect(rows[0]).toMatchObject({ points: 4, won: 1, drawn: 1, lost: 0, gf: 3, ga: 1 });
  });

  it('breaks a two-way tie on head-to-head result', () => {
    // 4 teams: a and b finish equal on points, gd, and gf;
    // b won the head-to-head, so b ranks above a.
    const four = [
      match('a', 'b', 0, 1),
      match('a', 'c', 2, 0),
      match('a', 'd', 2, 0),
      match('b', 'c', 0, 1),
      match('b', 'd', 3, 0),
      match('c', 'd', 0, 0),
    ];
    // a: W2 L1, 6pts, gf4 ga1, gd+3 ; b: W2 L1, 6pts, gf4 ga1, gd+3
    const rows = computeStandings(['a', 'b', 'c', 'd'], four);
    expect(rows[0].seatId).toBe('b'); // h2h winner above a
    expect(rows[1].seatId).toBe('a');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/test/tournament.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement tournament logic**

`server/src/tournament.ts`:

```ts
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
  const apply = (id: string, gf: number, ga: number) => {
    const r = rows.get(id);
    if (!r) return;
    r.played++; r.gf += gf; r.ga += ga;
    if (gf > ga) { r.won++; r.points += 3; }
    else if (gf === ga) { r.drawn++; r.points += 1; }
    else r.lost++;
  };
  for (const m of results.filter((m) => !m.isFinal)) {
    apply(m.homeSeatId, m.homeGoals, m.awayGoals);
    apply(m.awaySeatId, m.awayGoals, m.homeGoals);
  }

  const h2h = (a: string, b: string): number => {
    const m = results.find(
      (m) => !m.isFinal &&
        ((m.homeSeatId === a && m.awaySeatId === b) ||
         (m.homeSeatId === b && m.awaySeatId === a)),
    );
    if (!m || m.homeGoals === m.awayGoals) return 0;
    const winner = m.homeGoals > m.awayGoals ? m.homeSeatId : m.awaySeatId;
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/test/tournament.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/tournament.ts server/test/tournament.test.ts
git commit -m "feat(server): round robin fixtures and standings with tiebreakers"
```

---

### Task 7: Room manager

**Files:**
- Create: `server/src/rooms.ts`
- Test: `server/test/rooms.test.ts`

- [ ] **Step 1: Write the failing test**

`server/test/rooms.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { FORMATIONS, type Player } from '@otto/shared';
import {
  createRoom, disconnectSeat, gcRooms, joinRoom, reconnect, rooms, snapshot,
} from '../src/rooms.js';

const P = (id: string, rating: number): Player =>
  ({ id, name: id, position: 'MF', rating, year: 2022, country: 'X' });

describe('room lifecycle', () => {
  it('createRoom issues a 5-letter code and a host seat with token', () => {
    const { room, seat } = createRoom('ann');
    expect(room.code).toMatch(/^[A-Z]{5}$/);
    expect(seat.isHost).toBe(true);
    expect(seat.token).toBeTruthy();
    expect(rooms.get(room.code)).toBe(room);
  });

  it('joinRoom adds seats but rejects once the game started', () => {
    const { room } = createRoom('ann');
    const bob = joinRoom(room, 'bob');
    expect(room.seats).toHaveLength(2);
    expect(bob.isHost).toBe(false);
    room.phase = 'draft';
    expect(() => joinRoom(room, 'late')).toThrow(/started/);
  });

  it('reconnect by token reclaims the same seat', () => {
    const { room, seat } = createRoom('ann');
    seat.connected = false;
    const back = reconnect(room, seat.token);
    expect(back?.id).toBe(seat.id);
    expect(back?.connected).toBe(true);
    expect(reconnect(room, 'bogus')).toBeNull();
  });

  it('host disconnect promotes the next connected seat', () => {
    const { room, seat: host } = createRoom('ann');
    const bob = joinRoom(room, 'bob');
    disconnectSeat(room, host.id);
    expect(host.isHost).toBe(false);
    expect(bob.isHost).toBe(true);
  });

  it('gcRooms removes idle rooms', () => {
    const { room } = createRoom('ann');
    room.lastActivity = Date.now() - 3 * 60 * 60 * 1000;
    gcRooms();
    expect(rooms.has(room.code)).toBe(false);
  });
});

describe('snapshot sanitization', () => {
  it('memory mode hides ratings during the draft but not in tournament/results', () => {
    const { room, seat } = createRoom('ann');
    room.mode = 'memory';
    room.phase = 'draft';
    seat.slots = FORMATIONS['4-4-2'].map((position) => ({ position, player: null }));
    seat.slots[5].player = P('m1', 91);
    room.draft = {
      order: [seat.id], pickNumber: 0, draftedIds: new Set(),
      roll: { year: 2022, country: 'X', players: [P('m2', 88)] },
      deadline: null, log: [], timer: null,
    };
    let snap = snapshot(room);
    expect(snap.seats[0].slots[5].player?.rating).toBe(0);
    expect(snap.draft?.roll?.players[0].rating).toBe(0);

    room.phase = 'tournament';
    snap = snapshot(room);
    expect(snap.seats[0].slots[5].player?.rating).toBe(91);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/test/rooms.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the room manager**

`server/src/rooms.ts`:

```ts
import { randomUUID } from 'node:crypto';
import type {
  FormationId, GameMode, MatchResult, Phase, PickLogEntry, Player,
  RoomSnapshot, SeatView, Slot, SquadRoll,
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
  draftedIds: Set<string>;
  roll: SquadRoll | null;
  deadline: number | null;
  log: PickLogEntry[];
  timer: ReturnType<typeof setTimeout> | null;
}

export interface TournamentPhaseState {
  matches: MatchResult[]; // round-robin matches, final last; simulated upfront
  revealedCount: number;
  championSeatId: string | null;
  timer: ReturnType<typeof setInterval> | null;
}

export interface Room {
  code: string;
  phase: Phase;
  mode: GameMode;
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
    code, phase: 'lobby', mode: 'classic', turnTimerSec: 60,
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
      if (room.tournament?.timer) clearInterval(room.tournament.timer);
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
    turnTimerSec: room.turnTimerSec,
    seats,
    draft: d && room.phase === 'draft'
      ? {
          currentSeatId: d.order[d.pickNumber] ?? null,
          pickNumber: d.pickNumber,
          totalPicks: d.order.length,
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
          revealed,
          totalMatches: t.matches.length,
          standings: computeStandings(room.seats.map((s) => s.id), revealed),
          final: revealedFinal,
          championSeatId: t.championSeatId,
        }
      : null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/test/rooms.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/rooms.ts server/test/rooms.test.ts
git commit -m "feat(server): room registry, seats, reconnect tokens, sanitized snapshots"
```

---

### Task 8: Game orchestration + socket layer

**Files:**
- Create: `server/src/game.ts`
- Create: `server/src/handlers.ts`
- Create: `server/src/index.ts`
- Test: `server/test/game.test.ts`

- [ ] **Step 1: Write the failing test**

`server/test/game.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Position } from '@otto/shared';
import { autoPick } from '../src/draft.js';
import type { Squad } from '../src/data.js';
import { createRoom, joinRoom } from '../src/rooms.js';
import * as game from '../src/game.js';

function testSquads(): Squad[] {
  const make = (year: number, country: string): Squad => {
    const spec: Array<[Position, number]> = [['GK', 3], ['DF', 7], ['MF', 6], ['FW', 4]];
    const players = spec.flatMap(([position, n]) =>
      Array.from({ length: n }, (_, i) => ({
        id: `${year}-${country}-${position}${i}`,
        name: `${country} ${position}${i}`,
        position, rating: 70 + ((i * 7) % 25), year, country,
      })),
    );
    return { year, country, players };
  };
  return [make(1970, 'AAA'), make(1986, 'BBB'), make(2010, 'CCC'), make(2022, 'DDD')];
}

const depsWith = (over: Partial<game.GameDeps> = {}): game.GameDeps =>
  ({ squads: testSquads(), broadcast: vi.fn(), revealMs: 5, ...over });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setupDraft(deps: game.GameDeps) {
  const { room, seat: host } = createRoom('ann', 123);
  const guest = joinRoom(room, 'bob');
  game.startGame(room, host.id);
  game.chooseFormation(room, host.id, '4-4-2', deps);
  game.chooseFormation(room, guest.id, '4-3-3', deps);
  return { room, host, guest };
}

describe('game flow', () => {
  it('runs lobby -> formation -> draft -> tournament -> results for 2 players', () => {
    const deps = depsWith();
    const { room } = setupDraft(deps);
    expect(room.phase).toBe('draft');
    expect(room.draft!.order).toHaveLength(22);

    let guard = 0;
    while (room.phase === 'draft' && guard++ < 30) {
      const d = room.draft!;
      const seatId = d.order[d.pickNumber];
      const seat = room.seats.find((s) => s.id === seatId)!;
      const pick = autoPick(d.roll!.players, seat.slots)!;
      game.handlePick(room, seatId, pick.playerId, pick.slotIndex, deps);
    }
    expect(room.phase).toBe('tournament');
    expect(room.tournament!.matches).toHaveLength(1); // 2 players -> final only
    expect(room.seats.every((s) => s.slots.every((sl) => sl.player !== null))).toBe(true);

    vi.advanceTimersByTime(100);
    expect(room.phase).toBe('results');
    expect(room.tournament!.championSeatId).toBeTruthy();
  });

  it('rejects picks out of turn and ineligible slots', () => {
    const deps = depsWith();
    const { room } = setupDraft(deps);
    const d = room.draft!;
    const wrongSeat = room.seats.find((s) => s.id !== d.order[0])!;
    const anyPlayer = d.roll!.players[0];
    expect(() =>
      game.handlePick(room, wrongSeat.id, anyPlayer.id, 0, deps),
    ).toThrow(/turn/);
  });

  it('wildcard rerolls the squad and decrements the counter', () => {
    const deps = depsWith();
    const { room } = setupDraft(deps);
    const d = room.draft!;
    const seat = room.seats.find((s) => s.id === d.order[0])!;
    const before = d.roll;
    game.handleWildcard(room, seat.id, deps);
    expect(seat.wildcardsLeft).toBe(2);
    expect(d.pickNumber).toBe(0); // same turn
    expect(d.roll).not.toBe(before);
    expect(() => {
      seat.wildcardsLeft = 0;
      game.handleWildcard(room, seat.id, deps);
    }).toThrow(/wildcard/i);
  });

  it('turn timer auto-picks for an absent player', () => {
    const deps = depsWith();
    const { room, host } = setupDraft(deps);
    // restart draft with a timer: simplest is to set timer before formations
    const fresh = createRoom('carl', 9);
    const dana = joinRoom(fresh.room, 'dana');
    game.setOptions(fresh.room, fresh.seat.id, { turnTimerSec: 30 });
    game.startGame(fresh.room, fresh.seat.id);
    game.chooseFormation(fresh.room, fresh.seat.id, '4-4-2', deps);
    game.chooseFormation(fresh.room, dana.id, '4-4-2', deps);
    expect(fresh.room.draft!.pickNumber).toBe(0);
    vi.advanceTimersByTime(30_000);
    expect(fresh.room.draft!.pickNumber).toBe(1);
    expect(fresh.room.draft!.log[0].auto).toBe(true);
    void room; void host;
  });

  it('rematch resets to formation phase with full wildcards and empty boards', () => {
    const deps = depsWith();
    const { room, host } = setupDraft(deps);
    let guard = 0;
    while (room.phase === 'draft' && guard++ < 30) {
      const d = room.draft!;
      const seatId = d.order[d.pickNumber];
      const seat = room.seats.find((s) => s.id === seatId)!;
      const pick = autoPick(d.roll!.players, seat.slots)!;
      game.handlePick(room, seatId, pick.playerId, pick.slotIndex, deps);
    }
    vi.advanceTimersByTime(100);
    expect(room.phase).toBe('results');
    game.rematch(room, host.id, deps);
    expect(room.phase).toBe('formation');
    expect(room.seats.every((s) => s.formation === null && s.slots.length === 0)).toBe(true);
    expect(room.seats.every((s) => s.wildcardsLeft === 3)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/test/game.test.ts`
Expected: FAIL — `../src/game.js` not found.

- [ ] **Step 3: Implement game orchestration**

`server/src/game.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/test/game.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Implement the socket layer**

`server/src/handlers.ts`:

```ts
import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@otto/shared';
import { loadSquads } from './data.js';
import * as game from './game.js';
import type { Room } from './rooms.js';
import {
  createRoom, disconnectSeat, joinRoom, reconnect, rooms, snapshot,
} from './rooms.js';

export interface SocketData {
  code?: string;
  seatId?: string;
}

type IO = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type Sock = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

export function registerHandlers(io: IO, socket: Sock): void {
  const broadcast = (room: Room): void => {
    io.to(room.code).emit('room:state', snapshot(room));
  };
  const deps: game.GameDeps = { squads: loadSquads(), broadcast };

  const withRoom = (fn: (room: Room, seatId: string) => void): void => {
    const { code, seatId } = socket.data;
    const room = code ? rooms.get(code) : undefined;
    if (!room || !seatId) {
      socket.emit('room:error', 'not in a room');
      return;
    }
    try {
      room.lastActivity = Date.now();
      fn(room, seatId);
      broadcast(room);
    } catch (err) {
      socket.emit('room:error', err instanceof Error ? err.message : 'error');
    }
  };

  socket.on('room:create', ({ nickname }, ack) => {
    const name = nickname.trim().slice(0, 20);
    if (!name) { ack({ ok: false, error: 'nickname required' }); return; }
    const { room, seat } = createRoom(name);
    socket.data.code = room.code;
    socket.data.seatId = seat.id;
    void socket.join(room.code);
    ack({ ok: true, code: room.code, seatId: seat.id, token: seat.token });
    broadcast(room);
  });

  socket.on('room:join', ({ code, nickname, token }, ack) => {
    const room = rooms.get(code.trim().toUpperCase());
    if (!room) { ack({ ok: false, error: 'room not found' }); return; }
    try {
      let seat = token ? reconnect(room, token) : null;
      if (!seat && token && !nickname.trim()) {
        // token-only resume (page refresh) with a stale token: don't
        // silently join the room as a brand-new player
        ack({ ok: false, error: 'session expired' });
        return;
      }
      seat ??= joinRoom(room, nickname.trim().slice(0, 20) || 'player');
      socket.data.code = room.code;
      socket.data.seatId = seat.id;
      void socket.join(room.code);
      ack({ ok: true, code: room.code, seatId: seat.id, token: seat.token });
      room.lastActivity = Date.now();
      broadcast(room);
    } catch (err) {
      ack({ ok: false, error: err instanceof Error ? err.message : 'cannot join' });
    }
  });

  socket.on('room:options', (opts) =>
    withRoom((room, seatId) => game.setOptions(room, seatId, opts)));
  socket.on('room:start', () =>
    withRoom((room, seatId) => game.startGame(room, seatId)));
  socket.on('formation:choose', ({ formation }) =>
    withRoom((room, seatId) => game.chooseFormation(room, seatId, formation, deps)));
  socket.on('draft:pick', ({ playerId, slotIndex }) =>
    withRoom((room, seatId) => game.handlePick(room, seatId, playerId, slotIndex, deps)));
  socket.on('draft:wildcard', () =>
    withRoom((room, seatId) => game.handleWildcard(room, seatId, deps)));
  socket.on('room:rematch', () =>
    withRoom((room, seatId) => game.rematch(room, seatId, deps)));

  socket.on('disconnect', () => {
    const { code, seatId } = socket.data;
    const room = code ? rooms.get(code) : undefined;
    if (room && seatId) {
      disconnectSeat(room, seatId);
      broadcast(room);
    }
  });
}
```

`server/src/index.ts`:

```ts
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@otto/shared';
import type { SocketData } from './handlers.js';
import { registerHandlers } from './handlers.js';
import { gcRooms } from './rooms.js';

const app = express();
const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, '..', 'public');

if (existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.get('*', (_req, res) => res.sendFile(join(publicDir, 'index.html')));
} else {
  app.get('/', (_req, res) =>
    res.send('otto-a-zero server (dev): run the Vite client on :5173'));
}

const httpServer = createServer(app);
const io = new Server<
  ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData
>(httpServer);
io.on('connection', (socket) => registerHandlers(io, socket));

setInterval(() => gcRooms(), 10 * 60 * 1000).unref();

const port = Number(process.env.PORT ?? 3001);
httpServer.listen(port, () => {
  console.log(`otto-a-zero listening on :${port}`);
});
```

- [ ] **Step 6: Verify the whole server suite and typecheck**

Run: `npm test && npx tsc -p server`
Expected: all server + shared tests PASS; no type errors.

- [ ] **Step 7: Commit**

```bash
git add server/src server/test
git commit -m "feat(server): game orchestration, socket handlers, http bootstrap"
```

---

### Task 9: Client foundation (Vite app, socket hook, Home screen)

UI tasks (9–12) follow build-verify instead of unit TDD: pure logic is already
unit-tested server-side; the client is render-only and gets covered by the
Playwright smoke test in Task 13. At execution time, apply the
`frontend-design` skill's sensibility: this should look like a stadium-night
football product, not a default-styled form.

**Files:**
- Modify: `client/package.json` (replace placeholder)
- Create: `client/tsconfig.json`, `client/vite.config.ts`, `client/index.html`
- Create: `client/src/main.tsx`, `client/src/App.tsx`, `client/src/socket.ts`,
  `client/src/useRoom.ts`, `client/src/screens/Home.tsx`, `client/src/styles.css`

- [ ] **Step 1: Client package and config**

`client/package.json`:

```json
{
  "name": "@otto/client",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -p . && vite build"
  },
  "dependencies": {
    "@otto/shared": "*",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "socket.io-client": "^4.7.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "vite": "^5.3.0"
  }
}
```

`client/tsconfig.json`:

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  },
  "include": ["src"]
}
```

`client/vite.config.ts`:

```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  build: { outDir: '../server/public', emptyOutDir: true },
  server: {
    proxy: { '/socket.io': { target: 'http://localhost:3001', ws: true } },
  },
});
```

`client/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Otto a Zero — multiplayer world cup draft</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Socket singleton and room hook**

`client/src/socket.ts`:

```ts
import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@otto/shared';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
export const socket: AppSocket = io();
```

`client/src/useRoom.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';
import type { FormationId, GameMode, JoinAck, RoomSnapshot } from '@otto/shared';
import { socket } from './socket';

interface Session { code: string; seatId: string; token: string }

const SESSION_KEY = 'otto-session';

function loadSession(): Session | null {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null') as Session | null;
  } catch {
    return null;
  }
}

export interface RoomApi {
  snap: RoomSnapshot | null;
  seatId: string | null;
  error: string | null;
  createRoom: (nickname: string) => void;
  joinRoom: (code: string, nickname: string) => void;
  leave: () => void;
  setOptions: (opts: { mode?: GameMode; turnTimerSec?: number }) => void;
  start: () => void;
  chooseFormation: (formation: FormationId) => void;
  pick: (playerId: string, slotIndex: number) => void;
  wildcard: () => void;
  rematch: () => void;
}

export function useRoom(): RoomApi {
  const [snap, setSnap] = useState<RoomSnapshot | null>(null);
  const [seatId, setSeatId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAck = useCallback((ack: JoinAck): void => {
    if (!ack.ok) {
      setError(ack.error);
      return;
    }
    setSeatId(ack.seatId);
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      code: ack.code, seatId: ack.seatId, token: ack.token,
    } satisfies Session));
  }, []);

  useEffect(() => {
    const onState = (s: RoomSnapshot): void => setSnap(s);
    const onError = (message: string): void => {
      setError(message);
      window.setTimeout(() => setError(null), 4000);
    };
    socket.on('room:state', onState);
    socket.on('room:error', onError);
    // Resume after refresh/disconnect: token-only join reclaims the seat.
    const session = loadSession();
    if (session) {
      socket.emit('room:join',
        { code: session.code, nickname: '', token: session.token },
        (ack: JoinAck) => {
          if (ack.ok) setSeatId(ack.seatId);
          else localStorage.removeItem(SESSION_KEY);
        });
    }
    return () => {
      socket.off('room:state', onState);
      socket.off('room:error', onError);
    };
  }, []);

  return {
    snap, seatId, error,
    createRoom: (nickname) => socket.emit('room:create', { nickname }, handleAck),
    joinRoom: (code, nickname) => socket.emit('room:join', { code, nickname }, handleAck),
    leave: () => {
      localStorage.removeItem(SESSION_KEY);
      window.location.reload();
    },
    setOptions: (opts) => socket.emit('room:options', opts),
    start: () => socket.emit('room:start'),
    chooseFormation: (formation) => socket.emit('formation:choose', { formation }),
    pick: (playerId, slotIndex) => socket.emit('draft:pick', { playerId, slotIndex }),
    wildcard: () => socket.emit('draft:wildcard'),
    rematch: () => socket.emit('room:rematch'),
  };
}
```

- [ ] **Step 3: App shell and Home screen**

`client/src/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`client/src/App.tsx` (Lobby/FormationPick/Draft/Tournament are created in Tasks
10–12; until then, stub each as `export default function X() { return null; }`
in their final paths so this file compiles once and never changes):

```tsx
import Draft from './screens/Draft';
import FormationPick from './screens/FormationPick';
import Home from './screens/Home';
import Lobby from './screens/Lobby';
import Tournament from './screens/Tournament';
import { useRoom } from './useRoom';

export default function App() {
  const api = useRoom();
  const { snap, error } = api;
  return (
    <div className="app">
      {error && <div className="toast" role="alert">{error}</div>}
      {!snap && <Home api={api} />}
      {snap?.phase === 'lobby' && <Lobby api={api} snap={snap} />}
      {snap?.phase === 'formation' && <FormationPick api={api} snap={snap} />}
      {snap?.phase === 'draft' && <Draft api={api} snap={snap} />}
      {(snap?.phase === 'tournament' || snap?.phase === 'results') && (
        <Tournament api={api} snap={snap} />
      )}
    </div>
  );
}
```

`client/src/screens/Home.tsx`:

```tsx
import { useState } from 'react';
import { APP_NAME } from '@otto/shared';
import type { RoomApi } from '../useRoom';

export default function Home({ api }: { api: RoomApi }) {
  const [nickname, setNickname] = useState('');
  const [code, setCode] = useState('');
  const ready = nickname.trim().length > 0;
  return (
    <main className="home">
      <h1>{APP_NAME}</h1>
      <p className="tagline">
        Draft world cup legends against your friends. One player pool, one winner.
      </p>
      <label>
        Nickname
        <input
          data-testid="nickname" value={nickname} maxLength={20}
          placeholder="Your name"
          onChange={(e) => setNickname(e.target.value)}
        />
      </label>
      <div className="home-actions">
        <button data-testid="create" disabled={!ready}
          onClick={() => api.createRoom(nickname)}>
          Create room
        </button>
        <div className="join-row">
          <input
            data-testid="code" value={code} maxLength={5} placeholder="CODE"
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
          <button data-testid="join" disabled={!ready || code.length !== 5}
            onClick={() => api.joinRoom(code, nickname)}>
            Join
          </button>
        </div>
      </div>
    </main>
  );
}
```

`client/src/styles.css` — complete base theme (extend during Tasks 10–12, keep
the variables; final visual pass happens in Task 13 with frontend-design taste):

```css
:root {
  --bg: #0b1f12;
  --bg-card: #12301c;
  --line: #1f4a2c;
  --text: #eaf5ec;
  --text-dim: #9dbfa6;
  --accent: #ffd34d;        /* trophy gold */
  --accent-2: #4dd17a;      /* pitch green */
  --danger: #ff6b6b;
  --radius: 10px;
  font-family: 'Avenir Next', 'Segoe UI', system-ui, sans-serif;
}

* { box-sizing: border-box; }
body {
  margin: 0;
  background:
    radial-gradient(1200px 500px at 50% -10%, #1b4427 0%, var(--bg) 60%);
  color: var(--text);
  min-height: 100vh;
}
.app { max-width: 1100px; margin: 0 auto; padding: 24px 16px; }

h1 { font-size: 2.6rem; letter-spacing: 0.02em; margin: 0.4em 0 0.1em; }
h1, h2 { text-transform: uppercase; }
.tagline { color: var(--text-dim); margin-top: 0; }

button {
  background: var(--accent);
  border: none; color: #221a00; font-weight: 700;
  padding: 10px 18px; border-radius: var(--radius); cursor: pointer;
  transition: transform 0.06s ease, filter 0.15s ease;
}
button:hover:enabled { filter: brightness(1.08); transform: translateY(-1px); }
button:disabled { background: #3a4a3e; color: #79857c; cursor: not-allowed; }

input, select {
  background: var(--bg-card); color: var(--text);
  border: 1px solid var(--line); border-radius: var(--radius);
  padding: 10px 12px; font-size: 1rem;
}
label { display: flex; flex-direction: column; gap: 6px; margin: 12px 0; }

.toast {
  position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
  background: var(--danger); color: #fff; padding: 10px 20px;
  border-radius: var(--radius); z-index: 10;
}

.home { max-width: 420px; margin: 10vh auto 0; }
.home-actions { display: flex; flex-direction: column; gap: 12px; }
.join-row { display: flex; gap: 8px; }
.join-row input { width: 110px; text-transform: uppercase; letter-spacing: 0.2em; }

.code {
  background: var(--bg-card); border: 1px dashed var(--accent);
  padding: 2px 12px; border-radius: 6px; letter-spacing: 0.25em;
  color: var(--accent);
}
```

- [ ] **Step 4: Stub the remaining screens so the app compiles**

Create `client/src/screens/Lobby.tsx`, `FormationPick.tsx`, `Draft.tsx`,
`Tournament.tsx`, each temporarily:

```tsx
import type { RoomSnapshot } from '@otto/shared';
import type { RoomApi } from '../useRoom';

export default function Lobby(_props: { api: RoomApi; snap: RoomSnapshot }) {
  return null;
}
```

(adjust the function name per file — `FormationPick`, `Draft`, `Tournament`).

- [ ] **Step 5: Verify dev experience and build**

Run: `npm install && npm run build && npm run typecheck`
Expected: Vite build outputs to `server/public/`; no type errors.

Run: `npm run dev` briefly; open http://localhost:5173, enter a nickname,
click "Create room". Expected: no console errors; screen goes blank (Lobby is
a stub) — confirms the socket round-trip works since `snap.phase === 'lobby'`.
Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add client .gitignore package.json package-lock.json
git commit -m "feat(client): vite app shell, socket hook, home screen"
```

---

### Task 10: Lobby and FormationPick screens

**Files:**
- Modify: `client/src/screens/Lobby.tsx` (replace stub)
- Modify: `client/src/screens/FormationPick.tsx` (replace stub)
- Modify: `client/src/styles.css` (append)

- [ ] **Step 1: Lobby screen**

`client/src/screens/Lobby.tsx`:

```tsx
import type { GameMode, RoomSnapshot } from '@otto/shared';
import type { RoomApi } from '../useRoom';

export default function Lobby({ api, snap }: { api: RoomApi; snap: RoomSnapshot }) {
  const me = snap.seats.find((s) => s.id === api.seatId);
  const isHost = me?.isHost ?? false;
  return (
    <main className="lobby">
      <h2>Room <span className="code" data-testid="room-code">{snap.code}</span></h2>
      <p className="tagline">
        Share the code with your friends — {snap.seats.length}/8 joined.
      </p>
      <ul className="seats">
        {snap.seats.map((s) => (
          <li key={s.id} className={s.connected ? '' : 'offline'}>
            {s.nickname}
            {s.isHost && <em> · host</em>}
            {s.id === api.seatId && <em> · you</em>}
          </li>
        ))}
      </ul>
      <fieldset disabled={!isHost}>
        <legend>Match settings{isHost ? '' : ' (host decides)'}</legend>
        <label>
          Mode
          <select data-testid="mode" value={snap.mode}
            onChange={(e) => api.setOptions({ mode: e.target.value as GameMode })}>
            <option value="classic">Classic — ratings visible</option>
            <option value="memory">From memory — ratings hidden</option>
          </select>
        </label>
        <label>
          Turn timer
          <select data-testid="timer" value={snap.turnTimerSec}
            onChange={(e) => api.setOptions({ turnTimerSec: Number(e.target.value) })}>
            <option value={0}>Off</option>
            <option value={30}>30 seconds</option>
            <option value={60}>60 seconds</option>
          </select>
        </label>
      </fieldset>
      {isHost && (
        <button data-testid="start" disabled={snap.seats.length < 2} onClick={api.start}>
          Start draft
        </button>
      )}
    </main>
  );
}
```

- [ ] **Step 2: FormationPick screen**

`client/src/screens/FormationPick.tsx`:

```tsx
import type { Position, RoomSnapshot } from '@otto/shared';
import { FORMATION_IDS, FORMATIONS } from '@otto/shared';
import type { RoomApi } from '../useRoom';

const count = (id: (typeof FORMATION_IDS)[number], pos: Position): number =>
  FORMATIONS[id].filter((p) => p === pos).length;

export default function FormationPick({ api, snap }: { api: RoomApi; snap: RoomSnapshot }) {
  const me = snap.seats.find((s) => s.id === api.seatId);
  return (
    <main className="formation">
      <h2>Choose your formation</h2>
      <div className="formation-grid">
        {FORMATION_IDS.map((id) => (
          <button key={id} data-testid={`formation-${id}`}
            className={`formation-card ${me?.formation === id ? 'selected' : ''}`}
            onClick={() => api.chooseFormation(id)}>
            <strong>{id}</strong>
            <span>{count(id, 'DF')} DF · {count(id, 'MF')} MF · {count(id, 'FW')} FW</span>
          </button>
        ))}
      </div>
      <ul className="ready-list">
        {snap.seats.map((s) => (
          <li key={s.id}>
            {s.nickname}: {s.formation ? '✓ ready' : 'choosing…'}
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 3: Styles (append to `client/src/styles.css`)**

```css
.seats { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.seats li {
  background: var(--bg-card); border: 1px solid var(--line);
  border-radius: var(--radius); padding: 10px 14px;
}
.seats li.offline { opacity: 0.45; }
.seats em { color: var(--accent); font-style: normal; font-size: 0.85em; }
fieldset { border: 1px solid var(--line); border-radius: var(--radius); margin: 16px 0; }

.formation-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px; margin: 16px 0;
}
.formation-card {
  display: flex; flex-direction: column; gap: 4px; align-items: center;
  background: var(--bg-card); color: var(--text);
  border: 1px solid var(--line); padding: 16px 8px;
}
.formation-card span { color: var(--text-dim); font-weight: 400; font-size: 0.8rem; }
.formation-card.selected { border-color: var(--accent); color: var(--accent); }
.ready-list { list-style: none; padding: 0; color: var(--text-dim); }
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run build`
Expected: clean. Optionally `npm run dev` with two browser tabs: create + join
a room, change settings as host, start, both tabs reach the formation grid.

- [ ] **Step 5: Commit**

```bash
git add client/src
git commit -m "feat(client): lobby and formation pick screens"
```

---

### Task 11: Draft screen

**Files:**
- Create: `client/src/components/Pitch.tsx`, `client/src/components/SquadCard.tsx`
- Modify: `client/src/screens/Draft.tsx` (replace stub)
- Modify: `client/src/styles.css` (append)

- [ ] **Step 1: Pitch component**

`client/src/components/Pitch.tsx`:

```tsx
import type { Position, Slot } from '@otto/shared';

interface PitchProps {
  slots: Slot[];
  eligible?: number[]; // highlighted open slots for the pending pick
  onSlotClick?: (index: number) => void;
  compact?: boolean;
}

const ROWS: Position[] = ['FW', 'MF', 'DF', 'GK'];

export default function Pitch({ slots, eligible = [], onSlotClick, compact }: PitchProps) {
  return (
    <div className={`pitch ${compact ? 'compact' : ''}`}>
      {ROWS.map((row) => (
        <div className="pitch-row" key={row}>
          {slots
            .map((slot, index) => ({ slot, index }))
            .filter(({ slot }) => slot.position === row)
            .map(({ slot, index }) => {
              const canDrop = eligible.includes(index);
              return (
                <button key={index} data-testid={`slot-${index}`}
                  data-eligible={canDrop}
                  className={`slot ${slot.player ? 'filled' : 'empty'} ${canDrop ? 'eligible' : ''}`}
                  disabled={!canDrop || !onSlotClick}
                  onClick={() => onSlotClick?.(index)}>
                  <span className="pos">{slot.position}</span>
                  {slot.player ? (
                    <>
                      <span className="name">{slot.player.name}</span>
                      {slot.player.rating > 0 && (
                        <span className="rating">{slot.player.rating}</span>
                      )}
                    </>
                  ) : (
                    <span className="name dim">—</span>
                  )}
                </button>
              );
            })}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: SquadCard component**

`client/src/components/SquadCard.tsx`:

```tsx
import type { Position, SquadRoll } from '@otto/shared';

interface SquadCardProps {
  roll: SquadRoll;
  canPick: boolean;
  hasEligibleSlot: (pos: Position) => boolean;
  selectedId: string | null;
  onSelect: (playerId: string) => void;
}

export default function SquadCard({
  roll, canPick, hasEligibleSlot, selectedId, onSelect,
}: SquadCardProps) {
  return (
    <section className="squad-card">
      <h3 data-testid="squad-title">🎲 {roll.country} {roll.year}</h3>
      <ul>
        {roll.players.map((p) => {
          const enabled = canPick && hasEligibleSlot(p.position);
          return (
            <li key={p.id}>
              <button data-testid={`squad-player-${p.id}`} disabled={!enabled}
                className={`squad-player ${selectedId === p.id ? 'selected' : ''}`}
                onClick={() => onSelect(p.id)}>
                <span className="pos">{p.position}</span>
                <span className="name">{p.name}</span>
                {p.rating > 0 && <span className="rating">{p.rating}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
```

- [ ] **Step 3: Draft screen**

`client/src/screens/Draft.tsx`:

```tsx
import { useEffect, useState } from 'react';
import type { Position, RoomSnapshot } from '@otto/shared';
import { slotAccepts } from '@otto/shared';
import Pitch from '../components/Pitch';
import SquadCard from '../components/SquadCard';
import type { RoomApi } from '../useRoom';

function Countdown({ deadline }: { deadline: number }) {
  const [left, setLeft] = useState(deadline - Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setLeft(deadline - Date.now()), 250);
    return () => window.clearInterval(t);
  }, [deadline]);
  return <span className="countdown">⏱ {Math.max(0, Math.ceil(left / 1000))}s</span>;
}

export default function Draft({ api, snap }: { api: RoomApi; snap: RoomSnapshot }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const draft = snap.draft;
  const me = snap.seats.find((s) => s.id === api.seatId);

  useEffect(() => setSelectedId(null), [draft?.pickNumber]);

  if (!draft || !me) return null;
  const current = snap.seats.find((s) => s.id === draft.currentSeatId);
  const myTurn = draft.currentSeatId === api.seatId;
  const selected = draft.roll?.players.find((p) => p.id === selectedId) ?? null;

  const eligibleSlots = (pos: Position): number[] =>
    me.slots.flatMap((slot, i) =>
      !slot.player && slotAccepts(slot.position, pos) ? [i] : []);

  return (
    <main className="draft">
      <header className="draft-bar">
        <span data-testid={myTurn ? 'your-turn' : 'their-turn'}
          className={`turn ${myTurn ? 'me' : ''}`}>
          {myTurn ? 'Your pick!' : `${current?.nickname ?? '…'} is picking`}
        </span>
        <span data-testid="pick-counter">
          Pick {Math.min(draft.pickNumber + 1, draft.totalPicks)}/{draft.totalPicks}
        </span>
        {draft.deadline !== null && <Countdown deadline={draft.deadline} />}
        <button data-testid="wildcard" disabled={!myTurn || me.wildcardsLeft === 0}
          onClick={api.wildcard}>
          Wildcard ({me.wildcardsLeft})
        </button>
      </header>

      <div className="draft-main">
        {draft.roll && (
          <SquadCard roll={draft.roll} canPick={myTurn}
            hasEligibleSlot={(pos) => eligibleSlots(pos).length > 0}
            selectedId={selectedId} onSelect={setSelectedId} />
        )}
        <section className="my-team">
          <h3>Your XI · {me.formation}</h3>
          <p className="hint">
            {myTurn
              ? selected
                ? 'Now click a highlighted slot.'
                : 'Click a player from the rolled squad.'
              : 'Waiting for the other manager…'}
          </p>
          <Pitch slots={me.slots}
            eligible={myTurn && selected ? eligibleSlots(selected.position) : []}
            onSlotClick={(i) => {
              if (selected) {
                api.pick(selected.id, i);
                setSelectedId(null);
              }
            }} />
        </section>
      </div>

      <aside className="draft-side">
        <h4>Opponents</h4>
        {snap.seats.filter((s) => s.id !== me.id).map((s) => (
          <div key={s.id} className="opponent">
            <strong>{s.nickname}</strong>
            <span> {s.slots.filter((x) => x.player).length}/11</span>
            <Pitch slots={s.slots} compact />
          </div>
        ))}
        <h4>Pick log</h4>
        <ol className="log">
          {[...draft.log].reverse().slice(0, 12).map((e) => (
            <li key={e.pickNumber}>
              <strong>{e.nickname}</strong>: {e.player.name}
              {' '}({e.player.country} {e.player.year}){e.auto ? ' ⏱' : ''}
            </li>
          ))}
        </ol>
      </aside>
    </main>
  );
}
```

- [ ] **Step 4: Styles (append to `client/src/styles.css`)**

```css
.draft { display: grid; grid-template-columns: 1fr 280px; gap: 20px; }
.draft-bar {
  grid-column: 1 / -1; display: flex; align-items: center; gap: 18px;
  background: var(--bg-card); border: 1px solid var(--line);
  border-radius: var(--radius); padding: 10px 16px;
}
.turn { color: var(--text-dim); }
.turn.me { color: var(--accent); font-weight: 700; }
.countdown { color: var(--danger); font-variant-numeric: tabular-nums; }

.draft-main { display: grid; grid-template-columns: 300px 1fr; gap: 20px; }
.squad-card {
  background: var(--bg-card); border: 1px solid var(--line);
  border-radius: var(--radius); padding: 12px; align-self: start;
}
.squad-card ul { list-style: none; padding: 0; margin: 8px 0 0;
  display: flex; flex-direction: column; gap: 4px; max-height: 60vh; overflow-y: auto; }
.squad-player {
  display: grid; grid-template-columns: 36px 1fr auto; width: 100%;
  background: transparent; color: var(--text); text-align: left;
  border: 1px solid transparent; padding: 6px 8px;
}
.squad-player:hover:enabled { border-color: var(--accent); background: #1a3a24; }
.squad-player:disabled { background: transparent; color: #5d6f62; }
.squad-player.selected { border-color: var(--accent); color: var(--accent); }
.pos { color: var(--accent-2); font-weight: 700; font-size: 0.8em; }
.rating { font-weight: 700; color: var(--accent); }

.pitch {
  display: flex; flex-direction: column; gap: 14px;
  background:
    repeating-linear-gradient(0deg, #14381f 0 56px, #123320 56px 112px);
  border: 2px solid var(--line); border-radius: var(--radius); padding: 18px 10px;
}
.pitch-row { display: flex; justify-content: space-evenly; gap: 8px; }
.slot {
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  min-width: 84px; padding: 8px 6px;
  background: rgba(0, 0, 0, 0.35); color: var(--text);
  border: 1px dashed var(--line);
}
.slot.filled { border-style: solid; }
.slot.eligible { border-color: var(--accent); box-shadow: 0 0 12px #ffd34d66; }
.slot:disabled { cursor: default; opacity: 0.95; transform: none; }
.slot .name { font-size: 0.8rem; max-width: 90px; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap; }
.dim { color: var(--text-dim); }

.pitch.compact { gap: 6px; padding: 8px 4px; }
.pitch.compact .slot { min-width: 28px; padding: 3px; }
.pitch.compact .slot .name { display: none; }
.pitch.compact .slot .rating { display: none; }

.draft-side h4 { margin: 14px 0 6px; color: var(--text-dim); text-transform: uppercase; }
.opponent { margin-bottom: 10px; font-size: 0.9rem; }
.log { padding-left: 18px; color: var(--text-dim); font-size: 0.85rem; }
.log strong { color: var(--text); }
.hint { color: var(--text-dim); font-size: 0.9rem; }

@media (max-width: 900px) {
  .draft, .draft-main { grid-template-columns: 1fr; }
}
```

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npm run build`
Expected: clean. Then `npm run dev`, two tabs, play several picks end to end:
selecting a player highlights only eligible slots; wildcard rerolls; the
opponent tab updates live; the pick log fills.

- [ ] **Step 6: Commit**

```bash
git add client/src
git commit -m "feat(client): draft screen with pitch board and squad card"
```

---

### Task 12: Tournament and Results screens

**Files:**
- Create: `client/src/components/Standings.tsx`
- Modify: `client/src/screens/Tournament.tsx` (replace stub)
- Modify: `client/src/styles.css` (append)

- [ ] **Step 1: Standings component**

`client/src/components/Standings.tsx`:

```tsx
import type { StandingRow } from '@otto/shared';

interface StandingsProps {
  rows: StandingRow[];
  nameOf: (seatId: string) => string;
}

export default function Standings({ rows, nameOf }: StandingsProps) {
  return (
    <table className="standings">
      <thead>
        <tr>
          <th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th>
          <th>GF</th><th>GA</th><th>Pts</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.seatId}>
            <td>{nameOf(r.seatId)}</td>
            <td>{r.played}</td><td>{r.won}</td><td>{r.drawn}</td><td>{r.lost}</td>
            <td>{r.gf}</td><td>{r.ga}</td><td>{r.points}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 2: Tournament/Results screen**

`client/src/screens/Tournament.tsx`:

```tsx
import { useState } from 'react';
import type { MatchResult, RoomSnapshot } from '@otto/shared';
import Pitch from '../components/Pitch';
import Standings from '../components/Standings';
import type { RoomApi } from '../useRoom';

export default function Tournament({ api, snap }: { api: RoomApi; snap: RoomSnapshot }) {
  const [copied, setCopied] = useState(false);
  const t = snap.tournament;
  const me = snap.seats.find((s) => s.id === api.seatId);
  if (!t) return null;

  const name = (id: string): string =>
    snap.seats.find((s) => s.id === id)?.nickname ?? '?';
  const champion = t.championSeatId ? name(t.championSeatId) : null;
  const done = snap.phase === 'results';

  const scoreline = (m: MatchResult): string =>
    `${name(m.homeSeatId)} ${m.homeGoals}–${m.awayGoals} ${name(m.awaySeatId)}` +
    (m.penalties ? ` (${m.penalties.home}–${m.penalties.away} pens)` : '');

  const copyShareCard = (): void => {
    const lines = [
      `🏆 Otto a Zero — room ${snap.code}`,
      `Champion: ${champion ?? '?'}`,
      ...t.revealed.map((m) => (m.isFinal ? `FINAL · ${scoreline(m)}` : scoreline(m))),
    ];
    void navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <main className="tournament">
      <h2>{done ? 'Final results' : 'Tournament in progress…'}</h2>
      {champion && (
        <p className="champion" data-testid="champion">🏆 {champion} wins the room!</p>
      )}
      <section className="matches">
        {t.revealed.map((m, i) => (
          <p key={i} className={`match ${m.isFinal ? 'final-match' : ''}`}>
            {m.isFinal && <strong>FINAL · </strong>}{scoreline(m)}
          </p>
        ))}
        {!done && (
          <p className="hint">
            Revealing matches… {t.revealed.length}/{t.totalMatches}
          </p>
        )}
      </section>
      {snap.seats.length > 2 && <Standings rows={t.standings} nameOf={name} />}
      {done && (
        <>
          <section className="lineups">
            {snap.seats.map((s) => (
              <div key={s.id}>
                <h4>{s.nickname} · {s.formation}</h4>
                <Pitch slots={s.slots} compact />
              </div>
            ))}
          </section>
          <div className="results-actions">
            <button onClick={copyShareCard}>
              {copied ? 'Copied!' : 'Copy share card'}
            </button>
            {me?.isHost && (
              <button data-testid="rematch" onClick={api.rematch}>Rematch</button>
            )}
            <button onClick={api.leave}>Leave room</button>
          </div>
        </>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Styles (append to `client/src/styles.css`)**

```css
.champion {
  font-size: 1.5rem; color: var(--accent); font-weight: 800;
  border: 1px solid var(--accent); border-radius: var(--radius);
  padding: 12px 18px; display: inline-block;
  animation: pop 0.5s ease;
}
@keyframes pop { from { transform: scale(0.7); opacity: 0; } }

.matches { margin: 14px 0; }
.match {
  background: var(--bg-card); border: 1px solid var(--line);
  border-radius: var(--radius); padding: 10px 14px; margin: 6px 0;
  animation: slide-in 0.4s ease;
}
.match.final-match { border-color: var(--accent); }
@keyframes slide-in { from { transform: translateY(8px); opacity: 0; } }

.standings { border-collapse: collapse; width: 100%; max-width: 560px; }
.standings th, .standings td {
  border-bottom: 1px solid var(--line); padding: 8px 10px; text-align: center;
}
.standings td:first-child, .standings th:first-child { text-align: left; }

.lineups {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 14px; margin: 18px 0;
}
.results-actions { display: flex; gap: 10px; margin-top: 12px; }
```

- [ ] **Step 4: Verify a full game in the browser**

Run: `npm run dev`, two tabs, full game: lobby (set timer Off) → formations →
all 22 picks → matches reveal one by one → champion banner → copy share card →
rematch returns both tabs to formation pick.

- [ ] **Step 5: Commit**

```bash
git add client/src
git commit -m "feat(client): tournament reveal and results screens"
```

---

### Task 13: Production build + Playwright end-to-end smoke test

**Files:**
- Create: `playwright.config.ts`, `e2e/smoke.spec.ts`
- Modify: root `package.json` (add `@playwright/test` devDependency and `e2e` script)

- [ ] **Step 1: Install Playwright**

Run: `npm install -D @playwright/test && npx playwright install chromium`

Add to root `package.json` scripts:

```json
"e2e": "playwright test"
```

- [ ] **Step 2: Playwright config**

`playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 180_000,
  use: { baseURL: 'http://localhost:3001' },
  webServer: {
    command: 'npm run build && npm run start',
    port: 3001,
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
```

- [ ] **Step 3: Write the smoke test**

`e2e/smoke.spec.ts`:

```ts
import { expect, test, type Browser, type Page } from '@playwright/test';

async function newPlayer(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  return context.newPage();
}

test('two players complete a full game: draft, tournament, results', async ({ browser }) => {
  const host = await newPlayer(browser);
  const guest = await newPlayer(browser);

  // Home: create + join
  await host.goto('/');
  await host.getByTestId('nickname').fill('Ann');
  await host.getByTestId('create').click();
  const code = (await host.getByTestId('room-code').textContent())?.trim() ?? '';
  expect(code).toMatch(/^[A-Z]{5}$/);

  await guest.goto('/');
  await guest.getByTestId('nickname').fill('Bob');
  await guest.getByTestId('code').fill(code);
  await guest.getByTestId('join').click();

  // Lobby: disable the turn timer so the test controls every pick
  await host.getByTestId('timer').selectOption('0');
  await host.getByTestId('start').click();

  // Formations
  await host.getByTestId('formation-4-4-2').click();
  await guest.getByTestId('formation-4-3-3').click();

  // Draft: 22 exclusive picks, alternating per the snake order
  for (let pickNum = 0; pickNum < 22; pickNum++) {
    await expect(host.getByTestId('pick-counter'))
      .toHaveText(`Pick ${pickNum + 1}/22`);
    const active = (await host.getByTestId('your-turn').count()) > 0 ? host : guest;
    await expect(active.getByTestId('your-turn')).toBeVisible();
    await active.locator('[data-testid^="squad-player-"]:enabled').first().click();
    await active.locator('[data-eligible="true"]').first().click();
  }

  // Tournament reveals, then both clients see the champion
  await expect(host.getByTestId('champion')).toBeVisible({ timeout: 60_000 });
  await expect(guest.getByTestId('champion')).toBeVisible();

  // Host can trigger a rematch back to formation pick
  await host.getByTestId('rematch').click();
  await expect(host.getByTestId('formation-4-4-2')).toBeVisible();
  await expect(guest.getByTestId('formation-4-3-3')).toBeVisible();
});
```

- [ ] **Step 4: Run the full verification suite**

Run: `npm test && npm run typecheck && npm run build && npm run e2e`
Expected: all unit tests pass, typecheck clean, build outputs to
`server/public/`, Playwright smoke test passes.

- [ ] **Step 5: Visual polish pass**

Start `npm run start` (serves the production build on :3001). Using the
webapp-testing / web-design-reviewer approach, screenshot Home, Lobby, Draft,
and Results, and fix visual defects at the stylesheet level (alignment,
contrast, spacing, mobile at 390px width). The bar: a stranger should not
guess "default AI styling" — stadium-night palette, confident typography,
the pitch board reads as a pitch.

- [ ] **Step 6: README**

Create `README.md`: what the game is, `npm install`, `npm run dev` (dev),
`npm run build && npm start` (production, single process on :3001), how rooms
work (5-letter codes, no accounts, rooms expire), test commands
(`npm test`, `npm run e2e`), and a note crediting seteazero.wiki as the
inspiration for the game concept.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "test(e2e): full-game playwright smoke test; docs: readme"
```

---

## Verification checklist (run after all tasks)

1. `npm test` — all Vitest suites green (shared eligibility, data, draft,
   simulate, tournament, rooms, game).
2. `npm run typecheck` — zero errors in all three packages.
3. `npm run build && npm start` — production server serves the SPA on :3001.
4. `npm run e2e` — full 2-player game passes.
5. Manual: 3-tab game (3 players) reaches a round robin + final, standings
   render, champion declared — covers the >2-player tournament path the e2e
   test doesn't.
