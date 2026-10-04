// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

import {
  clearPlayerStats,
  deriveStats,
  emptyPlayerStats,
  getAiOverview,
  getGlobalBase,
  getScopeStats,
  isTrackedMatch,
  loadPlayerStats,
  recordMatchStats,
  STATS_STORAGE_KEY,
  type StatsInput
} from '../playerStats';

const input = (overrides: Partial<StatsInput> = {}): StatsInput => ({
  mode: 'ai',
  difficulty: 'hard',
  outcome: 'victory',
  stats: { shots: 20, hits: 10, shipsSunk: 5 },
  ...overrides
});

describe('player stats storage', () => {
  beforeEach(() => localStorage.clear());

  it('starts at zero with no division by zero', () => {
    const stats = loadPlayerStats();

    expect(stats).toEqual(emptyPlayerStats());

    const global = getScopeStats(stats, { section: 'global' });

    expect(global.winRate).toBe(0);
    expect(global.accuracy).toBe(0);
  });

  it('records a Solo match under its difficulty only', () => {
    recordMatchStats(input({ difficulty: 'medium' }));

    const stats = loadPlayerStats();

    expect(stats.ai.medium).toEqual({
      matches: 1,
      wins: 1,
      losses: 0,
      shots: 20,
      hits: 10,
      shipsSunk: 5
    });
    expect(stats.ai.easy.matches).toBe(0);
    expect(stats.ai.hard.matches).toBe(0);
    expect(stats.online.matches).toBe(0);
  });

  it('records Online matches in their own bucket, wins and losses', () => {
    recordMatchStats(input({ mode: 'online', difficulty: undefined }));
    recordMatchStats(
      input({
        mode: 'online',
        difficulty: undefined,
        outcome: 'defeat',
        stats: { shots: 10, hits: 2, shipsSunk: 1 }
      })
    );

    const { online } = loadPlayerStats();

    expect(online).toEqual({
      matches: 2,
      wins: 1,
      losses: 1,
      shots: 30,
      hits: 12,
      shipsSunk: 6
    });
  });

  it('never records Local Multiplayer and writes nothing', () => {
    recordMatchStats(input({ mode: 'local', difficulty: undefined }));

    expect(loadPlayerStats()).toEqual(emptyPlayerStats());
    expect(localStorage.getItem(STATS_STORAGE_KEY)).toBeNull();
    expect(isTrackedMatch('local')).toBe(false);
  });

  it('ignores a Solo match with no difficulty', () => {
    recordMatchStats(input({ difficulty: undefined }));

    expect(loadPlayerStats()).toEqual(emptyPlayerStats());
  });

  it('combines Global from Solo and Online, and Overview from the three levels', () => {
    recordMatchStats(input({ difficulty: 'easy' }));
    recordMatchStats(input({ difficulty: 'hard', outcome: 'defeat' }));
    recordMatchStats(input({ mode: 'online', difficulty: undefined }));

    const stats = loadPlayerStats();

    expect(getAiOverview(stats).matches).toBe(2);
    expect(getGlobalBase(stats).matches).toBe(3);

    const global = getScopeStats(stats, { section: 'global' });

    expect(global.wins).toBe(2);
    expect(global.losses).toBe(1);
    expect(global.shots).toBe(60);
    expect(global.hits).toBe(30);
    expect(global.shipsSunk).toBe(15);

    expect(
      getScopeStats(stats, { section: 'ai', difficulty: 'all' }).matches
    ).toBe(2);
    expect(
      getScopeStats(stats, { section: 'ai', difficulty: 'easy' }).wins
    ).toBe(1);
    expect(getScopeStats(stats, { section: 'online' }).matches).toBe(1);
  });

  it('derives win rate and accuracy and never stores them', () => {
    recordMatchStats(input());
    recordMatchStats(input({ outcome: 'defeat' }));
    recordMatchStats(input({ outcome: 'defeat' }));
    recordMatchStats(input({ outcome: 'defeat' }));

    const raw = JSON.parse(localStorage.getItem(STATS_STORAGE_KEY)!);

    expect(JSON.stringify(raw)).not.toMatch(/winRate|accuracy/i);

    const derived = getScopeStats(loadPlayerStats(), {
      section: 'ai',
      difficulty: 'hard'
    });

    expect(derived.winRate).toBe(25);
    expect(derived.accuracy).toBe(50);
  });

  it('deriveStats handles empty and partial data', () => {
    expect(deriveStats(emptyPlayerStats().online).accuracy).toBe(0);

    expect(
      deriveStats({
        matches: 3,
        wins: 1,
        losses: 2,
        shots: 3,
        hits: 1,
        shipsSunk: 0
      }).winRate
    ).toBeCloseTo(33.333, 2);
  });

  it('survives corrupt or foreign data', () => {
    for (const bad of ['not json', 'null', '[]', '42', '"x"']) {
      localStorage.setItem(STATS_STORAGE_KEY, bad);

      expect(loadPlayerStats()).toEqual(emptyPlayerStats());
    }
  });

  it('zeroes only the broken fields', () => {
    localStorage.setItem(
      STATS_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        ai: {
          easy: { matches: 4, wins: 'lots', losses: -2, shots: 10.9 },
          hard: 'broken'
        },
        online: { matches: 7, wins: Infinity }
      })
    );

    const stats = loadPlayerStats();

    expect(stats.ai.easy).toEqual({
      matches: 4,
      wins: 0,
      losses: 0,
      shots: 10,
      hits: 0,
      shipsSunk: 0
    });
    expect(stats.ai.hard.matches).toBe(0);
    expect(stats.online.matches).toBe(7);
    expect(stats.online.wins).toBe(0);
  });

  it('is not corrupted by invalid input numbers', () => {
    recordMatchStats(
      input({ stats: { shots: NaN, hits: -4, shipsSunk: 2 } })
    );

    expect(loadPlayerStats().ai.hard).toMatchObject({
      matches: 1,
      shots: 0,
      hits: 0,
      shipsSunk: 2
    });
  });

  it('clears everything', () => {
    recordMatchStats(input());
    clearPlayerStats();

    expect(loadPlayerStats()).toEqual(emptyPlayerStats());
  });

  it('works without storage and when storage throws', () => {
    expect(loadPlayerStats(null)).toEqual(emptyPlayerStats());
    expect(recordMatchStats(input(), null).ai.hard.matches).toBe(1);

    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
      removeItem: () => {
        throw new Error('blocked');
      }
    } as unknown as Storage;

    expect(() => recordMatchStats(input(), broken)).not.toThrow();
    expect(loadPlayerStats(broken)).toEqual(emptyPlayerStats());
    expect(() => clearPlayerStats(broken)).not.toThrow();
  });
});
