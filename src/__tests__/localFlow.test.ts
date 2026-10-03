// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest';

import indexHtml from '../../index.html?raw';

const flush = async () => {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
  }
};

const $ = <T extends Element>(selector: string) =>
  document.querySelector<T>(selector)!;

const status = () => $('#turn-status').textContent ?? '';

const visible = (selector: string) => !$<HTMLElement>(selector).hidden;

function cell(boardSelector: string, row: number, column: number) {
  return document.querySelectorAll<HTMLButtonElement>(
    `${boardSelector} .cell`
  )[row * 10 + column];
}

/** Places the 5 ships horizontally on rows 0..4, column 0. */
async function placeFleet() {
  for (let row = 0; row < 5; row++) {
    $<HTMLButtonElement>('#player-fleet .fleet-ship.selectable').click();
    cell('#player-board', row, 0).click();
  }
  await flush();
}

const SHIP_SIZES = [5, 4, 3, 3, 2];

describe('local multiplayer through the real UI', () => {
  beforeAll(async () => {
    document.body.innerHTML = /<body>([\s\S]*?)<script/.exec(indexHtml)![1];

    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => cb());

    await import('../main');
  });

  it('plays a full hot-seat game: placement, hand-offs, hits, misses, win', async () => {
    vi.useFakeTimers();

    $<HTMLButtonElement>('#mode-local').click();
    expect(status()).toContain('Player 1');

    // --- Player 1 places, must CONFIRM (no more auto-advance) ---
    await placeFleet();
    expect(visible('#game-screen')).toBe(true);
    expect($('#new-game').textContent).toContain('Pass Device');
    $<HTMLButtonElement>('#new-game').click();

    // hand-off screen, mode menu is NOT destroyed
    expect(visible('#pass-device-screen')).toBe(true);
    expect(document.querySelector('#mode-ai')).not.toBeNull();
    $<HTMLButtonElement>('#continue-local').click();

    // --- Player 2 places and starts the battle ---
    expect(status()).toContain('Player 2');
    await placeFleet();
    $<HTMLButtonElement>('#new-game').click();
    await flush();

    // battle-start -> hand-off to Player 1 (first mover)
    expect(visible('#pass-device-screen')).toBe(true);
    $<HTMLButtonElement>('#continue-local').click();
    expect(status()).toBe('Player 1 — Your turn');

    // enemy board is fog of war: no ship/hit/miss info before shooting
    const enemyCells = [...document.querySelectorAll('#enemy-board .cell')];
    expect(enemyCells.every((c) => !c.classList.contains('ship'))).toBe(true);
    expect(enemyCells.every((c) => !c.classList.contains('hit'))).toBe(true);

    // --- HIT keeps the turn (this deadlocked before) ---
    cell('#enemy-board', 0, 0).click();
    await flush();
    expect(status()).toBe('Hit! Shoot again.');
    expect(cell('#enemy-board', 0, 0).classList.contains('hit')).toBe(true);
    expect(document.querySelectorAll('#enemy-board .cell.available').length).toBeGreaterThan(0);

    // --- MISS hands the device over, on a hand-off screen ---
    cell('#enemy-board', 9, 9).click();
    await flush();
    expect(status()).toContain('Miss!');
    expect(visible('#game-screen')).toBe(true); // shooter still sees the result

    vi.advanceTimersByTime(1000);
    expect(visible('#pass-device-screen')).toBe(true);
    expect(visible('#game-screen')).toBe(false); // P2's fleet not shown yet
    $<HTMLButtonElement>('#continue-local').click();

    expect(status()).toBe('Player 2 — Your turn');
    // P2 sees where P1 missed on their own board
    expect(cell('#player-board', 9, 9).classList.contains('miss')).toBe(true);
    // and P1's hit on (0,0)
    expect(cell('#player-board', 0, 0).classList.contains('hit')).toBe(true);

    // P2 misses -> back to P1
    cell('#enemy-board', 8, 8).click();
    await flush();
    vi.advanceTimersByTime(1000);
    $<HTMLButtonElement>('#continue-local').click();
    expect(status()).toBe('Player 1 — Your turn');

    // --- P1 sinks the whole enemy fleet keeping the turn on every hit ---
    for (const [row, size] of SHIP_SIZES.entries()) {
      for (let column = 0; column < size; column++) {
        if (row === 0 && column === 0) continue; // already hit

        cell('#enemy-board', row, column).click();
        await flush(); // wait for the defender's reply, like a real player would
      }
    }

    expect(status()).toBe('Player 1 wins!');
    expect($('#new-game').textContent).toBe('New Game');
    expect(document.querySelectorAll('#enemy-board .cell.available').length).toBe(0);

    vi.useRealTimers();
  });

  it('New Game starts a fresh session with no leftovers', async () => {
    $<HTMLButtonElement>('#new-game').click();
    await flush();

    expect(status()).toContain('Player 1');
    expect(document.querySelectorAll('#player-board .cell.ship').length).toBe(0);
    expect(document.querySelectorAll('#enemy-board .cell.hit').length).toBe(0);
  });
});
