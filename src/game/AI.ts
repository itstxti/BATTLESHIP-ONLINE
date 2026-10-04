import { Board } from './Board';

import type {
  Opponent,
  ShotResult
} from './Opponent';

type Shot = {
  row: number;
  column: number;
};

type Direction =
  | 'horizontal'
  | 'vertical';

type ShipInfo = {
  name:
    | 'Carrier'
    | 'Battleship'
    | 'Cruiser'
    | 'Submarine'
    | 'Destroyer';

  size: number;
};

export class AI implements Opponent {
  private availableShots: Shot[] = [];

  /**
   * Hits that belong to ships that we have not sunk yet.
   */
  private hits: Shot[] = [];

  /**
   * Cells where we know there is no ship.
   */
  private misses = new Set<string>();

  /**
   * Cells belonging to ships that we have already sunk.
   */
  private sunkPositions = new Set<string>();

  /**
   * Ships that we know have already been sunk.
   */
  private sunkShips = new Set<
    ShipInfo['name']
  >();

  private boardSize: number;

  private readonly fleet: ShipInfo[] = [
    {
      name: 'Carrier',
      size: 5
    },
    {
      name: 'Battleship',
      size: 4
    },
    {
      name: 'Cruiser',
      size: 3
    },
    {
      name: 'Submarine',
      size: 3
    },
    {
      name: 'Destroyer',
      size: 2
    }
  ];

  constructor(boardSize: number) {
    this.boardSize =
      boardSize;

    this.createShotList();
  }

  shoot(board: Board): ShotResult {
    const shot =
      this.getNextShot();

    const result =
      board.shoot(
        shot.row,
        shot.column
      );

    /*
     * This should never happen because every selected
     * shot comes from availableShots.
     */
    if (
      result === 'already-shot'
    ) {
      return this.shoot(board);
    }

    if (
      result === 'miss'
    ) {
      this.misses.add(
        this.getKey(shot)
      );
    }

    if (
      result === 'hit'
    ) {
      this.hits.push(
        shot
      );

      const ship =
        board.getShipAt(
          shot.row,
          shot.column
        );

      /*
       * Once a ship is sunk, its complete position becomes
       * known to the AI. This is legitimate information:
       * the game has just revealed the sunk ship.
       */
      if (
        ship?.isSunk()
      ) {
        this.sunkShips.add(
          ship.name
        );

        for (
          const position of
          ship.positions
        ) {
          this.sunkPositions.add(
            this.getKey({
              row:
                position.row,
              column:
                position.column
            })
          );
        }

        /*
         * Remove only the hits belonging to the ship
         * that was just sunk.
         *
         * Other unresolved hits may belong to another
         * ship and must remain known.
         */
        this.hits =
          this.hits.filter(
            (hit) =>
              !ship.positions.some(
                (position) =>
                  position.row ===
                    hit.row &&
                  position.column ===
                    hit.column
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

  /**
   * Chooses the highest-probability shot.
   *
   * The probability map is recalculated after every shot,
   * so the AI continuously updates its understanding of
   * the enemy fleet.
   */
  private getNextShot(): Shot {
    const probabilityMap =
      this.createProbabilityMap();

    let highestScore = -1;

    let bestShots: Shot[] = [];

    for (
      const shot of
      this.availableShots
    ) {
      const score =
        probabilityMap[
          shot.row
        ][shot.column];

      if (
        score >
        highestScore
      ) {
        highestScore = score;

        bestShots = [
          shot
        ];
      } else if (
        score ===
        highestScore
      ) {
        bestShots.push(
          shot
        );
      }
    }

    /*
     * There should always be at least one available shot,
     * but keep the fallback for safety.
     */
    const pool =
      bestShots.length > 0
        ? bestShots
        : this.availableShots;

    const index =
      Math.floor(
        Math.random() *
          pool.length
      );

    const shot =
      pool[index];

    this.removeAvailableShot(
      shot
    );

    return shot;
  }

  /**
   * Builds the probability map by testing every possible
   * placement of every ship that has not been sunk.
   */
  private createProbabilityMap(): number[][] {
    const probabilityMap =
      Array.from(
        {
          length:
            this.boardSize
        },
        () =>
          Array(
            this.boardSize
          ).fill(0)
      );

    const remainingShips =
      this.fleet.filter(
        (ship) =>
          !this.sunkShips.has(
            ship.name
          )
      );

    for (
      const ship of
      remainingShips
    ) {
      this.addShipProbabilities(
        ship.size,
        probabilityMap
      );
    }

    return probabilityMap;
  }

  /**
   * Tries every possible horizontal and vertical placement
   * for a ship.
   */
  private addShipProbabilities(
    shipSize: number,
    probabilityMap: number[][]
  ): void {
    for (
      let row = 0;
      row < this.boardSize;
      row++
    ) {
      for (
        let column = 0;
        column < this.boardSize;
        column++
      ) {
        this.addPlacementProbability(
          row,
          column,
          shipSize,
          'horizontal',
          probabilityMap
        );

        this.addPlacementProbability(
          row,
          column,
          shipSize,
          'vertical',
          probabilityMap
        );
      }
    }
  }

  /**
   * Adds the probability contribution of one possible
   * ship placement.
   */
  private addPlacementProbability(
    row: number,
    column: number,
    shipSize: number,
    direction: Direction,
    probabilityMap: number[][]
  ): void {
    const positions: Shot[] = [];

    for (
      let i = 0;
      i < shipSize;
      i++
    ) {
      const position: Shot = {
        row:
          direction ===
          'horizontal'
            ? row
            : row + i,

        column:
          direction ===
          'horizontal'
            ? column + i
            : column
      };

      /*
       * The ship would leave the board.
       */
      if (
        !this.isInsideBoard(
          position
        )
      ) {
        return;
      }

      positions.push(
        position
      );
    }

    /*
     * A possible ship cannot occupy a known miss.
     */
    const containsMiss =
      positions.some(
        (position) =>
          this.misses.has(
            this.getKey(
              position
            )
          )
      );

    if (containsMiss) {
      return;
    }

    /*
     * A possible remaining ship cannot overlap a ship
     * that we already know has been sunk.
     */
    const overlapsSunkShip =
      positions.some(
        (position) =>
          this.sunkPositions.has(
            this.getKey(
              position
            )
          )
      );

    if (overlapsSunkShip) {
      return;
    }

    /*
     * Count how many unresolved hits this placement
     * explains.
     */
    const matchingHits =
      positions.filter(
        (position) =>
          this.hits.some(
            (hit) =>
              hit.row ===
                position.row &&
              hit.column ===
                position.column
          )
      );

    /*
     * Normal placement:
     * every cell gets one point.
     */
    for (
      const position of
      positions
    ) {
      probabilityMap[
        position.row
      ][position.column] += 1;
    }

    /*
     * If the placement explains known hits, give it a
     * very large bonus.
     *
     * This makes the AI aggressively investigate around
     * successful hits instead of continuing random search.
     */
    if (
      matchingHits.length > 0
    ) {
      const hitBonus =
        25 *
        matchingHits.length;

      for (
        const position of
        positions
      ) {
        probabilityMap[
          position.row
        ][position.column] +=
          hitBonus;
      }
    }

    /*
     * Additional bonus when the placement explains
     * multiple known hits simultaneously.
     *
     * Example:
     *
     *   X X X
     *
     * A ship placement covering all three X cells is
     * much more likely than one covering only one of them.
     */
    if (
      matchingHits.length >= 2
    ) {
      const connectedHitBonus =
        matchingHits.length *
        matchingHits.length *
        10;

      for (
        const position of
        positions
      ) {
        probabilityMap[
          position.row
        ][position.column] +=
          connectedHitBonus;
      }
    }
  }

  /**
   * Creates the initial list of all 100 cells.
   */
  private createShotList(): void {
    this.availableShots = [];

    for (
      let row = 0;
      row < this.boardSize;
      row++
    ) {
      for (
        let column = 0;
        column < this.boardSize;
        column++
      ) {
        this.availableShots.push({
          row,
          column
        });
      }
    }
  }

  private removeAvailableShot(
    shot: Shot
  ): void {
    const index =
      this.availableShots.findIndex(
        (availableShot) =>
          availableShot.row ===
            shot.row &&
          availableShot.column ===
            shot.column
      );

    if (
      index !== -1
    ) {
      this.availableShots.splice(
        index,
        1
      );
    }
  }

  private getKey(
    shot: Shot
  ): string {
    return `${shot.row},${shot.column}`;
  }

  private isInsideBoard(
    shot: Shot
  ): boolean {
    return (
      shot.row >= 0 &&
      shot.row <
        this.boardSize &&
      shot.column >= 0 &&
      shot.column <
        this.boardSize
    );
  }
}

