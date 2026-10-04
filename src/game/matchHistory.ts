import type { MatchOutcome, MatchStats } from './matchStats';
import type { AIDifficulty, GameMode } from './types';

/** How many finished matches are kept; older ones are dropped. */
export const HISTORY_LIMIT = 20;

export const HISTORY_STORAGE_KEY = 'battleship.history.v1';

export type MatchRecord = {
  id: string;

  /** Epoch milliseconds when the match ended. */
  endedAt: number;

  mode: GameMode;

  /** Only for Solo. */
  difficulty?: AIDifficulty;

  /**
   * Solo / Online: from the local player's point of view.
   * Local: "victory" means Player 1 won, "defeat" means Player 2 won.
   */
  outcome: MatchOutcome;

  /** Same orientation as `outcome` (Local: Player 1 on the "player" side). */
  stats: MatchStats;
};

const MODES: readonly GameMode[] = ['ai', 'local', 'online'];
const DIFFICULTIES: readonly AIDifficulty[] = ['easy', 'medium', 'hard'];

const STAT_KEYS: readonly (keyof MatchStats)[] = [
  'shots',
  'hits',
  'accuracy',
  'shipsSunk',
  'longestStreak',
  'enemyShots',
  'enemyHits',
  'enemyAccuracy',
  'enemyShipsSunk',
  'enemyLongestStreak',
  'durationMs'
];

/** localStorage can be missing or throw (private mode, quota, sandboxed iframes). */
function defaultStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is MatchRecord {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  if (
    typeof record.id !== 'string' ||
    typeof record.endedAt !== 'number' ||
    !Number.isFinite(record.endedAt) ||
    !MODES.includes(record.mode as GameMode) ||
    (record.outcome !== 'victory' && record.outcome !== 'defeat')
  ) {
    return false;
  }

  if (
    record.difficulty !== undefined &&
    !DIFFICULTIES.includes(record.difficulty as AIDifficulty)
  ) {
    return false;
  }

  const stats = record.stats as Record<string, unknown> | null;

  return (
    typeof stats === 'object' &&
    stats !== null &&
    STAT_KEYS.every(
      (key) => typeof stats[key] === 'number' && Number.isFinite(stats[key])
    )
  );
}

/** Newest first. Corrupt or foreign data yields an empty / filtered list, never a throw. */
export function loadHistory(storage: Storage | null = defaultStorage()): MatchRecord[] {
  if (!storage) {
    return [];
  }

  try {
    const raw = storage.getItem(HISTORY_STORAGE_KEY);

    if (!raw) {
      return [];
    }

    const parsed: unknown = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isRecord).slice(0, HISTORY_LIMIT);
  } catch {
    return [];
  }
}

function saveHistory(records: MatchRecord[], storage: Storage | null): void {
  if (!storage) {
    return;
  }

  try {
    storage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(records));
  } catch {
    // Storage full or blocked: history is a nicety, never break the game over it.
  }
}

let idCounter = 0;

export function createMatchRecord(
  input: Omit<MatchRecord, 'id' | 'endedAt'> & { endedAt?: number }
): MatchRecord {
  const endedAt = input.endedAt ?? Date.now();

  return {
    ...input,
    endedAt,
    id: `${endedAt.toString(36)}-${(idCounter++).toString(36)}`
  };
}

/** Prepends the match and keeps only the latest HISTORY_LIMIT. Returns the new list. */
export function addMatchRecord(
  record: MatchRecord,
  storage: Storage | null = defaultStorage()
): MatchRecord[] {
  const next = [record, ...loadHistory(storage)].slice(0, HISTORY_LIMIT);

  saveHistory(next, storage);

  return next;
}

export function clearHistory(storage: Storage | null = defaultStorage()): void {
  try {
    storage?.removeItem(HISTORY_STORAGE_KEY);
  } catch {
    // Nothing to do.
  }
}

const MODE_LABELS: Record<GameMode, string> = {
  ai: 'Solo',
  local: 'Local',
  online: 'Online'
};

const DIFFICULTY_LABELS: Record<AIDifficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard'
};

/** "Solo · Hard", "Local", "Online". */
export function describeRecordMode(record: MatchRecord): string {
  const mode = MODE_LABELS[record.mode];

  return record.mode === 'ai' && record.difficulty
    ? `${mode} · ${DIFFICULTY_LABELS[record.difficulty]}`
    : mode;
}

/** "Victory" / "Defeat", or "P1 won" / "P2 won" for Local. */
export function describeRecordOutcome(record: MatchRecord): string {
  if (record.mode === 'local') {
    return record.outcome === 'victory' ? 'Player 1 won' : 'Player 2 won';
  }

  return record.outcome === 'victory' ? 'Victory' : 'Defeat';
}

export function formatRecordDate(endedAt: number, locale?: string): string {
  return new Date(endedAt).toLocaleString(locale, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
}
