import { describe, expect, it } from 'vitest';

import { AI } from '../AI';
import { Board } from '../Board';

function playGame(): { shots: number; cells: Set<string> } {
  const board = new Board();

  board.placeFleetRandomly();

  const ai = new AI(board.size);

  const cells = new Set<string>();

  let shots = 0;

  while (!board.allShipsSunk()) {
    const shot = ai.shoot(board);

    cells.add(`${shot.row},${shot.column}`);

    shots++;

    if (shots > 100) {
      break;
    }
  }

  return { shots, cells };
}

describe('AI', () => {
  it('never fires at the same cell twice and always finishes the game', () => {
    for (let game = 0; game < 50; game++) {
      const { shots, cells } = playGame();

      expect(shots).toBeLessThanOrEqual(100);
      expect(cells.size).toBe(shots);
    }
  });

  it('is clearly better than a random shooter', () => {
    const games = 200;

    let total = 0;

    for (let game = 0; game < games; game++) {
      total += playGame().shots;
    }

    // Pure random needs ~95 shots, a parity hunter ~65.
    expect(total / games).toBeLessThan(58);
  });

  it('follows a line after two hits and finishes the ship', () => {
    const board = new Board();

    board.placeShip('Destroyer', 2, [
      { row: 4, column: 4 },
      { row: 4, column: 5 }
    ]);
    board.placeShip('Carrier', 5, [
      { row: 0, column: 0 },
      { row: 0, column: 1 },
      { row: 0, column: 2 },
      { row: 0, column: 3 },
      { row: 0, column: 4 }
    ]);

    const ai = new AI(board.size);

    // Two open hits in a row on the carrier: the next shot must extend it.
    board.shoot(0, 1);
    board.shoot(0, 2);

    const shot = ai.shoot(board);

    expect(shot.row).toBe(0);
    expect([0, 3]).toContain(shot.column);
    expect(shot.result).toBe('hit');
  });

  it('keeps chasing hits of a neighbouring ship after one ship sinks', () => {
    const board = new Board();

    board.placeShip('Destroyer', 2, [
      { row: 5, column: 0 },
      { row: 5, column: 1 }
    ]);
    board.placeShip('Cruiser', 3, [
      { row: 5, column: 2 },
      { row: 5, column: 3 },
      { row: 5, column: 4 }
    ]);

    const ai = new AI(board.size);

    // Destroyer sunk; one open hit on the cruiser right next to it.
    board.shoot(5, 0);
    board.shoot(5, 1);
    board.shoot(5, 3);

    const shot = ai.shoot(board);

    const distance =
      Math.abs(shot.row - 5) + Math.abs(shot.column - 3);

    // Orthogonally next to the open hit, not a random hunting shot.
    expect(distance).toBe(1);
  });
});