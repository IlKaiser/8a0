import type { StandingRow } from '@otto/shared';

interface StandingsProps {
  rows: StandingRow[];
  nameOf: (seatId: string) => string;
}

export default function Standings({ rows, nameOf }: StandingsProps) {
  return (
    <table className="standings">
      <thead>
        <tr>
          <th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th>
          <th>GF</th><th>GA</th><th>Pts</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.seatId}>
            <td>{nameOf(r.seatId)}</td>
            <td>{r.played}</td><td>{r.won}</td><td>{r.drawn}</td><td>{r.lost}</td>
            <td>{r.gf}</td><td>{r.ga}</td><td>{r.points}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
