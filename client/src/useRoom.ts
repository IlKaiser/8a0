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
  replay: () => void;
  bestOf7: () => void;
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
    replay: () => socket.emit('room:replay'),
    bestOf7: () => socket.emit('room:bestof7'),
  };
}
