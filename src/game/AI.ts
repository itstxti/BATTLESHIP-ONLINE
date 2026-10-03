import { Board } from './Board';

import type {
  Opponent,
  ShotResult
} from './Opponent';

type Shot = {
  row: number;
  column: number;
};

export class AI implements Opponent {
  private availableShots: Shot[] = [];

  private targetShots: Shot[] = [];

  private hits: Shot[] = [];

  private boardSize: number;

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
    const shot =
      this.getNextShot();

    const result =
      board.shoot(
        shot.row,
        shot.column
      );

    if (
      result === 'already-shot'
    ) {
      return this.shoot(board);
    }

    if (
      result === 'hit'
    ) {
      const ship =
        board.getShipAt(
          shot.row,
          shot.column
        );

      this.hits.push(
        shot
      );

      if (
        ship?.isSunk()
      ) {
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
    if (
      this.targetShots.length > 0
    ) {
      const shot =
        this.targetShots.shift()!;

      this.removeAvailableShot(
        shot
      );

      return shot;
    }

    const preferredShots =
      this.availableShots.filter(
        (shot) =>
          (shot.row +
            shot.column) %
            2 ===
          0
      );

    const pool =
      preferredShots.length > 0
        ? preferredShots
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

  private updateTargets(): void {
    if (
      this.hits.length === 1
    ) {
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
      this.addTarget(
        target
      );
    }
  }

  private addTarget(
    target: Shot
  ): void {
    if (
      !this.isInsideBoard(
        target
      )
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

    if (
      alreadyTargeted
    ) {
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
}

