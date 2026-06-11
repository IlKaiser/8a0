import type { Position, SquadRoll } from '@otto/shared';

interface SquadCardProps {
  roll: SquadRoll;
  canPick: boolean;
  hasEligibleSlot: (pos: Position) => boolean;
  selectedId: string | null;
  onSelect: (playerId: string) => void;
}

export default function SquadCard({
  roll, canPick, hasEligibleSlot, selectedId, onSelect,
}: SquadCardProps) {
  return (
    <section className="squad-card">
      <h3 data-testid="squad-title">🎲 {roll.country} {roll.year}</h3>
      <ul>
        {roll.players.map((p) => {
          const enabled = canPick && hasEligibleSlot(p.position);
          return (
            <li key={p.id}>
              <button data-testid={`squad-player-${p.id}`} disabled={!enabled}
                className={`squad-player ${selectedId === p.id ? 'selected' : ''}`}
                onClick={() => onSelect(p.id)}>
                <span className="pos">{p.position}</span>
                <span className="name">{p.name}</span>
                {p.rating > 0 && <span className="rating">{p.rating}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
