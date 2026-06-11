import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Player, Position } from '@otto/shared';

interface RawPlayer { name: string; position: Position; rating: number }
interface RawTeam { country: string; players: RawPlayer[] }
interface RawEdition { year: number; teams: RawTeam[] }
interface RawDataset { editions: RawEdition[] }

export interface Squad {
  year: number;
  country: string;
  players: Player[];
}

let cache: Squad[] | null = null;

export function loadSquads(): Squad[] {
  if (cache) return cache;
  const here = dirname(fileURLToPath(import.meta.url));
  const raw = JSON.parse(
    readFileSync(join(here, '..', 'data', 'squads.json'), 'utf8'),
  ) as RawDataset;
  cache = raw.editions.flatMap((ed) =>
    ed.teams.map((t) => ({
      year: ed.year,
      country: t.country,
      players: t.players.map((p, i) => ({
        ...p,
        id: `${ed.year}-${t.country}-${i}`,
        year: ed.year,
        country: t.country,
      })),
    })),
  );
  return cache;
}
