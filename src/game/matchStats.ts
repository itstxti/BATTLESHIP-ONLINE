import { Board, type ShotRecord } from './Board';

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

  /** Longest run of consecutive hits among the local player's shots. */
  longestStreak: number;

  /** The opponent's shots at the local player's fleet. */
  enemyShots: number;

  /** Opponent shots that hit one of the local player's ships. */
  enemyHits: number;

  /** Percentage in the 0-100 range. 0 when the opponent never fired. */
  enemyAccuracy: number;

  /** Local player's ships the opponent destroyed (the opponent's "ships sunk"). */
  enemyShipsSunk: number;

  /** Longest run of consecutive hits among the opponent's shots. */
  enemyLongestStreak: number;

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
 * The opponent's side is derived the same way from the player's own board,
 * which receives the opponent's shots in every mode.
 *
 * Boards are created per match, so the numbers can never leak from a
 * previous game, and there is no parallel counter that could drift out of
 * sync with what the player sees on screen. The one thing the grid cannot
 * tell is the ORDER of shots, so boards keep an ordered shot log
 * (`getShotHistory`) from which the hit streak is read.
 */
export function computeMatchStats(
  enemyBoard: Board,
  durationMs: number,
  playerBoard: Board = new Board()
): MatchStats {
  const { hits, misses } = tallyShots(enemyBoard);
  const incoming = tallyShots(playerBoard);

  const shots = hits + misses;
  const enemyShots = incoming.hits + incoming.misses;

  return {
    shots,
    hits,
    accuracy: shots === 0 ? 0 : (hits / shots) * 100,
    shipsSunk: countSunk(enemyBoard),
    longestStreak: longestHitStreak(enemyBoard.getShotHistory()),
    enemyShots,
    enemyHits: incoming.hits,
    enemyAccuracy:
      enemyShots === 0 ? 0 : (incoming.hits / enemyShots) * 100,
    enemyShipsSunk: countSunk(playerBoard),
    enemyLongestStreak: longestHitStreak(playerBoard.getShotHistory()),
    durationMs: Math.max(0, durationMs)
  };
}

/**
 * Looks at the same match from the other side: the opponent's numbers become
 * the "player" ones and vice versa. Used by Local mode, where the stats are
 * computed from the winner's seat but must always be shown as Player 1 / Player 2.
 */
export function swapPerspective(stats: MatchStats): MatchStats {
  return {
    shots: stats.enemyShots,
    hits: stats.enemyHits,
    accuracy: stats.enemyAccuracy,
    shipsSunk: stats.enemyShipsSunk,
    longestStreak: stats.enemyLongestStreak,
    enemyShots: stats.shots,
    enemyHits: stats.hits,
    enemyAccuracy: stats.accuracy,
    enemyShipsSunk: stats.shipsSunk,
    enemyLongestStreak: stats.longestStreak,
    durationMs: stats.durationMs
  };
}

/** Hits and misses currently marked on a board. */
function tallyShots(board: Board): { hits: number; misses: number } {
  let hits = 0;
  let misses = 0;

  for (let row = 0; row < board.size; row++) {
    for (let column = 0; column < board.size; column++) {
      const cell = board.getCell(row, column);

      if (cell === 'hit') {
        hits++;
      } else if (cell === 'miss') {
        misses++;
      }
    }
  }

  return { hits, misses };
}

function countSunk(board: Board): number {
  return board.getShips().filter((ship) => ship.isSunk()).length;
}

/** The longest run of consecutive hits in a shot log. */
export function longestHitStreak(history: readonly ShotRecord[]): number {
  let longest = 0;
  let current = 0;

  for (const shot of history) {
    current = shot.result === 'hit' ? current + 1 : 0;

    longest = Math.max(longest, current);
  }

  return longest;
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

export type StatRow = {
  value: string;

  /** Reads naturally after the value: "17 shots", "1 hit in a row". */
  label: string;

  /** 0-100. When present the row is drawn with a progress bar. */
  meter?: number;
};

/** Who each column of the results belongs to. */
export type StatNames = {
  /** The local player: "You" in Solo/Online, "Player 1" in Local. */
  player: string;

  /** The other side: "Enemy" in Solo/Online, "Player 2" in Local. */
  opponent: string;
};

export const DEFAULT_STAT_NAMES: StatNames = {
  player: 'You',
  opponent: 'Enemy'
};

export type StatGroup = {
  id: 'attack' | 'defense' | 'match';
  title: string;
  rows: StatRow[];
};

const clampPercent = (value: number): number =>
  Math.max(0, Math.min(100, value));

/** The stat rows, grouped and in display order, with singular/plural labels. */
export function describeStatGroups(
  stats: MatchStats,
  names: StatNames = DEFAULT_STAT_NAMES
): StatGroup[] {
  const plural = (count: number, singular: string, many: string): string =>
    count === 1 ? singular : many;

  return [
    {
      id: 'attack',
      title: names.player,
      rows: [
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
          label: 'accuracy',
          meter: clampPercent(stats.accuracy)
        },
        {
          value: String(stats.shipsSunk),
          label: plural(stats.shipsSunk, 'ship sunk', 'ships sunk')
        },
        {
          value: String(stats.longestStreak),
          label: plural(
            stats.longestStreak,
            'hit in a row',
            'hits in a row'
          )
        }
      ]
    },
    {
      id: 'defense',
      title: names.opponent,
      rows: [
        {
          value: String(stats.enemyShots),
          label: plural(stats.enemyShots, 'shot', 'shots')
        },
        {
          value: String(stats.enemyHits),
          label: plural(stats.enemyHits, 'hit', 'hits')
        },
        {
          value: formatAccuracy(stats.enemyAccuracy),
          label: 'accuracy',
          meter: clampPercent(stats.enemyAccuracy)
        },
        {
          value: String(stats.enemyShipsSunk),
          label: plural(stats.enemyShipsSunk, 'ship sunk', 'ships sunk')
        },
        {
          value: String(stats.enemyLongestStreak),
          label: plural(
            stats.enemyLongestStreak,
            'hit in a row',
            'hits in a row'
          )
        }
      ]
    },
    {
      id: 'match',
      title: 'Match duration',
      rows: [
        {
          value: formatDuration(stats.durationMs),
          label: ''
        }
      ]
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
