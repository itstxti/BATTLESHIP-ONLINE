import { afterEach, describe, expect, it, vi } from 'vitest';

import { AI } from '../AI';
import { Board } from '../Board';
import { Ship, type ShipName } from '../Ship';

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

type Cell = { row: number; column: number };

const SHIP_SIZES: Record<ShipName, number> = {
  Carrier: 5,
  Battleship: 4,
  Cruiser: 3,
  Submarine: 3,
  Destroyer: 2
};

const distance = (a: Cell, b: Cell): number =>
  Math.abs(a.row - b.row) + Math.abs(a.column - b.column);

/** Small deterministic PRNG, so a failing seed can be replayed. */
function mulberry32(seed: number): () => number {
  let state = seed;

  return () => {
    state = (state + 0x6d2b79f5) | 0;

    let t = Math.imul(state ^ (state >>> 15), 1 | state);

    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Every seed replays the same game; the scenarios below hold for all. */
const SEEDS = Array.from({ length: 100 }, (_, index) => index + 1);

/**
 * The AI only knows what its own shots revealed, so a scenario cannot be
 * staged by shooting the board behind its back. Instead this stand-in for
 * the player's board decides, shot by shot, what the AI's own choices hit:
 * `script[n]` is the ship the n-th shot hits, or null for a miss.
 *
 * Ships are built from the cells actually hit, so a ship is sunk as soon
 * as it has been hit `size` times. The cells need not form a legal ship:
 * the AI only relies on the hit/miss and sunk information it is given.
 */
function scriptedBoard(script: (ShipName | null)[]): {
  board: Board;
  fired: Cell[];
} {
  const fired: Cell[] = [];
  const ships = new Map<ShipName, Ship>();
  const shipAt = new Map<string, Ship>();

  const board = {
    size: 10,

    shoot(row: number, column: number) {
      const key = `${row},${column}`;

      if (shipAt.has(key) || fired.some((cell) => cell.row === row && cell.column === column)) {
        throw new Error(`The AI fired twice at ${key}`);
      }

      if (fired.length >= script.length) {
        throw new Error('The AI fired more shots than the scenario scripts');
      }

      const name = script[fired.length];

      fired.push({ row, column });

      if (name === null) {
        return 'miss';
      }

      let ship = ships.get(name);

      if (!ship) {
        ship = new Ship(name, SHIP_SIZES[name], []);
        ships.set(name, ship);
      }

      ship.positions.push({ row, column });
      ship.hit(row, column);
      shipAt.set(key, ship);

      return 'hit';
    },

    getShipAt(row: number, column: number) {
      return shipAt.get(`${row},${column}`);
    }
  };

  return { board: board as unknown as Board, fired };
}

describe('AI', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  it('follows a line after two hits', () => {
    for (const seed of SEEDS) {
      vi.spyOn(Math, 'random').mockImplementation(mulberry32(seed));

      // The AI hits twice (a ship it has not sunk), then fires a third time.
      const { board, fired } = scriptedBoard(['Carrier', 'Carrier', null]);
      const ai = new AI(board.size);

      ai.shoot(board);
      ai.shoot(board);
      ai.shoot(board);

      const [first, second, third] = fired;
      const note = `seed ${seed}`;

      // After one hit it probes right next to it...
      expect(distance(first, second), note).toBe(1);

      // ...and after two it extends that line at either end.
      if (first.row === second.row) {
        const columns = [first.column, second.column];

        expect(third.row, note).toBe(first.row);
        expect(
          [Math.min(...columns) - 1, Math.max(...columns) + 1],
          note
        ).toContain(third.column);
      } else {
        const rows = [first.row, second.row];

        expect(third.column, note).toBe(first.column);
        expect([Math.min(...rows) - 1, Math.max(...rows) + 1], note).toContain(
          third.row
        );
      }

      vi.restoreAllMocks();
    }
  });

  it('keeps chasing hits of a neighbouring ship after one ship sinks', () => {
    // Some early misses first: they pull the AI's hunting area away from the
    // hit below, so going back to hunting could not land next to it by luck.
    const warmUp = Array<null>(8).fill(null);

    for (const seed of SEEDS) {
      vi.spyOn(Math, 'random').mockImplementation(mulberry32(seed));

      // The first hit is on the Cruiser and stays open while the next two
      // sink the Destroyer. The shot after that is the one under test.
      const script: (ShipName | null)[] = [
        ...warmUp,
        'Cruiser',
        'Destroyer',
        'Destroyer',
        null
      ];
      const { board, fired } = scriptedBoard(script);
      const ai = new AI(board.size);

      for (let shot = 0; shot < script.length; shot++) {
        ai.shoot(board);
      }

      const openHit = fired[warmUp.length];
      const nextShot = fired[script.length - 1];

      // Sinking the Destroyer forgets only its own hits: the Cruiser's open
      // hit still drives the next shot to a cell right next to it, instead
      // of going back to hunting.
      expect(distance(nextShot, openHit), `seed ${seed}`).toBe(1);

      vi.restoreAllMocks();
    }
  });
});
