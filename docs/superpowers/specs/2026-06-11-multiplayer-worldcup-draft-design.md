# Otto a Zero — Multiplayer World Cup Draft (Design Spec)

**Date:** 2026-06-11
**Status:** Approved by user
**Inspiration:** https://seteazero.wiki/ (solo draft + tournament simulator)

## Summary

A free, browser-based multiplayer game. Friends join a room, take turns drafting
players from historic World Cup squads into their own formation, then the drafted
teams play a simulated head-to-head tournament (using match logic modeled on
seteazero.wiki) to decide the room winner. No accounts, no database — ephemeral
rooms identified by a short code.

## Decisions (user-confirmed)

| Topic | Decision |
|---|---|
| Draft style | Turn-based with exclusive picks (a drafted player is removed from the global pool) |
| Winner logic | Head-to-head tournament between the room's drafted teams |
| Player data | Curated starter dataset (~12 editions, ~50–60 squads, hand-assigned ratings) |
| Identity | Ephemeral rooms + nicknames, no accounts |
| Architecture | Single Node.js server (Express + Socket.IO) serving a React/Vite SPA |

## Game flow

### 1. Home screen
- Enter a nickname.
- **Create room** → server generates a 5-letter room code, creator becomes host.
- **Join room** → enter code, join lobby if the room exists and the game has not started.

### 2. Lobby
- Shows joined players (2–8). Host controls:
  - **Game mode:** Classic (ratings visible) or From Memory (ratings hidden until the tournament).
  - **Turn timer:** off / 30s / 60s (default 60s).
  - **Start game** (enabled at ≥2 players).
- On start, every player privately selects one of 8 formations:
  4-3-3, 4-4-2, 4-2-3-1, 3-5-2, 3-4-3, 4-5-1, 5-3-2, 5-4-1.

### 3. Draft
- Turn order is randomized once, then proceeds in **snake order**
  (1…N, N…1, repeating) until each player has 11 players.
- On a turn:
  1. Server rolls a random (edition, national team) squad from the dataset and
     broadcasts it to the whole room.
  2. The active player picks one player from that squad whose position
     (GK/DF/MF/FW) fits an open slot in their formation. The pick is broadcast
     and the player is removed from the global pool.
  3. **Wildcards:** each player has 3; spending one rerolls the squad.
  4. **Free reroll:** if the rolled squad contains no eligible player for the
     active player's open slots, the server rerolls automatically at no cost.
  5. **Timeout:** if the turn timer expires, the server auto-picks the
     highest-rated eligible player from the current squad.
- Squads already rolled can come up again (only undrafted players shown).
- Draft UI: own lineup board (pitch view), opponents' boards (compact),
  current squad card, turn indicator, wildcard count, pick log.

### 4. Tournament
- **2 players:** a single grand final.
- **3–8 players:** single round robin (win 3 pts, draw 1, loss 0; tiebreakers:
  goal difference, goals scored, head-to-head, then coin flip), followed by a
  **grand final between #1 and #2**. The final cannot end level — penalties.
- Matches are simulated server-side and revealed sequentially to the room
  (short delay between matches for shared suspense).

### 5. Results
- Final standings, all scorelines, every team's full lineup.
- Copyable text share-card (standings + winner + lineups summary).
- Host can **rematch**: same room and players, pool reset, new draft.

## Match simulation

Modeled on seteazero.wiki's stated factors: squad overall quality, formation
balance, positional strength. All server-side.

- **Effective rating** per player = base rating − out-of-position penalty
  (e.g., −15 if a FW fills a DF slot, −8 for adjacent positions MF↔FW, MF↔DF;
  GK is never auto-assigned outfield and vice versa — eligibility already
  prevents GK mismatches).
- **Attack score** = weighted mean of FW (high weight), MF (medium), DF (low).
- **Defense score** = weighted mean of GK (high), DF (high), MF (medium).
- **Balance bonus** small bonus when all 11 slots are filled by natural-position
  players.
- **Expected goals** for side A ≈ scaled function of (A.attack − B.defense),
  clamped to a sane range (~0.3–3.5), sampled from a **Poisson** distribution
  per side. Stronger teams usually win; upsets are possible.
- **Penalty shootout** (final only): 5 rounds + sudden death; per-kick
  conversion probability biased by kicker rating vs. keeper rating.
- Simulation uses a seeded RNG so a match is reproducible from its seed
  (seed logged with results).

## Player dataset

`server/data/squads.json`, curated by hand:

```json
{
  "editions": [
    {
      "year": 1970,
      "host": "Mexico",
      "teams": [
        {
          "country": "Brazil",
          "players": [
            { "name": "Pelé", "position": "FW", "rating": 99 },
            { "name": "Carlos Alberto", "position": "DF", "rating": 92 }
          ]
        }
      ]
    }
  ]
}
```

- Positions: `GK | DF | MF | FW`.
- Target: ~12 editions (1970, 1974, 1982, 1986, 1990, 1994, 1998, 2002, 2006,
  2010, 2014, 2022), 4–6 iconic teams each, ≥18 players per squad
  → ~50–60 squads, ~1,000–1,300 players.
- Capacity check: worst case 8 players × 11 picks = 88 exclusive picks ≪ pool.
- Ratings hand-assigned on a 60–99 scale from historical reputation.
- Schema is additive: new editions/teams are appended without code changes.

## Architecture

```
shared/   types.ts        # domain types + Socket.IO event payload contracts
server/   index.ts        # Express + Socket.IO bootstrap, serves built SPA
          rooms.ts        # room registry, codes, join/leave, reconnect tokens,
                          # host migration, idle GC
          draft.ts        # turn engine: snake order, dice, eligibility,
                          # wildcards, timer, auto-pick
          simulate.ts     # match engine: scores, Poisson, penalties
          tournament.ts   # fixture scheduling, standings, final
          data/squads.json
client/   React + Vite + TypeScript SPA
          screens: Home, Lobby, FormationPick, Draft, Tournament, Results
```

- **Server-authoritative:** clients emit intents only (`createRoom`, `joinRoom`,
  `setOptions`, `chooseFormation`, `pick`, `wildcard`, `startGame`, `rematch`);
  the server validates every action against room state and broadcasts the new
  state. Clients never compute game outcomes.
- **State sync:** server broadcasts a sanitized room snapshot on every change
  (hiding ratings in From Memory mode); clients are render-only.
- **Reconnects:** on join, the server issues a player token stored in
  localStorage; a reconnecting socket presenting the token reclaims its seat.
  During a disconnected player's turn, the timer/auto-pick keeps the game moving.
- **Host migration:** if the host disconnects past a grace period, the
  longest-present player becomes host.
- **Room lifecycle:** in-memory `Map<code, Room>`; rooms are garbage-collected
  after 2h of inactivity or when empty. No persistence by design.
- **Single deployable:** `npm run build` builds the SPA into the server's
  static dir; one Node process serves everything (VPS / Fly.io / Railway).

## Error handling

- Invalid intents (not your turn, ineligible player, no wildcards left, room
  full, game already started, unknown code) → rejected with a typed error
  event; client shows a toast.
- Socket disconnect mid-draft → seat held, timer enforces progress.
- Room not found / expired → client redirected to Home with a message.
- Server restart loses rooms (accepted trade-off; ephemeral by design).

## Testing

- **Vitest** unit tests on pure logic: snake-order generation, pick
  eligibility, wildcard accounting, auto-pick choice, pool exclusivity,
  team scoring, Poisson-based simulator sanity (stronger team wins majority
  over N seeds), round-robin scheduling, standings tiebreakers, dataset
  schema validation (positions valid, squads ≥18 players, ratings in range).
- **Playwright** smoke test (webapp-testing): two browser contexts complete a
  full 2-player game: create → join → formations → full draft → final →
  results visible in both.

## Out of scope (v1)

- Accounts, persistence, match history.
- Spectator mode, in-room chat.
- Image-rendered share cards (text card only).
- Mobile-native apps (responsive web only).
- Full historical dataset (1930–2026 all teams).
