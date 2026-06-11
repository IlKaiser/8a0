# Otto a Zero ⚽

A free, browser-based **multiplayer World Cup draft game**. Friends join a room,
take turns drafting players from historic World Cup squads (1970–2022) into
their own formation, then the drafted teams play a simulated head-to-head
tournament to decide who wins the room.

Game concept inspired by [Sete a Zero](https://seteazero.wiki/) — this project
adds multiplayer rooms, exclusive draft picks, and head-to-head simulation.

## How a game works

1. **Create a room** — you get a 5-letter code. Friends join with the code and
   a nickname. No accounts, no signup; rooms live in memory and expire after
   ~2 hours of inactivity.
2. **Lobby** — the host picks the mode (*Classic* shows player ratings,
   *From Memory* hides them until the tournament) and the turn timer
   (off / 30s / 60s). 2–8 players.
3. **Formations** — each player picks one of 8 formations (4-3-3, 4-4-2, …).
4. **Draft** — snake order. On your turn a dice rolls a random national team
   from a World Cup edition; you pick one player to fill a slot **of his exact
   position** (no striker in midfield). Picks are **exclusive**: a drafted
   player is gone for everyone. You get 3 wildcards to reroll, ineligible
   squads reroll free, and the timer auto-picks for AFK players.
5. **Tournament** — with 2 players it's a single grand final; with 3–8 it's a
   full round robin followed by a final between the top two. Every match plays
   out **live**: the clock ticks through 90 minutes (~20 seconds real time)
   and goals drop in with the minute and the scorer's name. A match level
   after 90' goes straight to a **penalty shootout** — there are no draws, and
   a shootout win counts as a win in the standings. Results come from a seeded
   simulation of squad quality and positional strength (Poisson goals).
6. **Results** — standings, every scoreline with scorers, all lineups, and a
   copyable share card. The host can then **replay with the same teams**,
   settle it with a **best-of-7 series** between the finalists (first to 4
   wins), or start a **new draft** from scratch.

## Running it

```bash
npm install

# development (server on :3001, Vite client on :5173)
npm run dev

# production: build the SPA into the server, run a single process on :3001
npm run build
npm start
```

To play with friends, deploy the production build anywhere that runs Node
(Fly.io, Railway, a VPS) — it's one process, no database — or expose your
local port with a tunnel.

## Tests

```bash
npm test           # vitest unit suites (draft, simulator, tournament, rooms, game)
npm run typecheck  # strict TS across all three workspaces
npm run e2e        # playwright: two browsers play a complete game
```

## Project layout

```
shared/   domain types, formations, eligibility rules, socket contracts
server/   express + socket.io; pure game logic modules + thin socket layer
          data/squads.json — curated dataset: 12 editions, 60 squads, ~1000 players
client/   react + vite SPA (home, lobby, formation, draft, tournament screens)
e2e/      playwright smoke test
```

The server is authoritative: clients only send intents (`pick`, `wildcard`, …)
and render the sanitized room snapshots the server broadcasts, so editing the
page can't cheat the draft.
