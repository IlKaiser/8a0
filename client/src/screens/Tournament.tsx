import { useEffect, useState } from 'react';
import type { MatchResult, RoomSnapshot } from '@otto/shared';
import Pitch from '../components/Pitch';
import Standings from '../components/Standings';
import type { RoomApi } from '../useRoom';

/** Match minute (0..90) derived from the server's playback start time. */
function useMatchClock(startedAt: number | null, durationMs: number): number {
  const [, force] = useState(0);
  useEffect(() => {
    if (startedAt === null) return;
    const t = window.setInterval(() => force((x) => x + 1), 200);
    return () => window.clearInterval(t);
  }, [startedAt]);
  if (startedAt === null) return 0;
  return Math.min(90, Math.floor(((Date.now() - startedAt) / durationMs) * 90));
}

interface LiveMatchProps {
  match: MatchResult;
  minute: number;
  nameOf: (seatId: string) => string;
  label?: string;
}

function LiveMatch({ match, minute, nameOf, label }: LiveMatchProps) {
  const seen = match.events.filter((e) => e.minute <= minute);
  const hg = seen.filter((e) => e.seatId === match.homeSeatId).length;
  const ag = seen.filter((e) => e.seatId === match.awaySeatId).length;
  const fullTime = minute >= 90;
  return (
    <section className="live-match" data-testid="live-match">
      <header className="live-head">
        {match.isFinal && <span className="final-tag">FINAL</span>}
        {label && <span className="final-tag">{label}</span>}
        <span className="live-minute">{fullTime ? 'FT' : `${minute}′`}</span>
      </header>
      <div className="live-score">
        <span className="team">{nameOf(match.homeSeatId)}</span>
        <span className="score">{hg} – {ag}</span>
        <span className="team">{nameOf(match.awaySeatId)}</span>
      </div>
      <ol className="goal-feed">
        {seen.map((e, i) => (
          <li key={i}>
            ⚽ {e.minute}′ <strong>{e.scorerName}</strong> <em>({nameOf(e.seatId)})</em>
          </li>
        ))}
      </ol>
      {fullTime && match.penalties && (
        <p className="pens">
          Penalty shootout: {match.penalties.home} – {match.penalties.away}
        </p>
      )}
    </section>
  );
}

export default function Tournament({ api, snap }: { api: RoomApi; snap: RoomSnapshot }) {
  const [copied, setCopied] = useState(false);
  const t = snap.tournament;
  const me = snap.seats.find((s) => s.id === api.seatId);
  const minute = useMatchClock(t?.playStartedAt ?? null, t?.playDurationMs ?? 1);
  if (!t) return null;

  const name = (id: string): string =>
    snap.seats.find((s) => s.id === id)?.nickname ?? '?';
  const champion = t.championSeatId ? name(t.championSeatId) : null;
  const done = snap.phase === 'results';
  const series = t.kind === 'series';

  const winnerOf = (m: MatchResult): string =>
    (m.penalties ? m.penalties.home > m.penalties.away : m.homeGoals > m.awayGoals)
      ? m.homeSeatId
      : m.awaySeatId;
  const seriesSides: [string, string] | null =
    series && (t.playing ?? t.revealed[0])
      ? [(t.playing ?? t.revealed[0])!.homeSeatId, (t.playing ?? t.revealed[0])!.awaySeatId]
      : null;
  const seriesWins = (id: string): number =>
    t.revealed.filter((m) => winnerOf(m) === id).length;

  const scoreline = (m: MatchResult): string =>
    `${name(m.homeSeatId)} ${m.homeGoals}–${m.awayGoals} ${name(m.awaySeatId)}` +
    (m.penalties ? ` (${m.penalties.home}–${m.penalties.away} pens)` : '');

  const scorers = (m: MatchResult): string =>
    m.events.map((e) => `${e.minute}′ ${e.scorerName}`).join(', ');

  const copyShareCard = (): void => {
    const lines = [
      `🏆 Otto a Zero — room ${snap.code}`,
      `Tua è la coppa, ${champion ?? '?'}!`,
      ...t.revealed.map((m) =>
        (m.isFinal ? `FINAL · ${scoreline(m)}` : scoreline(m)) +
        (m.events.length ? ` — ${scorers(m)}` : '')),
    ];
    void navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <main className="tournament">
      <h2>{series ? 'Best of 7' : done ? 'Final results' : 'Matchday'}</h2>
      {champion && (
        <p className="champion" data-testid="champion">🏆 Tua è la coppa, {champion}!</p>
      )}
      {seriesSides && (
        <p className="series-score" data-testid="series-score">
          {name(seriesSides[0])} <strong>{seriesWins(seriesSides[0])}</strong>
          {' – '}
          <strong>{seriesWins(seriesSides[1])}</strong> {name(seriesSides[1])}
          <em> · first to 4</em>
        </p>
      )}
      {t.playing && (
        <LiveMatch match={t.playing} minute={minute} nameOf={name}
          label={series ? `GAME ${t.revealed.length + 1}` : undefined} />
      )}
      <section className="matches">
        {t.revealed.map((m, i) => (
          <div key={i} className={`match ${m.isFinal ? 'final-match' : ''}`}>
            <p>
              {series && <strong>Game {i + 1} · </strong>}
              {m.isFinal && <strong>FINAL · </strong>}
              {scoreline(m)}
            </p>
            {m.events.length > 0 && <p className="scorers">⚽ {scorers(m)}</p>}
          </div>
        ))}
        {!done && !t.playing && t.revealed.length < t.totalMatches && (
          <p className="hint">Next match coming up… ({t.revealed.length}/{t.totalMatches})</p>
        )}
      </section>
      {!series && snap.seats.length > 2 && <Standings rows={t.standings} nameOf={name} />}
      {done && (
        <>
          <section className="lineups">
            {snap.seats.map((s) => (
              <div key={s.id}>
                <h4>{s.nickname} · {s.formation}</h4>
                <Pitch slots={s.slots} />
              </div>
            ))}
          </section>
          <div className="results-actions">
            <button onClick={copyShareCard}>
              {copied ? 'Copied!' : 'Copy share card'}
            </button>
            {me?.isHost && (
              <>
                <button data-testid="replay" onClick={api.replay}>
                  Replay (same teams)
                </button>
                <button data-testid="bestof7" onClick={api.bestOf7}>
                  Best of 7
                </button>
                <button data-testid="rematch" onClick={api.rematch}>
                  New draft
                </button>
              </>
            )}
            <button onClick={api.leave}>Leave room</button>
          </div>
        </>
      )}
    </main>
  );
}
