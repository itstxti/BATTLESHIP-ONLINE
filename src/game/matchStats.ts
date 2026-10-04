import type { Board } from './Board';

export type MatchOutcome = 'victory' | 'defeat';

export type MatchStats = {
  /** Shots fired by the local player. */
  shots: number;

  /** Shots that hit an enemy ship. */
  hits: number;

  /** Percentage in the 0-100 range. 0 when no shots were fired. */
  accuracy: number;

  /** Enemy ships destroyed by the local player. */
  shipsSunk: number;

  durationMs: number;
};

/**
 * Derives the local player's offensive stats from the enemy board.
 *
 * The enemy board is the single source of truth in every mode:
 *  - Solo: it is the real enemy fleet, shot directly.
 *  - Local / Online: it is the fog-of-war tracking board, filled only
 *    from the defender's replies (`recordShot` / `markSunk`).
 *
 * Boards are created per match, so the numbers can never leak from a
 * previous game, and there is no parallel counter that could drift out of
 * sync with what the player sees on screen.
 */
export function computeMatchStats(
  enemyBoard: Board,
  durationMs: number
): MatchStats {
  let hits = 0;
  let misses = 0;

  for (let row = 0; row < enemyBoard.size; row++) {
    for (let column = 0; column < enemyBoard.size; column++) {
      const cell = enemyBoard.getCell(row, column);

      if (cell === 'hit') {
        hits++;
      } else if (cell === 'miss') {
        misses++;
      }
    }
  }

  const shots = hits + misses;

  return {
    shots,
    hits,
    accuracy: shots === 0 ? 0 : (hits / shots) * 100,
    shipsSunk: enemyBoard
      .getShips()
      .filter((ship) => ship.isSunk()).length,
    durationMs: Math.max(0, durationMs)
  };
}

/** "52.9%". One decimal place, always. */
export function formatAccuracy(accuracy: number): string {
  return `${accuracy.toFixed(1)}%`;
}

/** "02:43", or "1:02:43" for matches that last an hour or more. */
export function formatDuration(durationMs: number): string {
  const totalSeconds = Math.floor(Math.max(0, durationMs) / 1000);

  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);

  const pad = (value: number): string => String(value).padStart(2, '0');

  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
}

/** The label for each stat row, e.g. "1 shot" vs "17 shots". */
export function describeStats(stats: MatchStats): {
  value: string;
  label: string;
}[] {
  const plural = (count: number, singular: string, many: string): string =>
    count === 1 ? singular : many;

  return [
    {
      value: String(stats.shots),
      label: plural(stats.shots, 'shot', 'shots')
    },
    {
      value: String(stats.hits),
      label: plural(stats.hits, 'hit', 'hits')
    },
    {
      value: formatAccuracy(stats.accuracy),
      label: 'accuracy'
    },
    {
      value: String(stats.shipsSunk),
      label: plural(stats.shipsSunk, 'ship sunk', 'ships sunk')
    },
    {
      value: formatDuration(stats.durationMs),
      label: 'duration'
    }
  ];
}

/* ------------------------------ match clock ------------------------------ */

/**
 * The only new state this feature needs: when the battle phase began and
 * ended. Kept on GameState (not module-level) so each match owns its clock.
 */
export type MatchClock = {
  battleStartedAt: number | null;
  battleEndedAt: number | null;
};

/** Monotonic: immune to system clock changes mid-match. */
const now = (): number => performance.now();

/** Idempotent: the first call wins. */
export function startMatchClock(clock: MatchClock): void {
  clock.battleStartedAt ??= now();
}

/** Idempotent: the first call wins, so late callers cannot inflate the time. */
export function stopMatchClock(clock: MatchClock): void {
  if (clock.battleStartedAt !== null) {
    clock.battleEndedAt ??= now();
  }
}

/** True once a battle actually started, i.e. there is a match to summarise. */
export function hasMatchStarted(clock: MatchClock): boolean {
  return clock.battleStartedAt !== null;
}

export function getMatchDurationMs(clock: MatchClock): number {
  if (clock.battleStartedAt === null) {
    return 0;
  }

  return (clock.battleEndedAt ?? now()) - clock.battleStartedAt;
}
