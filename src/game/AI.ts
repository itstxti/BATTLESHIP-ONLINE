import { Board } from './Board';

import { STANDARD_FLEET } from './fleet';

import type {
  Opponent,
  ShotResult
} from './Opponent';

import type { AIDifficulty } from './types';

type Shot = {
  row: number;
  column: number;
};

type Direction =
  | 'horizontal'
  | 'vertical';

/**
 * The AI is a small state machine with two modes:
 *
 *  - Target mode (destruction): there are unresolved hits, so it finishes
 *    the ship. After one hit it probes the four neighbours; after two hits
 *    it knows the orientation and only fires along that axis.
 *  - Hunt mode: nothing is known, so it searches. This is where the
 *    difficulty levels differ:
 *
 *      easy    random cells
 *      medium  checkerboard parity (every ship covers both colours)
 *      hard    probability density (heat map of every legal placement)
 *
 * Target mode is shared by all levels; on `hard` the density map also picks
 * the best of the target candidates.
 */
export class AI implements Opponent {
  private availableShots: Shot[] = [];

  private readonly fired = new Set<string>();

  /** Hits that belong to ships that we have not sunk yet. */
  private hits: Shot[] = [];

  /** Cells where we know there is no ship. */
  private misses = new Set<string>();

  /** Cells belonging to ships that we have already sunk. */
  private sunkPositions = new Set<string>();

  /** Names of the ships that we know have been sunk. */
  private sunkShips = new Set<string>();

  /** Colour of the checkerboard the medium level hunts on. */
  private readonly parity: 0 | 1 =
    Math.random() < 0.5 ? 0 : 1;

  private readonly boardSize: number;

  private readonly difficulty: AIDifficulty;

  constructor(
    boardSize: number,
    difficulty: AIDifficulty = 'hard'
  ) {
    this.boardSize = boardSize;

    this.difficulty = difficulty;

    this.createShotList();
  }

  shoot(board: Board): ShotResult {
    const shot = this.getNextShot();

    const result = board.shoot(
      shot.row,
      shot.column
    );

    /*
     * This should never happen because every selected
     * shot comes from availableShots.
     */
    if (result === 'already-shot') {
      return this.shoot(board);
    }

    if (result === 'miss') {
      this.misses.add(this.getKey(shot));
    }

    if (result === 'hit') {
      this.hits.push(shot);

      const ship = board.getShipAt(
        shot.row,
        shot.column
      );

      /*
       * Once a ship is sunk, its complete position becomes
       * known to the AI. This is legitimate information:
       * the game has just revealed the sunk ship.
       */
      if (ship?.isSunk()) {
        this.sunkShips.add(ship.name);

        for (const position of ship.positions) {
          this.sunkPositions.add(
            this.getKey(position)
          );
        }

        /*
         * Forget only the hits of the ship that was just sunk.
         * Other unresolved hits may belong to another ship.
         */
        this.hits = this.hits.filter(
          (hit) =>
            !ship.positions.some(
              (position) =>
                position.row === hit.row &&
                position.column === hit.column
            )
        );
      }
    }

    return {
      row: shot.row,
      column: shot.column,
      result
    };
  }

  /* =========================================================
     SHOT SELECTION
     ========================================================= */

  private getNextShot(): Shot {
    const targets = this.getTargetCandidates();

    const shot =
      targets.length > 0
        ? this.chooseTarget(targets)
        : this.chooseHuntShot();

    this.fired.add(this.getKey(shot));

    this.removeAvailableShot(shot);

    return shot;
  }

  private chooseTarget(
    candidates: Shot[]
  ): Shot {
    if (this.difficulty === 'hard') {
      return this.pickBest(
        candidates,
        this.createProbabilityMap()
      );
    }

    return this.pickRandom(candidates);
  }

  private chooseHuntShot(): Shot {
    switch (this.difficulty) {
      case 'easy':
        return this.pickRandom(
          this.availableShots
        );

      case 'medium': {
        const parityShots =
          this.availableShots.filter(
            (shot) =>
              (shot.row + shot.column) % 2 ===
              this.parity
          );

        return this.pickRandom(
          parityShots.length > 0
            ? parityShots
            : this.availableShots
        );
      }

      default:
        return this.pickBest(
          this.availableShots,
          this.createProbabilityMap()
        );
    }
  }

  private pickRandom(pool: Shot[]): Shot {
    return pool[
      Math.floor(Math.random() * pool.length)
    ];
  }

  /** Highest score wins; ties are broken at random. */
  private pickBest(
    pool: Shot[],
    probabilityMap: number[][]
  ): Shot {
    let highestScore = -1;

    let bestShots: Shot[] = [];

    for (const shot of pool) {
      const score =
        probabilityMap[shot.row][shot.column];

      if (score > highestScore) {
        highestScore = score;

        bestShots = [shot];
      } else if (score === highestScore) {
        bestShots.push(shot);
      }
    }

    return this.pickRandom(bestShots);
  }

  /* =========================================================
     TARGET MODE
     ========================================================= */

  /**
   * Cells worth firing at to finish the ships we have already hit.
   * Empty when there are no unresolved hits (hunt mode).
   *
   * It works on the largest group of touching hits first:
   *  - 1 hit: its four neighbours (cross pattern);
   *  - 2+ hits in a line: only the two cells that extend the line;
   *  - hits that do not line up (two ships side by side): every
   *    neighbour of the group.
   */
  private getTargetCandidates(): Shot[] {
    const groups = this.groupHits();

    if (groups.length === 0) {
      return [];
    }

    const largest = Math.max(
      ...groups.map((group) => group.length)
    );

    const candidates = new Map<string, Shot>();

    for (const group of groups) {
      if (group.length !== largest) {
        continue;
      }

      for (const shot of this.getGroupCandidates(group)) {
        candidates.set(this.getKey(shot), shot);
      }
    }

    return [...candidates.values()];
  }

  private getGroupCandidates(group: Shot[]): Shot[] {
    const sameRow = group.every(
      (hit) => hit.row === group[0].row
    );

    const sameColumn = group.every(
      (hit) => hit.column === group[0].column
    );

    if (group.length >= 2 && (sameRow || sameColumn)) {
      const axis: 'row' | 'column' =
        sameRow ? 'column' : 'row';

      const values = group.map((hit) => hit[axis]);

      const low = Math.min(...values);
      const high = Math.max(...values);

      const makeShot = (value: number): Shot =>
        sameRow
          ? { row: group[0].row, column: value }
          : { row: value, column: group[0].column };

      const ends = [
        makeShot(low - 1),
        makeShot(high + 1)
      ].filter((shot) => this.isAvailable(shot));

      if (ends.length > 0) {
        return ends;
      }
    }

    return group.flatMap((hit) =>
      this.getNeighbours(hit).filter((shot) =>
        this.isAvailable(shot)
      )
    );
  }

  /** Splits the unresolved hits into groups of orthogonally touching hits. */
  private groupHits(): Shot[][] {
    const pending = new Map(
      this.hits.map((hit) => [this.getKey(hit), hit])
    );

    const groups: Shot[][] = [];

    while (pending.size > 0) {
      const [firstKey, first] = pending
        .entries()
        .next().value as [string, Shot];

      pending.delete(firstKey);

      const group = [first];

      for (let i = 0; i < group.length; i++) {
        for (const near of this.getNeighbours(group[i])) {
          const key = this.getKey(near);

          const hit = pending.get(key);

          if (hit) {
            pending.delete(key);

            group.push(hit);
          }
        }
      }

      groups.push(group);
    }

    return groups;
  }

  private getNeighbours(shot: Shot): Shot[] {
    return [
      { row: shot.row - 1, column: shot.column },
      { row: shot.row + 1, column: shot.column },
      { row: shot.row, column: shot.column - 1 },
      { row: shot.row, column: shot.column + 1 }
    ].filter((near) => this.isInsideBoard(near));
  }

  /* =========================================================
     PROBABILITY DENSITY
     ========================================================= */

  /**
   * Heat map: every legal placement of every ship that is still afloat
   * adds +1 to each cell it covers. Placements that explain unresolved
   * hits weigh much more, so the AI keeps working around them.
   *
   * It is rebuilt before every shot, so it always reflects the
   * latest misses and sunk ships.
   */
  private createProbabilityMap(): number[][] {
    const probabilityMap = Array.from(
      { length: this.boardSize },
      () => Array<number>(this.boardSize).fill(0)
    );

    const hitKeys = new Set(
      this.hits.map((hit) => this.getKey(hit))
    );

    const remainingShips =
      STANDARD_FLEET.filter(
        (ship) => !this.sunkShips.has(ship.name)
      );

    for (const ship of remainingShips) {
      for (let row = 0; row < this.boardSize; row++) {
        for (
          let column = 0;
          column < this.boardSize;
          column++
        ) {
          for (const direction of [
            'horizontal',
            'vertical'
          ] as Direction[]) {
            this.addPlacement(
              row,
              column,
              ship.size,
              direction,
              hitKeys,
              probabilityMap
            );
          }
        }
      }
    }

    return probabilityMap;
  }

  private addPlacement(
    row: number,
    column: number,
    shipSize: number,
    direction: Direction,
    hitKeys: Set<string>,
    probabilityMap: number[][]
  ): void {
    const positions: Shot[] = [];

    for (let i = 0; i < shipSize; i++) {
      const position: Shot = {
        row:
          direction === 'horizontal'
            ? row
            : row + i,

        column:
          direction === 'horizontal'
            ? column + i
            : column
      };

      // Leaves the board, hits a known miss or overlaps a sunk ship.
      if (
        !this.isInsideBoard(position) ||
        this.misses.has(this.getKey(position)) ||
        this.sunkPositions.has(this.getKey(position))
      ) {
        return;
      }

      positions.push(position);
    }

    const explainedHits = positions.filter(
      (position) =>
        hitKeys.has(this.getKey(position))
    ).length;

    const weight = 1 + 20 * explainedHits;

    for (const position of positions) {
      probabilityMap[position.row][
        position.column
      ] += weight;
    }
  }

  /* =========================================================
     BOOKKEEPING
     ========================================================= */

  /** Creates the initial list of all cells. */
  private createShotList(): void {
    this.availableShots = [];

    for (let row = 0; row < this.boardSize; row++) {
      for (
        let column = 0;
        column < this.boardSize;
        column++
      ) {
        this.availableShots.push({ row, column });
      }
    }
  }

  private removeAvailableShot(shot: Shot): void {
    const index =
      this.availableShots.findIndex(
        (availableShot) =>
          availableShot.row === shot.row &&
          availableShot.column === shot.column
      );

    if (index !== -1) {
      this.availableShots.splice(index, 1);
    }
  }

  private isAvailable(shot: Shot): boolean {
    return (
      this.isInsideBoard(shot) &&
      !this.fired.has(this.getKey(shot))
    );
  }

  private getKey(shot: Shot): string {
    return `${shot.row},${shot.column}`;
  }

  private isInsideBoard(shot: Shot): boolean {
    return (
      shot.row >= 0 &&
      shot.row < this.boardSize &&
      shot.column >= 0 &&
      shot.column < this.boardSize
    );
  }
}
