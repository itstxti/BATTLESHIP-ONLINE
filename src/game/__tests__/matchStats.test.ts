import { afterEach, describe, expect, it, vi } from 'vitest';

import { Board } from '../Board';
import { STANDARD_FLEET } from '../fleet';
import {
  computeMatchStats,
  describeStatGroups,
  formatAccuracy,
  formatDuration,
  getMatchDurationMs,
  hasMatchStarted,
  longestHitStreak,
  startMatchClock,
  stopMatchClock,
  swapPerspective,
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

  describe('enemy attack (derived from the player board)', () => {
    it('measures the opponent’s accuracy and the ships they sank', () => {
      const mine = realFleet();

      sinkRow(mine, 4); // Destroyer, 2 hits
      mine.shoot(0, 0); // hit on the carrier (afloat)
      mine.shoot(9, 9); // miss
      mine.shoot(9, 8); // miss

      const stats = computeMatchStats(new Board(), 0, mine);

      expect(stats.enemyShots).toBe(2 + 1 + 2);
      expect(stats.enemyHits).toBe(3);
      expect(formatAccuracy(stats.enemyAccuracy)).toBe('60.0%');
      expect(stats.enemyShipsSunk).toBe(1);
      expect(stats.enemyLongestStreak).toBe(3);
    });

    it('is zero, not NaN, when the opponent never fired', () => {
      const stats = computeMatchStats(new Board(), 0, realFleet());

      expect(stats.enemyShots).toBe(0);
      expect(stats.enemyAccuracy).toBe(0);
      expect(stats.enemyShipsSunk).toBe(0);
      expect(stats.enemyLongestStreak).toBe(0);
    });

    it('does not mix up the two sides', () => {
      const enemy = realFleet();
      const mine = realFleet();

      sinkRow(enemy, 0);
      mine.shoot(9, 9);

      const stats = computeMatchStats(enemy, 0, mine);

      expect(stats.shots).toBe(5);
      expect(stats.shipsSunk).toBe(1);
      expect(stats.enemyShots).toBe(1);
      expect(stats.enemyShipsSunk).toBe(0);
      expect(stats.enemyLongestStreak).toBe(0);
    });
  });

  it('derives the longest streak from the order of the player’s shots', () => {
    const enemy = realFleet();

    enemy.shoot(0, 0); // hit
    enemy.shoot(0, 1); // hit      -> streak 2
    enemy.shoot(9, 9); // miss
    enemy.shoot(1, 0); // hit
    enemy.shoot(1, 1); // hit
    enemy.shoot(1, 2); // hit      -> streak 3
    enemy.shoot(1, 3); // hit      -> streak 4
    enemy.shoot(9, 8); // miss
    enemy.shoot(2, 0); // hit      -> streak 1

    expect(computeMatchStats(enemy, 0).longestStreak).toBe(4);
  });

  it('reads the streak on a tracking board too (Local/Online)', () => {
    const tracking = new Board();

    tracking.recordShot(0, 0, 'hit');
    tracking.recordShot(5, 5, 'miss');
    tracking.recordShot(0, 1, 'hit');
    tracking.recordShot(0, 2, 'hit');

    expect(computeMatchStats(tracking, 0).longestStreak).toBe(2);
  });
});

describe('Board shot history', () => {
  it('logs landed shots in order, for shoot and recordShot alike', () => {
    const real = realFleet();

    real.shoot(0, 0);
    real.shoot(9, 9);

    expect(real.getShotHistory()).toEqual([
      { row: 0, column: 0, result: 'hit' },
      { row: 9, column: 9, result: 'miss' }
    ]);

    const tracking = new Board();

    tracking.recordShot(3, 3, 'miss');
    tracking.recordShot(3, 4, 'hit');

    expect(tracking.getShotHistory()).toEqual([
      { row: 3, column: 3, result: 'miss' },
      { row: 3, column: 4, result: 'hit' }
    ]);
  });

  it('ignores shots that did not land', () => {
    const real = realFleet();

    real.shoot(0, 0);
    real.shoot(0, 0); // already shot
    real.shoot(-1, 4); // outside the board

    expect(real.getShotHistory()).toHaveLength(1);

    const tracking = new Board();

    tracking.recordShot(2, 2, 'hit');

    expect(tracking.recordShot(2, 2, 'miss')).toBe(false); // duplicate
    expect(tracking.recordShot(10, 0, 'hit')).toBe(false); // outside

    expect(tracking.getShotHistory()).toHaveLength(1);
  });
});

describe('longestHitStreak', () => {
  const log = (results: ('hit' | 'miss')[]) =>
    results.map((result, column) => ({ row: 0, column, result }));

  it.each([
    [[], 0],
    [['miss', 'miss'], 0],
    [['hit'], 1],
    [['hit', 'hit', 'hit'], 3],
    [['hit', 'miss', 'hit', 'hit'], 2],
    [['hit', 'hit', 'miss', 'hit'], 2]
  ] as [('hit' | 'miss')[], number][])('%j -> %i', (results, expected) => {
    expect(longestHitStreak(log(results))).toBe(expected);
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

describe('describeStatGroups', () => {
  const sentence = (row: { value: string; label: string }) =>
    `${row.value} ${row.label}`;

  it('groups the rows in display order', () => {
    const groups = describeStatGroups({
      shots: 17,
      hits: 9,
      accuracy: (9 / 17) * 100,
      shipsSunk: 4,
      longestStreak: 6,
      enemyShots: 12,
      enemyHits: 3,
      enemyAccuracy: 25,
      enemyShipsSunk: 2,
      enemyLongestStreak: 3,
      durationMs: 163_000
    });

    expect(groups.map((group) => group.id)).toEqual([
      'attack',
      'defense',
      'match'
    ]);

    expect(groups.map((group) => group.title)).toEqual([
      'You',
      'Enemy',
      'Match'
    ]);

    expect(groups[0].rows.map(sentence)).toEqual([
      '17 shots',
      '9 hits',
      '52.9% accuracy',
      '4 ships sunk',
      '6 hits in a row'
    ]);

    expect(groups[1].rows.map(sentence)).toEqual([
      '12 shots',
      '3 hits',
      '25.0% accuracy',
      '2 ships sunk',
      '3 hits in a row'
    ]);

    expect(groups[2].rows.map(sentence)).toEqual(['02:43 duration']);
  });

  it('titles the cards with the given names (Local: Player 1 / Player 2)', () => {
    const groups = describeStatGroups(
      {
        shots: 0,
        hits: 0,
        accuracy: 0,
        shipsSunk: 0,
        longestStreak: 0,
        enemyShots: 0,
        enemyHits: 0,
        enemyAccuracy: 0,
        enemyShipsSunk: 0,
        enemyLongestStreak: 0,
        durationMs: 0
      },
      { player: 'Player 1', opponent: 'Player 2' }
    );

    expect(groups.map((group) => group.title)).toEqual([
      'Player 1',
      'Player 2',
      'Match'
    ]);

    // Both sides list exactly the same stats.
    expect(groups[1].rows.map((row) => row.label)).toEqual(
      groups[0].rows.map((row) => row.label)
    );
  });

  it('swaps the two sides of the same match', () => {
    const stats = {
      shots: 17,
      hits: 9,
      accuracy: (9 / 17) * 100,
      shipsSunk: 4,
      longestStreak: 6,
      enemyShots: 12,
      enemyHits: 3,
      enemyAccuracy: 25,
      enemyShipsSunk: 2,
      enemyLongestStreak: 3,
      durationMs: 163_000
    };

    const swapped = swapPerspective(stats);

    expect(swapped).toMatchObject({
      shots: 12,
      hits: 3,
      accuracy: 25,
      shipsSunk: 2,
      longestStreak: 3,
      enemyShots: 17,
      enemyHits: 9,
      enemyShipsSunk: 4,
      enemyLongestStreak: 6,
      durationMs: 163_000
    });

    expect(swapPerspective(swapped)).toEqual(stats);
  });

  it('draws a meter only on the accuracy rows', () => {
    const groups = describeStatGroups({
      shots: 2,
      hits: 1,
      accuracy: 50,
      shipsSunk: 0,
      longestStreak: 1,
      enemyShots: 0,
      enemyHits: 0,
      enemyAccuracy: 0,
      enemyShipsSunk: 0,
      enemyLongestStreak: 0,
      durationMs: 0
    });

    const meters = groups.flatMap((group) =>
      group.rows.filter((row) => row.meter !== undefined)
    );

    expect(meters.map((row) => [row.label, row.meter])).toEqual([
      ['accuracy', 50],
      ['accuracy', 0]
    ]);
  });

  it('uses the singular when the count is exactly one', () => {
    const groups = describeStatGroups({
      shots: 1,
      hits: 1,
      accuracy: 100,
      shipsSunk: 1,
      longestStreak: 1,
      enemyShots: 1,
      enemyHits: 1,
      enemyAccuracy: 100,
      enemyShipsSunk: 1,
      enemyLongestStreak: 1,
      durationMs: 0
    });

    expect(groups[0].rows.map((row) => row.label)).toEqual([
      'shot',
      'hit',
      'accuracy',
      'ship sunk',
      'hit in a row'
    ]);

    expect(groups[1].rows.map((row) => row.label)).toEqual([
      'shot',
      'hit',
      'accuracy',
      'ship sunk',
      'hit in a row'
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
