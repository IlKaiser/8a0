import type { Position, Slot } from '@otto/shared';

interface PitchProps {
  slots: Slot[];
  eligible?: number[]; // highlighted open slots for the pending pick
  onSlotClick?: (index: number) => void;
  compact?: boolean;
}

const ROWS: Position[] = ['FW', 'MF', 'DF', 'GK'];

export default function Pitch({ slots, eligible = [], onSlotClick, compact }: PitchProps) {
  return (
    <div className={`pitch ${compact ? 'compact' : ''}`}>
      {ROWS.map((row) => (
        <div className="pitch-row" key={row}>
          {slots
            .map((slot, index) => ({ slot, index }))
            .filter(({ slot }) => slot.position === row)
            .map(({ slot, index }) => {
              const canDrop = eligible.includes(index);
              return (
                <button key={index} data-testid={`slot-${index}`}
                  data-eligible={canDrop}
                  className={`slot ${slot.player ? 'filled' : 'empty'} ${canDrop ? 'eligible' : ''}`}
                  disabled={!canDrop || !onSlotClick}
                  onClick={() => onSlotClick?.(index)}>
                  <span className="pos">{slot.position}</span>
                  {slot.player ? (
                    <>
                      <span className="name">{slot.player.name}</span>
                      {slot.player.rating > 0 && (
                        <span className="rating">{slot.player.rating}</span>
                      )}
                    </>
                  ) : (
                    <span className="name dim">—</span>
                  )}
                </button>
              );
            })}
        </div>
      ))}
    </div>
  );
}
