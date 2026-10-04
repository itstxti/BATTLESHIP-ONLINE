import { Board } from './Board';

import type {
  Opponent,
  ShotResult
} from './Opponent';

type Shot = {
  row: number;
  column: number;
};

type ShipSize = 2 | 3 | 4 | 5;

const FLEET_SIZES: ShipSize[] = [
  5,
  4,
  3,
  3,
  2
];

export class AI implements Opponent {
  private availableShots: Shot[] = [];

  private targetShots: Shot[] = [];

  private hits: Shot[] = [];

  private boardSize: number;

  private remainingShipSizes: ShipSize[] = [
    ...FLEET_SIZES
  ];

  constructor(boardSize: number) {
    this.boardSize = boardSize;

    this.createShotList();
  }

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

  shoot(board: Board): ShotResult {
    const shot = this.getNextShot();

    const result = board.shoot(
      shot.row,
      shot.column
    );

    if (result === 'already-shot') {
      return this.shoot(board);
    }

    if (result === 'hit') {
      const ship = board.getShipAt(
        shot.row,
        shot.column
      );

      this.hits.push(shot);

      if (ship?.isSunk()) {
        this.removeSunkShip(ship);
        this.resetTargeting();
      } else {
        this.updateTargets();
      }
    }

    return {
      row: shot.row,
      column: shot.column,
      result
    };
  }

  private getNextShot(): Shot {
    if (this.targetShots.length > 0) {
      const shot =
        this.targetShots.shift()!;

      this.removeAvailableShot(shot);

      return shot;
    }

    return this.getBestProbabilityShot();
  }

  /**
   * Expert hunt mode.
   *
   * Every possible placement of every remaining ship is evaluated.
   * A cell receives one point every time it belongs to a possible
   * ship placement.
   *
   * The AI then fires at the cell with the highest probability.
   */
  private getBestProbabilityShot(): Shot {
    const scores = new Map<string, number>();

    for (const shipSize of this.remainingShipSizes) {
      this.scoreHorizontalPlacements(
        shipSize,
        scores
      );

      this.scoreVerticalPlacements(
        shipSize,
        scores
      );
    }

    const candidates = this.availableShots.filter(
      (shot) =>
        (scores.get(this.shotKey(shot)) ?? 0) > 0
    );

    const pool =
      candidates.length > 0
        ? candidates
        : this.availableShots;

    let bestScore = -1;
    let bestShots: Shot[] = [];

    for (const shot of pool) {
      const score =
        scores.get(this.shotKey(shot)) ?? 0;

      if (score > bestScore) {
        bestScore = score;
        bestShots = [shot];
      } else if (score === bestScore) {
        bestShots.push(shot);
      }
    }

    const shot =
      bestShots[
        Math.floor(
          Math.random() *
            bestShots.length
        )
      ];

    this.removeAvailableShot(shot);

    return shot;
  }

  private scoreHorizontalPlacements(
    shipSize: number,
    scores: Map<string, number>
  ): void {
    for (
      let row = 0;
      row < this.boardSize;
      row++
    ) {
      for (
        let column = 0;
        column <=
        this.boardSize - shipSize;
        column++
      ) {
        const placement: Shot[] = [];

        let valid = true;

        for (
          let offset = 0;
          offset < shipSize;
          offset++
        ) {
          const shot = {
            row,
            column:
              column + offset
          };

          if (
            !this.isAvailableOrHit(
              shot
            )
          ) {
            valid = false;
            break;
          }

          placement.push(shot);
        }

        if (valid) {
          this.scorePlacement(
            placement,
            scores
          );
        }
      }
    }
  }

  private scoreVerticalPlacements(
    shipSize: number,
    scores: Map<string, number>
  ): void {
    for (
      let row = 0;
      row <=
      this.boardSize - shipSize;
      row++
    ) {
      for (
        let column = 0;
        column < this.boardSize;
        column++
      ) {
        const placement: Shot[] = [];

        let valid = true;

        for (
          let offset = 0;
          offset < shipSize;
          offset++
        ) {
          const shot = {
            row:
              row + offset,
            column
          };

          if (
            !this.isAvailableOrHit(
              shot
            )
          ) {
            valid = false;
            break;
          }

          placement.push(shot);
        }

        if (valid) {
          this.scorePlacement(
            placement,
            scores
          );
        }
      }
    }
  }

  private scorePlacement(
    placement: Shot[],
    scores: Map<string, number>
  ): void {
    /**
     * If we already have a hit that belongs
     * to the current target, strongly prefer
     * placements that contain it.
     */
    const containsKnownHit =
      placement.some((shot) =>
        this.isHit(shot)
      );

    const multiplier =
      this.hits.length > 0
        ? containsKnownHit
          ? 8
          : 1
        : 1;

    for (const shot of placement) {
      const key =
        this.shotKey(shot);

      scores.set(
        key,
        (scores.get(key) ?? 0) +
          multiplier
      );
    }
  }

  private isAvailableOrHit(
    shot: Shot
  ): boolean {
    if (!this.isInsideBoard(shot)) {
      return false;
    }

    if (this.isHit(shot)) {
      return true;
    }

    return this.availableShots.some(
      (availableShot) =>
        availableShot.row ===
          shot.row &&
        availableShot.column ===
          shot.column
    );
  }

  private isHit(
    shot: Shot
  ): boolean {
    return this.hits.some(
      (hit) =>
        hit.row === shot.row &&
        hit.column === shot.column
    );
  }

  private updateTargets(): void {
    if (this.hits.length === 1) {
      this.addAdjacentTargets(
        this.hits[0]
      );

      return;
    }

    const sameRow =
      this.hits.every(
        (hit) =>
          hit.row ===
          this.hits[0].row
      );

    const sameColumn =
      this.hits.every(
        (hit) =>
          hit.column ===
          this.hits[0].column
      );

    if (sameRow) {
      this.targetShots = [];

      const row =
        this.hits[0].row;

      const columns =
        this.hits.map(
          (hit) =>
            hit.column
        );

      const minColumn =
        Math.min(
          ...columns
        );

      const maxColumn =
        Math.max(
          ...columns
        );

      this.addTarget({
        row,
        column:
          minColumn - 1
      });

      this.addTarget({
        row,
        column:
          maxColumn + 1
      });

      return;
    }

    if (sameColumn) {
      this.targetShots = [];

      const column =
        this.hits[0].column;

      const rows =
        this.hits.map(
          (hit) =>
            hit.row
        );

      const minRow =
        Math.min(
          ...rows
        );

      const maxRow =
        Math.max(
          ...rows
        );

      this.addTarget({
        row:
          minRow - 1,
        column
      });

      this.addTarget({
        row:
          maxRow + 1,
        column
      });
    }
  }

  private addAdjacentTargets(
    shot: Shot
  ): void {
    const directions: Shot[] = [
      {
        row:
          shot.row - 1,
        column:
          shot.column
      },
      {
        row:
          shot.row + 1,
        column:
          shot.column
      },
      {
        row:
          shot.row,
        column:
          shot.column - 1
      },
      {
        row:
          shot.row,
        column:
          shot.column + 1
      }
    ];

    directions.sort(
      () =>
        Math.random() -
        0.5
    );

    for (
      const target of directions
    ) {
      this.addTarget(target);
    }
  }

  private addTarget(
    target: Shot
  ): void {
    if (
      !this.isInsideBoard(target)
    ) {
      return;
    }

    const isAvailable =
      this.availableShots.some(
        (shot) =>
          shot.row ===
            target.row &&
          shot.column ===
            target.column
      );

    if (!isAvailable) {
      return;
    }

    const alreadyTargeted =
      this.targetShots.some(
        (shot) =>
          shot.row ===
            target.row &&
          shot.column ===
            target.column
      );

    if (alreadyTargeted) {
      return;
    }

    this.targetShots.push(
      target
    );
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

    if (index !== -1) {
      this.availableShots.splice(
        index,
        1
      );
    }
  }

  private removeSunkShip(
    ship: unknown
  ): void {
    /**
     * Ship implementations commonly expose
     * their size as `size` or `length`.
     *
     * If neither exists, the fleet remains
     * unchanged and targeting still works.
     */
    const candidate =
      ship as {
        size?: number;
        length?: number;
      };

    const size =
      candidate.size ??
      candidate.length;

    if (
      size !== 2 &&
      size !== 3 &&
      size !== 4 &&
      size !== 5
    ) {
      return;
    }

    const index =
      this.remainingShipSizes.indexOf(
        size
      );

    if (index !== -1) {
      this.remainingShipSizes.splice(
        index,
        1
      );
    }
  }

  private resetTargeting(): void {
    this.targetShots = [];

    this.hits = [];
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

  private shotKey(
    shot: Shot
  ): string {
    return `${shot.row}:${shot.column}`;
  }
}