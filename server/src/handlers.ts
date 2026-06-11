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
