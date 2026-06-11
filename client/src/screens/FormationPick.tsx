import type { Position, RoomSnapshot } from '@otto/shared';
import { FORMATION_IDS, FORMATIONS } from '@otto/shared';
import type { RoomApi } from '../useRoom';

const count = (id: (typeof FORMATION_IDS)[number], pos: Position): number =>
  FORMATIONS[id].filter((p) => p === pos).length;

export default function FormationPick({ api, snap }: { api: RoomApi; snap: RoomSnapshot }) {
  const me = snap.seats.find((s) => s.id === api.seatId);
  return (
    <main className="formation">
      <h2>Choose your formation</h2>
      <div className="formation-grid">
        {FORMATION_IDS.map((id) => (
          <button key={id} data-testid={`formation-${id}`}
            className={`formation-card ${me?.formation === id ? 'selected' : ''}`}
            onClick={() => api.chooseFormation(id)}>
            <strong>{id}</strong>
            <span>{count(id, 'DF')} DF · {count(id, 'MF')} MF · {count(id, 'FW')} FW</span>
          </button>
        ))}
      </div>
      <ul className="ready-list">
        {snap.seats.map((s) => (
          <li key={s.id}>
            {s.nickname}: {s.formation ? '✓ ready' : 'choosing…'}
          </li>
        ))}
      </ul>
    </main>
  );
}
