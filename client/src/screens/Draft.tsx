import { useEffect, useState } from 'react';
import type { Position, RoomSnapshot } from '@otto/shared';
import { slotAccepts, teamScores } from '@otto/shared';
import Pitch from '../components/Pitch';
import SquadCard from '../components/SquadCard';
import type { RoomApi } from '../useRoom';

const ROLE_NAMES: Record<Position, string> = {
  GK: 'GOALKEEPER', DF: 'DEFENDER', MF: 'MIDFIELDER', FW: 'FORWARD',
};

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

  const required = draft.requiredPosition;
  const eligibleSlots = (pos: Position): number[] =>
    me.slots.flatMap((slot, i) =>
      !slot.player && slotAccepts(slot.position, pos) ? [i] : []);
  const pickable = (pos: Position): boolean =>
    eligibleSlots(pos).length > 0 && (required === null || pos === required);

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

      {required && (
        <p className="required-role" data-testid="required-role">
          🎯 {myTurn
            ? `Blind draft: you must pick a ${ROLE_NAMES[required]}`
            : `${current?.nickname ?? '…'} must pick a ${ROLE_NAMES[required]}`}
        </p>
      )}

      <div className="draft-main">
        {draft.roll && (
          <SquadCard roll={draft.roll} canPick={myTurn}
            hasEligibleSlot={pickable}
            selectedId={selectedId} onSelect={setSelectedId} />
        )}
        <section className="my-team">
          <h3>
            Your XI · {me.formation}
            {snap.mode !== 'memory' && (
              <span className="team-str">
                ATT {teamScores(me.slots).attack.toFixed(1)} · DEF{' '}
                {teamScores(me.slots).defense.toFixed(1)}
              </span>
            )}
          </h3>
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
