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
