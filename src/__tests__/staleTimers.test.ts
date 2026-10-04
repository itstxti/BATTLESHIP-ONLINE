// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import indexHtml from '../../index.html?raw';

import { AI } from '../game/AI';
import { STANDARD_FLEET } from '../game/fleet';
import { Board } from '../game/Board';

/*
 * Regression: starting a new game (or leaving to the menu) while the AI's
 * turn was pending used to leave the old match's timers running. They kept
 * firing shots, redrawing the old boards over the new game, overwriting the
 * status line and re-arming the old game's click handlers.
 */

const AI_DELAY_MS = 700;

const flush = async () => {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
  }
};

const $ = <T extends Element>(selector: string) =>
  document.querySelector<T>(selector)!;

const status = () => $('#turn-status').textContent ?? '';

const click = (selector: string) => $<HTMLButtonElement>(selector).click();

const count = (selector: string) => document.querySelectorAll(selector).length;

function cell(boardSelector: string, row: number, column: number) {
  return document.querySelectorAll<HTMLButtonElement>(
    `${boardSelector} .cell`
  )[row * 10 + column];
}

async function placeFleet() {
  for (let row = 0; row < 5; row++) {
    $<HTMLButtonElement>('#player-fleet .fleet-ship.selectable').click();
    cell('#player-board', row, 0).click();
  }
  await flush();
}

/** What the scripted AI does on each of its shots. */
let aiScript: ('hit' | 'miss')[] = [];

let aiShoot: ReturnType<typeof vi.spyOn>;

function scriptAI(...script: ('hit' | 'miss')[]) {
  aiScript = script;
  aiShoot.mockClear();
}

describe('abandoned Solo matches do not leave timers running', () => {
  beforeAll(async () => {
    document.body.innerHTML = /<body>([\s\S]*?)<script/.exec(indexHtml)![1];

    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => cb());

    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() =>
      Promise.resolve()
    );
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});

    // The enemy fleet is random; pin it to rows 0..4 so (9,9) is always water.
    vi.spyOn(Board.prototype, 'placeFleetRandomly').mockImplementation(
      function (this: Board) {
        STANDARD_FLEET.forEach((ship, row) => {
          this.placeShip(
            ship.name,
            ship.size,
            Array.from({ length: ship.size }, (_, column) => ({ row, column }))
          );
        });
      }
    );

    // Shots land on the player's fleet (rows 0..4) or on empty water.
    aiShoot = vi
      .spyOn(AI.prototype, 'shoot')
      .mockImplementation(function (this: AI, board: Board) {
        const wanted = aiScript.shift() ?? 'miss';

        const target =
          wanted === 'hit'
            ? board
                .getShips()
                .flatMap((ship) => ship.positions)
                .find(({ row, column }) => board.getCell(row, column) === 'ship')
            : undefined;

        const position = target ?? {
          row: 9,
          column: 9 - aiShoot.mock.calls.length
        };

        board.shoot(position.row, position.column);

        return { ...position, result: wanted === 'hit' ? 'hit' : 'miss' };
      } as never);

    await import('../main');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Starts a Solo battle and misses once, so the AI's turn is pending. */
  async function startBattleAndHandOverToAI() {
    vi.useFakeTimers();

    click('#mode-ai');
    await placeFleet();
    click('#new-game'); // Start Battle

    cell('#enemy-board', 9, 9).click(); // miss: the AI answers in 700 ms

    expect(status()).toBe('Miss! Enemy turn...');
  }

  it('New Game while the AI is about to shoot: the old AI never fires', async () => {
    scriptAI('miss');
    await startBattleAndHandOverToAI();

    click('#new-game'); // restart before the AI's 700 ms are up

    expect(status()).toBe('Place your fleet');

    vi.advanceTimersByTime(AI_DELAY_MS * 10);

    expect(aiShoot).not.toHaveBeenCalled();
    expect(status()).toBe('Place your fleet');
    expect(count('#player-board .cell.hit, #player-board .cell.miss')).toBe(0);
  });

  it('New Game while the AI is mid hit-chain: the chain stops', async () => {
    scriptAI('hit', 'hit', 'hit');
    await startBattleAndHandOverToAI();

    vi.advanceTimersByTime(AI_DELAY_MS); // first AI shot: a hit
    expect(aiShoot).toHaveBeenCalledTimes(1);
    expect(status()).toBe('Enemy hit!');

    click('#new-game'); // the chained second shot is now pending

    vi.advanceTimersByTime(AI_DELAY_MS * 10);

    expect(aiShoot).toHaveBeenCalledTimes(1);
    expect(status()).toBe('Place your fleet');
    expect(count('#player-board .cell.hit')).toBe(0);
  });

  it('New Game just before the turn returns to the player: no stale turn', async () => {
    scriptAI('miss');
    await startBattleAndHandOverToAI();

    vi.advanceTimersByTime(AI_DELAY_MS); // the AI misses
    expect(status()).toBe('Enemy missed! Your turn');

    click('#new-game'); // the "your turn" hand-back timer is pending

    vi.advanceTimersByTime(AI_DELAY_MS * 10);

    // Used to flip to "Your turn" and arm the old game's click handlers.
    expect(status()).toBe('Place your fleet');
    expect(count('#enemy-board .cell.available')).toBe(0);
  });

  it('Back to the menu mid-turn: the abandoned match goes quiet', async () => {
    scriptAI('hit', 'hit', 'hit');
    await startBattleAndHandOverToAI();

    vi.advanceTimersByTime(AI_DELAY_MS); // one hit lands, a chained shot pends
    expect(aiShoot).toHaveBeenCalledTimes(1);

    click('#back-to-menu');

    vi.advanceTimersByTime(AI_DELAY_MS * 10);

    expect(aiShoot).toHaveBeenCalledTimes(1);
  });

  it('a match started right after an abandoned one plays normally', async () => {
    scriptAI('miss');
    await startBattleAndHandOverToAI();

    click('#new-game'); // abandon, then play the new match for real

    await placeFleet();
    click('#new-game'); // Start Battle

    expect(status()).toBe('Your turn');

    scriptAI('miss'); // reset the call count for the new match
    cell('#enemy-board', 9, 9).click();

    vi.advanceTimersByTime(AI_DELAY_MS);

    expect(aiShoot).toHaveBeenCalledTimes(1);
    expect(status()).toBe('Enemy missed! Your turn');

    vi.advanceTimersByTime(AI_DELAY_MS);

    expect(status()).toBe('Your turn');
    expect(count('#enemy-board .cell.available')).toBeGreaterThan(0);
    expect(STANDARD_FLEET.length).toBe(5);
  });
});
