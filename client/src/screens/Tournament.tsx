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
