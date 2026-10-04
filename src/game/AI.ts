import { Board } from './Board';

import { STANDARD_FLEET } from './fleet';

import type {
  Opponent,
  ShotResult
} from './Opponent';

type Shot = {
  row: number;
  column: number;
};

/**
 * What the AI knows about a cell. It is built only from public
 * information (shots already fired and ships already announced as sunk),
 * never from where unsunk ships really are.
 */
type Knowledge =
  | 'unknown'
  | 'miss'
  | 'hit'
  | 'sunk';

/**
 * Probability-density AI.
 *
 * On every turn it counts, for each ship still afloat, every position
 * where that ship could still fit given the shots so far, and fires at
 * the cell that appears in the most of them.
 *
 * - Hunting (no open hits): the density naturally favours the centre
 *   and a checkerboard spaced to the smallest ship left.
 * - Targeting (open hits): only placements that cover an unsunk hit
 *   count, and placements covering several hits weigh much more, so it
 *   follows a line and finishes it from both ends.
 * - A sunk ship's cells are removed from the picture, so hits that
 *   belong to a neighbouring ship stay open and are pursued next.
 *
 * The AI keeps no state between shots: it re-reads the board each turn,
 * so it always stays in sync with the game.
 */
export class AI implements Opponent {
  private boardSize: number;

  private fleetSizes: number[];

  constructor(
    boardSize: number,
    fleetSizes: number[] = STANDARD_FLEET.map(
      (ship) => ship.size
    )
  ) {
    this.boardSize = boardSize;

    this.fleetSizes = [...fleetSizes];
  }

  shoot(board: Board): ShotResult {
    const shot = this.chooseShot(board);

    const result = board.shoot(
      shot.row,
      shot.column
    );

    if (result === 'already-shot') {
      // Should be unreachable; stay safe instead of looping forever.
      const fallback = this.firstUnknownCell(board);

      const fallbackResult = board.shoot(
        fallback.row,
        fallback.column
      );

      return {
        row: fallback.row,
        column: fallback.column,
        result:
          fallbackResult === 'hit'
            ? 'hit'
            : 'miss'
      };
    }

    return {
      row: shot.row,
      column: shot.column,
      result
    };
  }

  private chooseShot(board: Board): Shot {
    const knowledge = this.readKnowledge(board);

    const remaining = this.remainingSizes(board);

    const hasOpenHits = knowledge.some((line) =>
      line.includes('hit')
    );

    let weights = this.computeWeights(
      knowledge,
      remaining,
      hasOpenHits
    );

    let best = this.bestCells(knowledge, weights);

    if (best.length === 0 && hasOpenHits) {
      // Open hits that no remaining ship can explain: ignore them.
      weights = this.computeWeights(
        knowledge,
        remaining,
        false
      );

      best = this.bestCells(knowledge, weights);
    }

    if (best.length === 0) {
      return this.firstUnknownCell(board);
    }

    return best[
      Math.floor(Math.random() * best.length)
    ];
  }

  private readKnowledge(
    board: Board
  ): Knowledge[][] {
    const knowledge: Knowledge[][] = Array.from(
      { length: this.boardSize },
      (_, row) =>
        Array.from(
          { length: this.boardSize },
          (_, column): Knowledge => {
            const cell = board.getCell(row, column);

            if (cell === 'hit') {
              return 'hit';
            }

            if (cell === 'miss') {
              return 'miss';
            }

            // 'empty' and 'ship' look the same from here.
            return 'unknown';
          }
        )
    );

    for (const ship of board.getShips()) {
      if (!ship.isSunk()) {
        continue;
      }

      for (const position of ship.positions) {
        knowledge[position.row][position.column] =
          'sunk';
      }
    }

    return knowledge;
  }

  private remainingSizes(board: Board): number[] {
    const remaining = [...this.fleetSizes];

    for (const ship of board.getShips()) {
      if (!ship.isSunk()) {
        continue;
      }

      const index = remaining.indexOf(ship.size);

      if (index !== -1) {
        remaining.splice(index, 1);
      }
    }

    return remaining;
  }

  private computeWeights(
    knowledge: Knowledge[][],
    sizes: number[],
    requireHit: boolean
  ): number[][] {
    const weights = Array.from(
      { length: this.boardSize },
      () =>
        Array<number>(this.boardSize).fill(0)
    );

    for (const size of sizes) {
      for (const horizontal of [true, false]) {
        const maxRow = horizontal
          ? this.boardSize
          : this.boardSize - size + 1;

        const maxColumn = horizontal
          ? this.boardSize - size + 1
          : this.boardSize;

        for (let row = 0; row < maxRow; row++) {
          for (
            let column = 0;
            column < maxColumn;
            column++
          ) {
            this.addPlacement(
              knowledge,
              weights,
              { row, column },
              size,
              horizontal,
              requireHit
            );
          }
        }
      }
    }

    return weights;
  }

  private addPlacement(
    knowledge: Knowledge[][],
    weights: number[][],
    start: Shot,
    size: number,
    horizontal: boolean,
    requireHit: boolean
  ): void {
    const cells: Shot[] = [];

    let coveredHits = 0;

    for (let i = 0; i < size; i++) {
      const row = horizontal
        ? start.row
        : start.row + i;

      const column = horizontal
        ? start.column + i
        : start.column;

      const state = knowledge[row][column];

      if (state === 'miss' || state === 'sunk') {
        return;
      }

      if (state === 'hit') {
        coveredHits++;
      }

      cells.push({ row, column });
    }

    if (requireHit && coveredHits === 0) {
      return;
    }

    // Covering more open hits is far more likely than covering one.
    const weight =
      requireHit
        ? 4 ** (coveredHits - 1)
        : 1;

    for (const cell of cells) {
      if (
        knowledge[cell.row][cell.column] ===
        'unknown'
      ) {
        weights[cell.row][cell.column] += weight;
      }
    }
  }

  private bestCells(
    knowledge: Knowledge[][],
    weights: number[][]
  ): Shot[] {
    let best = 0;

    let cells: Shot[] = [];

    for (let row = 0; row < this.boardSize; row++) {
      for (
        let column = 0;
        column < this.boardSize;
        column++
      ) {
        if (knowledge[row][column] !== 'unknown') {
          continue;
        }

        const weight = weights[row][column];

        if (weight <= 0) {
          continue;
        }

        if (weight > best) {
          best = weight;

          cells = [{ row, column }];
        } else if (weight === best) {
          cells.push({ row, column });
        }
      }
    }

    return cells;
  }

  private firstUnknownCell(board: Board): Shot {
    for (let row = 0; row < this.boardSize; row++) {
      for (
        let column = 0;
        column < this.boardSize;
        column++
      ) {
        const cell = board.getCell(row, column);

        if (cell !== 'hit' && cell !== 'miss') {
          return { row, column };
        }
      }
    }

    throw new Error('The AI has no cells left to shoot at.');
  }
}