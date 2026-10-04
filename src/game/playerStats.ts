import type { MatchOutcome, MatchStats } from './matchStats';
import type { AIDifficulty, GameMode } from './types';

/*
 * Persistent player statistics.
 *
 * Only the BASE counters are stored. Win rate and accuracy are always derived
 * from them (see `deriveStats`), so the data cannot contradict itself.
 *
 * Local Multiplayer is deliberately never recorded: several people share the
 * device, so there is no stable player identity to attribute the numbers to.
 */

export const STATS_STORAGE_KEY = 'battleship.stats.v1';

export const STATS_VERSION = 1;

export const AI_DIFFICULTIES: readonly AIDifficulty[] = [
  'easy',
  'medium',
  'hard'
];

/** The six values that are actually persisted for every bucket. */
export type BaseStats = {
  matches: number;
  wins: number;
  losses: number;
  shots: number;
  hits: number;
  shipsSunk: number;
};

/** The eight values shown to the player: the base counters plus two ratios. */
export type DerivedStats = BaseStats & {
  /** Percentage in the 0-100 range. 0 when no match was played. */
  winRate: number;

  /** Percentage in the 0-100 range. 0 when no shot was fired. */
  accuracy: number;
};

/**
 * What is saved in localStorage. To track something new later, add a field to
 * `BaseStats` (it is read defensively, so old saves load as 0) or a new bucket
 * here, and bump `STATS_VERSION` only if the shape changes incompatibly.
 */
export type PlayerStats = {
  version: typeof STATS_VERSION;
  ai: Record<AIDifficulty, BaseStats>;
  online: BaseStats;
};

/** Which slice of the data a view shows. */
export type StatsScope =
  | { section: 'global' }
  | { section: 'online' }
  | { section: 'ai'; difficulty: AIDifficulty | 'all' };

const BASE_KEYS: readonly (keyof BaseStats)[] = [
  'matches',
  'wins',
  'losses',
  'shots',
  'hits',
  'shipsSunk'
];

export function emptyBaseStats(): BaseStats {
  return {
    matches: 0,
    wins: 0,
    losses: 0,
    shots: 0,
    hits: 0,
    shipsSunk: 0
  };
}

export function emptyPlayerStats(): PlayerStats {
  return {
    version: STATS_VERSION,
    ai: {
      easy: emptyBaseStats(),
      medium: emptyBaseStats(),
      hard: emptyBaseStats()
    },
    online: emptyBaseStats()
  };
}

/* ------------------------------- storage -------------------------------- */

/** localStorage can be missing or throw (private mode, quota, sandboxed iframes). */
function defaultStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** A counter must be a finite, non-negative whole number; anything else is 0. */
function toCounter(value: unknown): number {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0
    ? Math.floor(value)
    : 0;
}

function readBase(value: unknown): BaseStats {
  const source =
    typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)
      : {};

  const base = emptyBaseStats();

  for (const key of BASE_KEYS) {
    base[key] = toCounter(source[key]);
  }

  return base;
}

/**
 * Corrupt, foreign or missing data yields zeroed stats, never a throw.
 * Individual bad fields are zeroed on their own so one broken value does not
 * wipe the rest of the player's history.
 */
export function loadPlayerStats(
  storage: Storage | null = defaultStorage()
): PlayerStats {
  if (!storage) {
    return emptyPlayerStats();
  }

  try {
    const raw = storage.getItem(STATS_STORAGE_KEY);

    if (!raw) {
      return emptyPlayerStats();
    }

    const parsed: unknown = JSON.parse(raw);

    if (typeof parsed !== 'object' || parsed === null) {
      return emptyPlayerStats();
    }

    const data = parsed as Record<string, unknown>;

    const ai =
      typeof data.ai === 'object' && data.ai !== null
        ? (data.ai as Record<string, unknown>)
        : {};

    return {
      version: STATS_VERSION,
      ai: {
        easy: readBase(ai.easy),
        medium: readBase(ai.medium),
        hard: readBase(ai.hard)
      },
      online: readBase(data.online)
    };
  } catch {
    return emptyPlayerStats();
  }
}

function savePlayerStats(
  stats: PlayerStats,
  storage: Storage | null
): void {
  if (!storage) {
    return;
  }

  try {
    storage.setItem(STATS_STORAGE_KEY, JSON.stringify(stats));
  } catch {
    // Storage full or blocked: statistics are a nicety, never break the game over them.
  }
}

export function clearPlayerStats(
  storage: Storage | null = defaultStorage()
): void {
  try {
    storage?.removeItem(STATS_STORAGE_KEY);
  } catch {
    // Nothing to do.
  }
}

/* ------------------------------ recording ------------------------------- */

export type StatsInput = {
  mode: GameMode;

  /** Required for Solo; without it the match cannot be classified. */
  difficulty?: AIDifficulty;

  /** From the local player's point of view. */
  outcome: MatchOutcome;

  /** Oriented as the local player's (shots/hits/shipsSunk are the player's own). */
  stats: Pick<MatchStats, 'shots' | 'hits' | 'shipsSunk'>;
};

/** True when this kind of match is kept in the persistent statistics. */
export function isTrackedMatch(
  mode: GameMode,
  difficulty?: AIDifficulty
): boolean {
  if (mode === 'online') {
    return true;
  }

  return (
    mode === 'ai' &&
    difficulty !== undefined &&
    AI_DIFFICULTIES.includes(difficulty)
  );
}

function addMatch(
  base: BaseStats,
  input: StatsInput
): BaseStats {
  return {
    matches: base.matches + 1,
    wins: base.wins + (input.outcome === 'victory' ? 1 : 0),
    losses: base.losses + (input.outcome === 'defeat' ? 1 : 0),
    shots: base.shots + toCounter(input.stats.shots),
    hits: base.hits + toCounter(input.stats.hits),
    shipsSunk: base.shipsSunk + toCounter(input.stats.shipsSunk)
  };
}

/**
 * Adds one finished match to the saved totals and returns the new totals.
 * Local Multiplayer (and anything unclassifiable) is ignored.
 *
 * Reads the latest saved data right before writing, so two open tabs do not
 * overwrite each other with stale totals.
 */
export function recordMatchStats(
  input: StatsInput,
  storage: Storage | null = defaultStorage()
): PlayerStats {
  const current = loadPlayerStats(storage);

  if (!isTrackedMatch(input.mode, input.difficulty)) {
    return current;
  }

  const next: PlayerStats =
    input.mode === 'online'
      ? {
          ...current,
          online: addMatch(current.online, input)
        }
      : {
          ...current,
          ai: {
            ...current.ai,
            [input.difficulty as AIDifficulty]: addMatch(
              current.ai[input.difficulty as AIDifficulty],
              input
            )
          }
        };

  savePlayerStats(next, storage);

  return next;
}

/* ------------------------------- queries -------------------------------- */

export function sumBaseStats(
  parts: readonly BaseStats[]
): BaseStats {
  const total = emptyBaseStats();

  for (const part of parts) {
    for (const key of BASE_KEYS) {
      total[key] += part[key];
    }
  }

  return total;
}

/** Every Solo difficulty combined. */
export function getAiOverview(stats: PlayerStats): BaseStats {
  return sumBaseStats(AI_DIFFICULTIES.map((level) => stats.ai[level]));
}

/** Solo + Online. */
export function getGlobalBase(stats: PlayerStats): BaseStats {
  return sumBaseStats([getAiOverview(stats), stats.online]);
}

export function getScopeBase(
  stats: PlayerStats,
  scope: StatsScope
): BaseStats {
  switch (scope.section) {
    case 'global':
      return getGlobalBase(stats);

    case 'online':
      return stats.online;

    case 'ai':
      return scope.difficulty === 'all'
        ? getAiOverview(stats)
        : stats.ai[scope.difficulty];
  }
}

/** Ratios are computed here, on demand, and never stored. */
export function deriveStats(base: BaseStats): DerivedStats {
  return {
    ...base,
    winRate:
      base.matches === 0 ? 0 : (base.wins / base.matches) * 100,
    accuracy:
      base.shots === 0 ? 0 : (base.hits / base.shots) * 100
  };
}

export function getScopeStats(
  stats: PlayerStats,
  scope: StatsScope
): DerivedStats {
  return deriveStats(getScopeBase(stats, scope));
}
