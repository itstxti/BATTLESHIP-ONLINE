import { afterEach, describe, expect, it, vi } from 'vitest';

import { Board } from '../Board';
import { STANDARD_FLEET } from '../fleet';
import {
  computeMatchStats,
  describeStats,
  formatAccuracy,
  formatDuration,
  getMatchDurationMs,
  hasMatchStarted,
  startMatchClock,
  stopMatchClock,
  type MatchClock
} from '../matchStats';

/** A real fleet on rows 0..4 starting at column 0 (what Solo shoots at). */
function realFleet(): Board {
  const board = new Board();

  STANDARD_FLEET.forEach((ship, row) => {
    board.placeShip(
      ship.name,
      ship.size,
      Array.from({ length: ship.size }, (_, column) => ({ row, column }))
    );
  });

  return board;
}

function sinkRow(board: Board, row: number): void {
  const size = STANDARD_FLEET[row].size;

  for (let column = 0; column < size; column++) {
    board.shoot(row, column);
  }
}

describe('computeMatchStats', () => {
  it('counts shots, hits and accuracy on a tracking (fog-of-war) board', () => {
    const tracking = new Board();

    // 9 hits and 8 misses = 17 shots -> 52.9%
    for (let column = 0; column < 9; column++) {
      tracking.recordShot(0, column, 'hit');
    }

    for (let column = 0; column < 8; column++) {
      tracking.recordShot(5, column, 'miss');
    }

    const stats = computeMatchStats(tracking, 163_000);

    expect(stats.shots).toBe(17);
    expect(stats.hits).toBe(9);
    expect(formatAccuracy(stats.accuracy)).toBe('52.9%');
    expect(stats.durationMs).toBe(163_000);
  });

  it('is not NaN when no shot was fired', () => {
    const stats = computeMatchStats(new Board(), 0);

    expect(stats.shots).toBe(0);
    expect(stats.hits).toBe(0);
    expect(stats.accuracy).toBe(0);
    expect(formatAccuracy(stats.accuracy)).toBe('0.0%');
  });

  it('counts only fully sunk ships on a real board (Solo)', () => {
    const enemy = realFleet();

    sinkRow(enemy, 0); // Carrier
    sinkRow(enemy, 1); // Battleship

    // Damaged but afloat: must not count.
    enemy.shoot(2, 0);
    enemy.shoot(2, 1);

    enemy.shoot(9, 9); // miss

    const stats = computeMatchStats(enemy, 1000);

    expect(stats.shipsSunk).toBe(2);
    expect(stats.hits).toBe(5 + 4 + 2);
    expect(stats.shots).toBe(5 + 4 + 2 + 1);
  });

  it('counts ships revealed through markSunk on a tracking board (Local/Online)', () => {
    const tracking = new Board();

    const positions = [
      { row: 4, column: 0 },
      { row: 4, column: 1 }
    ];

    for (const { row, column } of positions) {
      tracking.recordShot(row, column, 'hit');
    }

    // A hit that has not been reported as sunk is not a sunk ship.
    tracking.recordShot(7, 7, 'hit');

    expect(computeMatchStats(tracking, 0).shipsSunk).toBe(0);

    expect(tracking.markSunk('Destroyer', 2, positions)).toBe(true);

    expect(computeMatchStats(tracking, 0).shipsSunk).toBe(1);
  });

  it('is exactly 17 hits, 5 ships and 17/N accuracy for a won game', () => {
    const enemy = realFleet();

    enemy.shoot(9, 9);
    enemy.shoot(9, 8);

    for (let row = 0; row < 5; row++) {
      sinkRow(enemy, row);
    }

    const stats = computeMatchStats(enemy, 0);

    expect(stats.hits).toBe(17);
    expect(stats.shipsSunk).toBe(5);
    expect(stats.shots).toBe(19);
    expect(formatAccuracy(stats.accuracy)).toBe('89.5%');
  });

  it('never reports a negative duration', () => {
    expect(computeMatchStats(new Board(), -50).durationMs).toBe(0);
  });
});

describe('formatDuration', () => {
  it.each([
    [0, '00:00'],
    [999, '00:00'],
    [1_000, '00:01'],
    [59_999, '00:59'],
    [163_000, '02:43'],
    [599_000, '09:59'],
    [3_599_000, '59:59'],
    [3_723_000, '1:02:03'],
    [-5_000, '00:00']
  ])('%i ms -> %s', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });
});

describe('formatAccuracy', () => {
  it.each([
    [0, '0.0%'],
    [(9 / 17) * 100, '52.9%'],
    [(1 / 3) * 100, '33.3%'],
    [100, '100.0%']
  ])('%d -> %s', (accuracy, expected) => {
    expect(formatAccuracy(accuracy)).toBe(expected);
  });
});

describe('describeStats', () => {
  it('produces the five rows in display order', () => {
    const rows = describeStats({
      shots: 17,
      hits: 9,
      accuracy: (9 / 17) * 100,
      shipsSunk: 4,
      durationMs: 163_000
    });

    expect(rows.map((row) => `${row.value} ${row.label}`)).toEqual([
      '17 shots',
      '9 hits',
      '52.9% accuracy',
      '4 ships sunk',
      '02:43 duration'
    ]);
  });

  it('uses the singular when the count is exactly one', () => {
    const rows = describeStats({
      shots: 1,
      hits: 1,
      accuracy: 100,
      shipsSunk: 1,
      durationMs: 0
    });

    expect(rows.map((row) => row.label)).toEqual([
      'shot',
      'hit',
      'accuracy',
      'ship sunk',
      'duration'
    ]);
  });
});

describe('match clock', () => {
  const newClock = (): MatchClock => ({
    battleStartedAt: null,
    battleEndedAt: null
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('measures from the first start to the first stop', () => {
    const now = vi.spyOn(performance, 'now');
    const clock = newClock();

    expect(hasMatchStarted(clock)).toBe(false);
    expect(getMatchDurationMs(clock)).toBe(0);

    now.mockReturnValue(1_000);
    startMatchClock(clock);

    now.mockReturnValue(5_000); // a second start must not reset the clock
    startMatchClock(clock);

    expect(hasMatchStarted(clock)).toBe(true);
    expect(getMatchDurationMs(clock)).toBe(4_000); // still running

    now.mockReturnValue(11_000);
    stopMatchClock(clock);

    now.mockReturnValue(99_000); // late callers cannot inflate the time
    stopMatchClock(clock);

    expect(getMatchDurationMs(clock)).toBe(10_000);
  });

  it('ignores a stop for a battle that never started', () => {
    vi.spyOn(performance, 'now').mockReturnValue(7_000);

    const clock = newClock();

    stopMatchClock(clock);

    expect(clock.battleEndedAt).toBeNull();
    expect(hasMatchStarted(clock)).toBe(false);
    expect(getMatchDurationMs(clock)).toBe(0);
  });
});
