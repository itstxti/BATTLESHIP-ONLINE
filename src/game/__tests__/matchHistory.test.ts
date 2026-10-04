// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

import {
  addMatchRecord,
  clearHistory,
  createMatchRecord,
  describeRecordMode,
  describeRecordOutcome,
  HISTORY_LIMIT,
  HISTORY_STORAGE_KEY,
  loadHistory,
  type MatchRecord
} from '../matchHistory';
import type { MatchStats } from '../matchStats';

const stats = (overrides: Partial<MatchStats> = {}): MatchStats => ({
  shots: 20,
  hits: 10,
  accuracy: 50,
  shipsSunk: 3,
  longestStreak: 4,
  enemyShots: 15,
  enemyHits: 5,
  enemyAccuracy: 33,
  enemyShipsSunk: 1,
  enemyLongestStreak: 2,
  durationMs: 60_000,
  ...overrides
});

const record = (
  overrides: Partial<Omit<MatchRecord, 'id'>> = {}
): MatchRecord =>
  createMatchRecord({
    mode: 'ai',
    difficulty: 'hard',
    outcome: 'victory',
    stats: stats(),
    ...overrides
  });

describe('match history storage', () => {
  beforeEach(() => localStorage.clear());

  it('starts empty and stores newest first', () => {
    expect(loadHistory()).toEqual([]);

    const first = record({ endedAt: 1 });
    const second = record({ endedAt: 2, outcome: 'defeat' });

    addMatchRecord(first);
    addMatchRecord(second);

    expect(loadHistory().map((item) => item.id)).toEqual([second.id, first.id]);
  });

  it('keeps only the last 20 matches', () => {
    const all = Array.from({ length: HISTORY_LIMIT + 5 }, (_, index) =>
      record({ endedAt: index })
    );

    all.forEach((item) => addMatchRecord(item));

    const stored = loadHistory();

    expect(stored).toHaveLength(HISTORY_LIMIT);
    expect(stored[0].id).toBe(all[all.length - 1].id);
    expect(stored.at(-1)!.id).toBe(all[5].id);
  });

  it('gives every record a distinct id, even within the same millisecond', () => {
    const ids = new Set(
      Array.from({ length: 50 }, () => record({ endedAt: 123 }).id)
    );

    expect(ids.size).toBe(50);
  });

  it('survives corrupt storage and drops malformed entries', () => {
    localStorage.setItem(HISTORY_STORAGE_KEY, '{not json');
    expect(loadHistory()).toEqual([]);

    localStorage.setItem(HISTORY_STORAGE_KEY, '{"a":1}');
    expect(loadHistory()).toEqual([]);

    const good = record();

    localStorage.setItem(
      HISTORY_STORAGE_KEY,
      JSON.stringify([good, { id: 'x' }, null, { ...good, mode: 'chess' }])
    );

    expect(loadHistory().map((item) => item.id)).toEqual([good.id]);
  });

  it('never throws when storage is unavailable', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {
        throw new Error('blocked');
      }
    } as unknown as Storage;

    expect(loadHistory(broken)).toEqual([]);
    expect(() => addMatchRecord(record(), broken)).not.toThrow();
    expect(() => clearHistory(broken)).not.toThrow();
    expect(loadHistory(null)).toEqual([]);
  });

  it('clears the history', () => {
    addMatchRecord(record());
    clearHistory();

    expect(loadHistory()).toEqual([]);
  });
});

describe('record labels', () => {
  it('describes mode and outcome', () => {
    expect(describeRecordMode(record())).toBe('Solo · Hard');
    expect(describeRecordMode(record({ mode: 'online', difficulty: undefined }))).toBe('Online');
    expect(describeRecordOutcome(record({ outcome: 'defeat' }))).toBe('Defeat');
    expect(
      describeRecordOutcome(record({ mode: 'local', difficulty: undefined, outcome: 'defeat' }))
    ).toBe('Player 2 won');
  });
});
