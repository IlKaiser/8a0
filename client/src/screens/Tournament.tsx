import { useEffect, useState } from 'react';
import type { MatchResult, RoomSnapshot, TeamScores } from '@otto/shared';
import { PEN_INTRO_MS, PEN_KICK_MS, teamScores } from '@otto/shared';
import Pitch from '../components/Pitch';
import Standings from '../components/Standings';
import type { RoomApi } from '../useRoom';

/** Milliseconds since the server started playing the current match. */
function useElapsed(startedAt: number | null): number {
  const [, force] = useState(0);
  useEffect(() => {
    if (startedAt === null) return;
    const t = window.setInterval(() => force((x) => x + 1), 150);
    return () => window.clearInterval(t);
  }, [startedAt]);
  return startedAt === null ? 0 : Math.max(0, Date.now() - startedAt);
}

const fmtStrength = (s: TeamScores): string =>
  `ATT ${s.attack.toFixed(1)} · DEF ${s.defense.toFixed(1)}`;

interface ShootoutProps {
  match: MatchResult;
  kicksShown: number; // interleaved: home kick 1, away kick 1, home kick 2, …
  nameOf: (seatId: string) => string;
}

function Shootout({ match, kicksShown, nameOf }: ShootoutProps) {
  const pens = match.penalties!;
  const visible = (side: 'home' | 'away'): boolean[] =>
    pens.kicks[side].slice(0, side === 'home' ? Math.ceil(kicksShown / 2) : Math.floor(kicksShown / 2));
  const total = pens.kicks.home.length + pens.kicks.away.length;
  const done = kicksShown >= total;
  return (
    <div className="shootout" data-testid="shootout">
      <p className="shootout-title">Penalty shootout</p>
      {(['home', 'away'] as const).map((side) => (
        <div key={side} className="pen-row">
          <span className="pen-name">
            {nameOf(side === 'home' ? match.homeSeatId : match.awaySeatId)}
          </span>
          <span className="pen-kicks">
            {visible(side).map((scored, i) => (
              <span key={i} className={`pen-dot ${scored ? 'scored' : 'missed'}`}>
                {scored ? '⚽' : '❌'}
              </span>
            ))}
          </span>
          <span className="pen-score">{visible(side).filter(Boolean).length}</span>
        </div>
      ))}
      {done && (
        <p className="pens">
          {nameOf(pens.home > pens.away ? match.homeSeatId : match.awaySeatId)} wins
          the shootout {pens.home} – {pens.away}!
        </p>
      )}
    </div>
  );
}

interface LiveMatchProps {
  match: MatchResult;
  elapsedMs: number;
  playDurationMs: number;
  nameOf: (seatId: string) => string;
  strengthOf: (seatId: string) => TeamScores | null;
  label?: string;
}

function LiveMatch({ match, elapsedMs, playDurationMs, nameOf, strengthOf, label }: LiveMatchProps) {
  const minute = Math.min(90, Math.floor((elapsedMs / playDurationMs) * 90));
  const fullTime = minute >= 90;
  const seen = match.events.filter((e) => e.minute <= minute);
  const hg = seen.filter((e) => e.seatId === match.homeSeatId).length;
  const ag = seen.filter((e) => e.seatId === match.awaySeatId).length;
  const kicksShown = match.penalties
    ? Math.max(0, Math.floor((elapsedMs - playDurationMs - PEN_INTRO_MS) / PEN_KICK_MS))
    : 0;
  const side = (id: string) => {
    const s = strengthOf(id);
    return (
      <span className="team">
        {nameOf(id)}
        {s && <small className="team-str">{fmtStrength(s)}</small>}
      </span>
    );
  };
  return (
    <section className="live-match" data-testid="live-match">
      <header className="live-head">
        {match.isFinal && <span className="final-tag">FINAL</span>}
        {label && <span className="final-tag">{label}</span>}
        <span className="live-minute">{fullTime ? 'FT' : `${minute}′`}</span>
      </header>
      <div className="live-score">
        {side(match.homeSeatId)}
        <span className="score">{hg} – {ag}</span>
        {side(match.awaySeatId)}
      </div>
      <ol className="goal-feed">
        {seen.map((e, i) => (
          <li key={i}>
            ⚽ {e.minute}′ <strong>{e.scorerName}</strong> <em>({nameOf(e.seatId)})</em>
          </li>
        ))}
      </ol>
      {fullTime && match.penalties && (
        <Shootout match={match} kicksShown={kicksShown} nameOf={nameOf} />
      )}
    </section>
  );
}

export default function Tournament({ api, snap }: { api: RoomApi; snap: RoomSnapshot }) {
  const [copied, setCopied] = useState(false);
  const t = snap.tournament;
  const me = snap.seats.find((s) => s.id === api.seatId);
  const elapsedMs = useElapsed(t?.playStartedAt ?? null);
  if (!t) return null;

  const strengthOf = (id: string): TeamScores | null => {
    const seat = snap.seats.find((s) => s.id === id);
    return seat ? teamScores(seat.slots) : null;
  };

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
        <LiveMatch match={t.playing} elapsedMs={elapsedMs}
          playDurationMs={t.playDurationMs} nameOf={name} strengthOf={strengthOf}
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
                <h4>
                  {s.nickname} · {s.formation}
                  <span className="team-str">{fmtStrength(teamScores(s.slots))}</span>
                </h4>
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
