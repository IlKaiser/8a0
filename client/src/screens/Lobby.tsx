import type { DraftMode, GameMode, RoomSnapshot } from '@otto/shared';
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
          Draft style
          <select data-testid="draft-mode" value={snap.draftMode}
            onChange={(e) => api.setOptions({ draftMode: e.target.value as DraftMode })}>
            <option value="free">Free pick — choose any role you still need</option>
            <option value="blind">Blind draft — a random role is imposed each turn</option>
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
