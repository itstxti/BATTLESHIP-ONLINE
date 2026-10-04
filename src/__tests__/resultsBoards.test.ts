// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

import { Board } from '../game/Board';
import { STANDARD_FLEET } from '../game/fleet';
import { computeMatchStats } from '../game/matchStats';
import {
  renderResultsScreen,
  type ResultsView
} from '../ui/resultsScreen';

function boardWithFleet(): Board {
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

function makeView(withBoards: boolean): ResultsView {
  const player = boardWithFleet();
  const enemy = boardWithFleet();

  enemy.shoot(0, 0); // hit
  enemy.shoot(9, 9); // miss
  player.shoot(0, 0); // hit on the player's carrier
  player.shoot(8, 8); // miss

  return {
    outcome: 'victory',
    detail: 'Enemy fleet destroyed.',
    stats: computeMatchStats(enemy, 1000, player),
    ...(withBoards ? { boards: { player, enemy } } : {})
  };
}

describe('results screen', () => {
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '<section id="results-screen"></section>';
    container = document.querySelector<HTMLElement>('#results-screen')!;
  });

  it('returns the headline, focusable only programmatically', () => {
    const headline = renderResultsScreen(container, makeView(true), () => {});

    expect(headline.id).toBe('results-headline');
    expect(headline.tagName).toBe('H2');
    expect(headline.getAttribute('tabindex')).toBe('-1');

    container.hidden = false;
    headline.focus();

    expect(document.activeElement).toBe(headline);
  });

  it('groups the stats under headings, with accuracy bars', () => {
    renderResultsScreen(container, makeView(true), () => {});

    const groups = [...container.querySelectorAll<HTMLElement>('.results-group')];

    expect(groups.map((group) => group.getAttribute('role'))).toEqual([
      'group',
      'group',
      'group'
    ]);

    expect(
      groups.map(
        (group) =>
          document.getElementById(group.getAttribute('aria-labelledby')!)
            ?.textContent
      )
    ).toEqual(['You', 'Enemy', 'Match']);

    const meters = [
      ...container.querySelectorAll<HTMLElement>('.results-stat--meter')
    ];

    // Enemy board: 1 hit + 1 miss = 50%. Player board: 1 hit + 1 miss = 50%.
    expect(meters.map((meter) => meter.style.getPropertyValue('--meter'))).toEqual(
      ['50', '50']
    );

    // The row still reads "<value> <label>" in the DOM.
    expect(
      [...container.querySelectorAll('.results-stat')].map((row) => row.textContent)
    ).toEqual([
      '2 shots',
      '1 hit',
      '50.0% accuracy',
      '0 ships sunk',
      '1 hit in a row',
      '2 shots',
      '1 hit',
      '50.0% accuracy',
      '0 ships sunk',
      '1 hit in a row', // the opponent's one hit, then a miss
      '00:01 duration'
    ]);
  });

  it('keeps New Game working', () => {
    let clicks = 0;

    renderResultsScreen(container, makeView(true), () => clicks++);

    container.querySelector<HTMLButtonElement>('#results-new-game')!.click();

    expect(clicks).toBe(1);
  });

  describe('View boards', () => {
    const toggle = () =>
      container.querySelector<HTMLButtonElement>('#results-view-boards')!;

    const panel = () => container.querySelector<HTMLElement>('#results-boards')!;

    it('starts collapsed and toggles the read-only boards', () => {
      renderResultsScreen(container, makeView(true), () => {});

      expect(toggle().textContent).toBe('View boards');
      expect(toggle().getAttribute('aria-controls')).toBe('results-boards');
      expect(panel().hidden).toBe(true);

      toggle().click();

      expect(panel().hidden).toBe(false);
      expect(toggle().textContent).toBe('Hide boards');

      toggle().click();

      expect(panel().hidden).toBe(true);
      expect(toggle().textContent).toBe('View boards');
    });

    it('renders both final boards with no interactive cells', () => {
      renderResultsScreen(container, makeView(true), () => {});

      const boards = panel().querySelectorAll('.board');

      expect(boards.length).toBe(2);

      for (const board of boards) {
        expect(board.querySelectorAll('.cell').length).toBe(100);
        expect(board.querySelectorAll('button').length).toBe(0);
        expect(board.getAttribute('role')).toBe('group');
      }

      const [own, enemy] = [...boards];

      // Player's own fleet is visible; the enemy's is not revealed.
      expect(own.querySelectorAll('.cell.ship').length).toBe(16);
      expect(enemy.querySelectorAll('.cell.ship').length).toBe(0);

      expect(own.querySelectorAll('.cell.hit').length).toBe(1);
      expect(own.querySelectorAll('.cell.miss').length).toBe(1);
      expect(enemy.querySelectorAll('.cell.hit').length).toBe(1);
      expect(enemy.querySelectorAll('.cell.miss').length).toBe(1);

      // Cells carry accessible names, e.g. "A1: hit".
      expect(own.querySelectorAll('.cell')[0].getAttribute('aria-label')).toBe(
        'A1: hit'
      );
      expect(enemy.querySelectorAll('.cell')[99].getAttribute('aria-label')).toBe(
        'J10: miss'
      );
      expect(enemy.querySelectorAll('.cell')[50].getAttribute('aria-label')).toBe(
        'A6: not fired at'
      );
    });

    it('does not fire when a cell is clicked', () => {
      const view = makeView(true);

      renderResultsScreen(container, view, () => {});

      const before = JSON.stringify(
        Array.from({ length: 100 }, (_, i) =>
          view.boards!.enemy.getCell(Math.floor(i / 10), i % 10)
        )
      );

      panel()
        .querySelectorAll<HTMLElement>('.cell')
        .forEach((cell) => cell.click());

      const after = JSON.stringify(
        Array.from({ length: 100 }, (_, i) =>
          view.boards!.enemy.getCell(Math.floor(i / 10), i % 10)
        )
      );

      expect(after).toBe(before);
    });

    it('is omitted when no boards are provided', () => {
      renderResultsScreen(container, makeView(false), () => {});

      expect(toggle()).toBeNull();
      expect(panel()).toBeNull();
      expect(container.querySelector('#results-new-game')).not.toBeNull();
    });

    it('is idempotent: rendering again resets the panel', () => {
      renderResultsScreen(container, makeView(true), () => {});
      toggle().click();

      renderResultsScreen(container, makeView(true), () => {});

      expect(container.querySelectorAll('#results-boards').length).toBe(1);
      expect(panel().hidden).toBe(true);
    });
  });
});
