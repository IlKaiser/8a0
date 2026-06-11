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
  ({ squads: testSquads(), broadcast: vi.fn(), playMs: 5, gapMs: 2, ...over });

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

function draftToCompletion(room: ReturnType<typeof createRoom>['room'], deps: game.GameDeps): void {
  let guard = 0;
  while (room.phase === 'draft' && guard++ < 30) {
    const d = room.draft!;
    const seatId = d.order[d.pickNumber];
    const seat = room.seats.find((s) => s.id === seatId)!;
    const pick = autoPick(d.roll!.players, seat.slots)!;
    game.handlePick(room, seatId, pick.playerId, pick.slotIndex, deps);
  }
}

describe('game flow', () => {
  it('runs lobby -> formation -> draft -> tournament -> results for 2 players', () => {
    const deps = depsWith();
    const { room } = setupDraft(deps);
    expect(room.phase).toBe('draft');
    expect(room.draft!.order).toHaveLength(22);

    draftToCompletion(room, deps);
    expect(room.phase).toBe('tournament');
    expect(room.tournament!.matches).toHaveLength(1); // 2 players -> final only
    expect(room.seats.every((s) => s.slots.every((sl) => sl.player !== null))).toBe(true);

    vi.advanceTimersByTime(60_000);
    expect(room.phase).toBe('results');
    expect(room.tournament!.championSeatId).toBeTruthy();
  });

  it('rejects picks out of turn', () => {
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
    seat.wildcardsLeft = 0;
    expect(() => game.handleWildcard(room, seat.id, deps)).toThrow(/wildcard/i);
  });

  it('turn timer auto-picks for an absent player', () => {
    const deps = depsWith();
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
  });

  it('replay keeps the drafted teams and plays a fresh tournament', () => {
    const deps = depsWith();
    const { room, host, guest } = setupDraft(deps);
    draftToCompletion(room, deps);
    vi.advanceTimersByTime(60_000);
    expect(room.phase).toBe('results');
    const teamsBefore = room.seats.map((s) => s.slots.map((sl) => sl.player!.id).join(','));

    expect(() => game.replaySameTeams(room, guest.id, deps)).toThrow(/host/);
    game.replaySameTeams(room, host.id, deps);
    expect(room.phase).toBe('tournament');
    expect(room.tournament!.kind).toBe('cup');
    expect(room.seats.map((s) => s.slots.map((sl) => sl.player!.id).join(',')))
      .toEqual(teamsBefore);
    vi.advanceTimersByTime(60_000);
    expect(room.phase).toBe('results');
    expect(room.tournament!.championSeatId).toBeTruthy();
  });

  it('best of 7: finalists play until one reaches 4 wins, who becomes champion', () => {
    const deps = depsWith();
    const { room, host, guest } = setupDraft(deps);
    draftToCompletion(room, deps);
    vi.advanceTimersByTime(60_000);
    expect(room.phase).toBe('results');

    expect(() => game.startBestOf7(room, guest.id, deps)).toThrow(/host/);
    game.startBestOf7(room, host.id, deps);
    expect(room.tournament!.kind).toBe('series');
    const matches = room.tournament!.matches;
    expect(matches.length).toBeGreaterThanOrEqual(4);
    expect(matches.length).toBeLessThanOrEqual(7);

    const wins: Record<string, number> = {};
    for (const m of matches) {
      const w = game.matchWinner(m);
      wins[w] = (wins[w] ?? 0) + 1;
    }
    expect(Math.max(...Object.values(wins))).toBe(4); // clinched, then stopped
    const clincher = game.matchWinner(matches[matches.length - 1]);
    expect(wins[clincher]).toBe(4);

    vi.advanceTimersByTime(300_000); // play out all games incl. shootout time
    expect(room.phase).toBe('results');
    expect(room.tournament!.championSeatId).toBe(clincher);
  });

  it('blind draft imposes a random open role and rejects other positions', () => {
    const deps = depsWith();
    const { room, seat: host } = createRoom('eve', 77);
    const fred = joinRoom(room, 'fred');
    game.setOptions(room, host.id, { draftMode: 'blind', turnTimerSec: 0 });
    game.startGame(room, host.id);
    game.chooseFormation(room, host.id, '4-4-2', deps);
    game.chooseFormation(room, fred.id, '4-3-3', deps);
    expect(room.phase).toBe('draft');

    let guard = 0;
    while (room.phase === 'draft' && guard++ < 30) {
      const d = room.draft!;
      const required = d.requiredPosition!;
      expect(required).toBeTruthy();
      const seat = room.seats.find((s) => s.id === d.order[d.pickNumber])!;
      // the imposed role is one of the seat's open positions
      expect(seat.slots.some((s) => !s.player && s.position === required)).toBe(true);
      // the rolled squad always offers at least one player of that role
      const legal = d.roll!.players.filter((p) => p.position === required);
      expect(legal.length).toBeGreaterThan(0);
      // picking any other position is rejected
      const wrong = d.roll!.players.find((p) => p.position !== required);
      if (wrong) {
        expect(() =>
          game.handlePick(room, seat.id, wrong.id, 0, deps),
        ).toThrow(/blind draft|not eligible/);
      }
      const pick = autoPick(legal, seat.slots)!;
      game.handlePick(room, seat.id, pick.playerId, pick.slotIndex, deps);
    }
    expect(room.phase).toBe('tournament');
    expect(room.seats.every((s) => s.slots.every((sl) =>
      sl.player !== null && sl.player.position === sl.position))).toBe(true);
  });

  it('rematch resets to formation phase with full wildcards and empty boards', () => {
    const deps = depsWith();
    const { room, host } = setupDraft(deps);
    draftToCompletion(room, deps);
    vi.advanceTimersByTime(60_000);
    expect(room.phase).toBe('results');
    game.rematch(room, host.id, deps);
    expect(room.phase).toBe('formation');
    expect(room.seats.every((s) => s.formation === null && s.slots.length === 0)).toBe(true);
    expect(room.seats.every((s) => s.wildcardsLeft === 3)).toBe(true);
  });
});
