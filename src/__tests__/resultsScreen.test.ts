// @vitest-environment jsdom
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import indexHtml from '../../index.html?raw';

import { audio } from '../audio/audio';
import { AI } from '../game/AI';
import { Board } from '../game/Board';
import { STANDARD_FLEET } from '../game/fleet';
import { LocalGameTransport } from '../game/LocalGameTransport';
import { MultiplayerGame } from '../game/MultiplayerGame';
import type { LobbyHandlers } from '../online/lobbyClient';
import { mountLobbyScreen } from '../online/lobbyScreen';

/*
 * The lobby talks to a real WebSocket relay; here a test double stands in
 * for the opponent and hands the game an in-memory transport instead.
 */
vi.mock('../online/lobbyScreen', () => ({
  mountLobbyScreen: vi.fn(() => () => {})
}));

// Mirrors RESULTS_DELAY_MS in src/main.ts (not exported): keep both in sync.
const RESULTS_DELAY_MS = 750;

const SHIP_SIZES = STANDARD_FLEET.map((ship) => ship.size);

const flush = async () => {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
  }
};

const $ = <T extends Element>(selector: string) =>
  document.querySelector<T>(selector)!;

const status = () => $('#turn-status').textContent ?? '';

const visible = (selector: string) => !$<HTMLElement>(selector).hidden;

const click = (selector: string) => $<HTMLButtonElement>(selector).click();

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

/** The rendered stat rows, e.g. ["17 shots", "17 hits", ...]. */
const resultRows = () =>
  [...document.querySelectorAll('#results-screen .results-stat')].map(
    (item) => (item.textContent ?? '').trim() // the duration row has no label
  );

const headline = () => $('#results-screen .results-headline').textContent;

const detail = () => $('#results-screen .results-detail').textContent;

/** Fires at every enemy ship cell, skipping the ones already hit. */
async function sinkEnemyFleet(alreadyHit: [number, number][] = []) {
  for (const [row, size] of SHIP_SIZES.entries()) {
    for (let column = 0; column < size; column++) {
      if (alreadyHit.some(([r, c]) => r === row && c === column)) {
        continue;
      }

      cell('#enemy-board', row, column).click();
      await flush(); // wait for the defender's reply, like a real player
    }
  }
}

/** Deterministic clock; the code under test reads performance.now(). */
let clock = 0;

function fixedBoard(): Board {
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

let musicSpy: ReturnType<typeof vi.spyOn>;

let sfxSpy: ReturnType<typeof vi.spyOn>;

/** The win/lose jingles requested so far in the current test. */
const endSounds = () =>
  (sfxSpy.mock.calls as unknown[][])
    .map((call) => call[0])
    .filter((name) => name === 'win' || name === 'lose');

/** The track most recently requested, e.g. "battle" or "menu". */
const currentMusic = () => musicSpy.mock.calls.at(-1)?.[0];

describe('results screen through the real UI', () => {
  const restores: (() => void)[] = [];

  beforeAll(async () => {
    document.body.innerHTML = /<body>([\s\S]*?)<script/.exec(indexHtml)![1];

    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => cb());

    // jsdom does not implement media playback; browsers return a Promise.
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() =>
      Promise.resolve()
    );
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});

    // Solo: the enemy fleet is random; pin it to rows 0..4 like the player's.
    const placement = vi
      .spyOn(Board.prototype, 'placeFleetRandomly')
      .mockImplementation(function (this: Board) {
        STANDARD_FLEET.forEach((ship, row) => {
          this.placeShip(
            ship.name,
            ship.size,
            Array.from({ length: ship.size }, (_, column) => ({
              row,
              column
            }))
          );
        });
      });

    restores.push(() => placement.mockRestore());

    musicSpy = vi.spyOn(audio, 'playMusic');
    sfxSpy = vi.spyOn(audio, 'playSfx');

    await import('../main');
  });

  beforeEach(() => {
    sfxSpy.mockClear();
  });

  afterAll(() => {
    restores.forEach((restore) => restore());
  });

  /* ------------------------------- Solo ------------------------------- */

  describe('Solo', () => {
    it('shows VICTORY with the match summary once the last ship sinks', async () => {
      vi.useFakeTimers();

      const now = vi.spyOn(performance, 'now').mockImplementation(() => clock);

      clock = 1_000;
      click('#mode-ai');
      click('#difficulty-hard');
      await placeFleet();
      click('#new-game'); // Start Battle: the match clock starts here

      clock = 1_000 + 163_000; // 2:43 later
      await sinkEnemyFleet();

      // The final explosion and jingle get to play first.
      expect(status()).toBe('You win!');
      expect(visible('#results-screen')).toBe(false);
      expect(visible('#game-screen')).toBe(true);
      expect(currentMusic()).toBe('battle');
      expect(endSounds()).toEqual([]); // the jingle waits for the results screen

      clock += 60_000; // time spent staring at the delay must not count
      vi.advanceTimersByTime(RESULTS_DELAY_MS - 1);
      expect(visible('#results-screen')).toBe(false);
      expect(currentMusic()).toBe('battle');
      expect(endSounds()).toEqual([]);

      vi.advanceTimersByTime(1);

      expect(visible('#results-screen')).toBe(true);
      expect(visible('#game-screen')).toBe(false);
      expect(currentMusic()).toBe('menu'); // battle theme replaced
      expect(endSounds()).toEqual(['win']); // exactly once
      expect(headline()).toBe('VICTORY');
      expect(detail()).toBe('Enemy fleet destroyed.');
      expect(resultRows()).toEqual([
        '17 shots',
        '17 hits',
        '5 ships sunk',
        '17 hits in a row',
        '100.0% accuracy',
        '0 shots', // the AI never got a turn
        '0 hits',
        '0 ships sunk',
        '0 hits in a row',
        '0.0% accuracy',
        '02:43'
      ]);

      // Screen readers announce the outcome: focus lands on the headline
      // (programmatically focusable only), New Game is one Tab away.
      expect(document.activeElement).toBe($('#results-headline'));
      expect($('#results-headline').getAttribute('tabindex')).toBe('-1');

      now.mockRestore();
      vi.useRealTimers();
    });

    it('New Game on the results screen starts a clean solo match', async () => {
      click('#results-new-game');
      await flush();

      expect(currentMusic()).toBe('menu'); // placement still uses the menu theme

      expect(visible('#results-screen')).toBe(false);
      expect(visible('#game-screen')).toBe(true);
      expect(status()).toBe('Place your fleet');
      expect(document.querySelectorAll('#enemy-board .cell.hit').length).toBe(
        0
      );
      expect(document.querySelectorAll('#player-board .cell.ship').length).toBe(
        0
      );
    });

    it('shows DEFEAT with only the shots that were fired', async () => {
      vi.useFakeTimers();

      const now = vi.spyOn(performance, 'now').mockImplementation(() => clock);

      // The AI sinks the whole player fleet, one hit after another.
      const aiShot = vi
        .spyOn(AI.prototype, 'shoot')
        .mockImplementation(function (this: AI, board: Board) {
          const target = board
            .getShips()
            .flatMap((ship) => ship.positions)
            .find(({ row, column }) => board.getCell(row, column) === 'ship')!;

          board.shoot(target.row, target.column);

          return { ...target, result: 'hit' as const };
        });

      await placeFleet();

      clock = 10_000;
      click('#new-game');

      cell('#enemy-board', 9, 9).click(); // one miss hands the turn to the AI

      clock = 10_000 + 125_000; // 2:05
      vi.advanceTimersByTime(700 * 17); // 17 AI hits

      expect(status()).toBe('You lose!');
      expect(visible('#results-screen')).toBe(false);

      expect(currentMusic()).toBe('battle');
      expect(endSounds()).toEqual([]);

      vi.advanceTimersByTime(RESULTS_DELAY_MS);

      expect(visible('#results-screen')).toBe(true);
      expect(currentMusic()).toBe('menu');
      expect(endSounds()).toEqual(['lose']);
      expect(headline()).toBe('DEFEAT');
      expect(detail()).toBe('Your fleet was sunk.');
      expect(resultRows()).toEqual([
        '1 shot',
        '0 hits',
        '0 ships sunk',
        '0 hits in a row',
        '0.0% accuracy',
        '17 shots',
        '17 hits',
        '5 ships sunk',
        '17 hits in a row', // the AI never missed
        '100.0% accuracy',
        '02:05'
      ]);

      aiShot.mockRestore();
      now.mockRestore();
      vi.useRealTimers();
    });

    it('Back leads to the AI level picker and nothing reappears later', async () => {
      click('#back-to-menu');

      expect(visible('#difficulty-screen')).toBe(true);
      expect(visible('#game-mode-menu')).toBe(false);
      expect(visible('#results-screen')).toBe(false);
      expect(visible('#game-screen')).toBe(false);

      // One more step back reaches the game mode selection.
      click('#back-to-menu');

      expect(visible('#game-mode-menu')).toBe(true);
      expect(visible('#difficulty-screen')).toBe(false);
    });

    it('does not pop up over the menu if the player leaves during the delay', async () => {
      vi.useFakeTimers();

      click('#mode-ai');
      click('#difficulty-hard');
      await placeFleet();
      click('#new-game');
      await sinkEnemyFleet();

      expect(status()).toBe('You win!');

      click('#back-to-menu'); // leaves before the delay elapses
      expect(visible('#difficulty-screen')).toBe(true);

      vi.advanceTimersByTime(RESULTS_DELAY_MS * 2);

      expect(visible('#results-screen')).toBe(false);
      expect(visible('#difficulty-screen')).toBe(true);
      expect(endSounds()).toEqual([]); // no jingle over the menu

      vi.useRealTimers();
    });

    it('does not pop up over a new match started during the delay', async () => {
      vi.useFakeTimers();

      click('#mode-ai');
      click('#difficulty-hard');
      await placeFleet();
      click('#new-game');
      await sinkEnemyFleet();

      expect(status()).toBe('You win!');

      click('#new-game'); // "New Game" on the game screen itself
      expect(status()).toBe('Place your fleet');

      vi.advanceTimersByTime(RESULTS_DELAY_MS * 2);

      expect(visible('#results-screen')).toBe(false);
      expect(visible('#game-screen')).toBe(true);
      expect(status()).toBe('Place your fleet');
      expect(endSounds()).toEqual([]); // no jingle over the new match

      vi.useRealTimers();

      click('#back-to-menu');
    });
  });

  /* ---------------------------- Local multiplayer ---------------------------- */

  describe('Local multiplayer', () => {
    it('shows the winner’s summary after a hot-seat game', async () => {
      vi.useFakeTimers();

      const now = vi.spyOn(performance, 'now').mockImplementation(() => clock);

      click('#mode-local');
      await placeFleet();
      click('#new-game'); // P1 ready, pass the device
      click('#continue-local');

      await placeFleet();

      clock = 5_000;
      click('#new-game'); // P2 starts the battle: the clock starts here
      await flush();

      click('#continue-local'); // hand-off to Player 1
      expect(status()).toBe('Player 1 — Your turn');

      // P1: a miss, handed over to P2, who also misses and hands back.
      cell('#enemy-board', 9, 9).click();
      await flush();
      vi.advanceTimersByTime(1000);
      click('#continue-local');

      cell('#enemy-board', 8, 8).click();
      await flush();
      vi.advanceTimersByTime(1000);
      click('#continue-local');
      expect(status()).toBe('Player 1 — Your turn');

      // P1 sinks the fleet without missing again.
      clock = 5_000 + 61_000; // 1:01
      await sinkEnemyFleet();

      expect(status()).toBe('Player 1 wins!');
      expect(visible('#results-screen')).toBe(false);
      expect(currentMusic()).toBe('battle');
      expect(endSounds()).toEqual([]);

      vi.advanceTimersByTime(RESULTS_DELAY_MS);

      expect(visible('#results-screen')).toBe(true);
      expect(currentMusic()).toBe('menu');
      expect(endSounds()).toEqual(['win']);
      expect(visible('#game-screen')).toBe(false);
      expect(visible('#pass-device-screen')).toBe(false);
      expect(headline()).toBe('VICTORY');
      expect(detail()).toBe('Player 1 destroyed the enemy fleet.');
      expect(
        [...document.querySelectorAll('#results-screen .results-group-title')].map(
          (title) => title.textContent
        )
      ).toEqual(['Player 1', 'Player 2', 'Match duration']);
      expect(resultRows()).toEqual([
        '18 shots', // 1 miss + 17 hits: only Player 1's own shots
        '17 hits',
        '5 ships sunk',
        '17 hits in a row', // the early miss does not break the final run
        '94.4% accuracy',
        '1 shot', // Player 2 fired once, and missed
        '0 hits',
        '0 ships sunk',
        '0 hits in a row',
        '0.0% accuracy',
        '01:01'
      ]);

      now.mockRestore();
      vi.useRealTimers();
    });

    it('New Game restarts the hot-seat flow from Player 1’s placement', async () => {
      click('#results-new-game');
      await flush();

      expect(visible('#results-screen')).toBe(false);
      expect(visible('#game-screen')).toBe(true);
      expect(status()).toBe('Player 1 — Place your fleet');
      expect(document.querySelectorAll('#enemy-board .cell.hit').length).toBe(
        0
      );

      click('#back-to-menu');
    });
  });

  /* ---------------------------- Online multiplayer ---------------------------- */

  describe('Online multiplayer', () => {
    /** Goes through the (mocked) lobby and returns a scripted opponent. */
    function pairWithOpponent(startsFirst: boolean): MultiplayerGame {
      click('#mode-online');

      const calls = vi.mocked(mountLobbyScreen).mock.calls;

      const handlers = calls[calls.length - 1][1] as {
        onMatched: LobbyHandlers['onMatched'];
      };

      const [mine, theirs] = LocalGameTransport.createPair();

      handlers.onMatched({ transport: mine, startsFirst });

      return new MultiplayerGame({
        playerBoard: fixedBoard(),
        enemyBoard: new Board(),
        transport: theirs,
        startsFirst: !startsFirst,
        fleetSize: STANDARD_FLEET.length
      });
    }

    /** Pairs, places both fleets and starts the battle. */
    async function startOnlineBattle(
      startsFirst: boolean
    ): Promise<MultiplayerGame> {
      const peer = pairWithOpponent(startsFirst);

      await placeFleet();
      click('#new-game'); // Ready
      peer.markReady();
      await flush();

      expect(status()).toBe(
        startsFirst ? 'Your turn — fire!' : "Opponent's turn…"
      );

      return peer;
    }

    it('shows VICTORY when the enemy fleet is destroyed', async () => {
      vi.useFakeTimers();

      const now = vi.spyOn(performance, 'now').mockImplementation(() => clock);

      clock = 2_000;
      await startOnlineBattle(true); // the battle clock starts here

      clock = 2_000 + 90_000; // 1:30
      await sinkEnemyFleet();

      expect(status()).toBe('You win! Enemy fleet destroyed.');
      expect(visible('#results-screen')).toBe(false);
      expect(endSounds()).toEqual([]);

      vi.advanceTimersByTime(RESULTS_DELAY_MS);

      expect(visible('#results-screen')).toBe(true);
      expect(endSounds()).toEqual(['win']);
      expect(visible('#game-screen')).toBe(false);
      expect(headline()).toBe('VICTORY');
      expect(detail()).toBe('Enemy fleet destroyed.');
      expect(resultRows()).toEqual([
        '17 shots',
        '17 hits',
        '5 ships sunk',
        '17 hits in a row',
        '100.0% accuracy',
        '0 shots',
        '0 hits',
        '0 ships sunk',
        '0 hits in a row',
        '0.0% accuracy',
        '01:30'
      ]);

      now.mockRestore();
      vi.useRealTimers();
    });

    it('shows DEFEAT when the player forfeits, immediately', async () => {
      click('#back-to-menu');

      vi.spyOn(window, 'confirm').mockReturnValue(true);

      await startOnlineBattle(true);

      cell('#enemy-board', 0, 0).click(); // one hit (keeps the turn)
      await flush();

      click('#new-game'); // "Forfeit" during battle
      await flush();

      // A forfeit has no explosion to wait for: no delay.
      expect(visible('#results-screen')).toBe(true);
      expect(currentMusic()).toBe('menu');
      expect(endSounds()).toEqual(['lose']);
      expect(headline()).toBe('DEFEAT');
      expect(detail()).toBe('You forfeited the match.');
      expect(resultRows().slice(0, 4)).toEqual([
        '1 shot',
        '1 hit',
        '0 ships sunk',
        '1 hit in a row'
      ]);
    });

    it('shows VICTORY when the opponent disconnects mid-battle', async () => {
      click('#back-to-menu');

      const peer = await startOnlineBattle(true);

      cell('#enemy-board', 9, 9).click(); // a miss
      await flush();

      peer.dispose(); // the opponent's connection drops
      await flush();

      expect(visible('#results-screen')).toBe(true);
      expect(currentMusic()).toBe('menu');
      expect(endSounds()).toEqual(['win']);
      expect(headline()).toBe('VICTORY');
      expect(detail()).toBe('Your opponent disconnected.');
      expect(resultRows().slice(0, 4)).toEqual([
        '1 shot',
        '0 hits',
        '0 ships sunk',
        '0 hits in a row'
      ]);
    });

    it('New Game goes back to the lobby to find a new opponent', async () => {
      const lobbyMounts = vi.mocked(mountLobbyScreen).mock.calls.length;

      click('#results-new-game');

      expect(visible('#results-screen')).toBe(false);
      expect(visible('#online-screen')).toBe(true);
      expect(vi.mocked(mountLobbyScreen).mock.calls.length).toBe(
        lobbyMounts + 1
      );

      click('#back-to-menu');
    });

    it('shows no results screen when the opponent leaves before any battle', async () => {
      const peer = pairWithOpponent(true);

      peer.dispose(); // leaves during placement
      await flush();

      expect(visible('#results-screen')).toBe(false);
      expect(visible('#game-screen')).toBe(true);
      expect(status()).toBe('Opponent left before the battle started.');
      expect(endSounds()).toEqual(['win']); // unchanged: the one case with no results screen
    });
  });
});
