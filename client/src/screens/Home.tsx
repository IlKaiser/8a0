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
