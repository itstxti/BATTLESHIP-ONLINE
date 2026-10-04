import type { Board } from '../game/Board';

import {
  DEFAULT_STAT_NAMES,
  describeStatGroups,
  type MatchOutcome,
  type MatchStats,
  type StatNames
} from '../game/matchStats';

import { renderBoard } from './boardRenderer';

export type ResultsView = {
  outcome: MatchOutcome;

  /** One line on how the match ended, e.g. "Enemy fleet destroyed." */
  detail: string;

  stats: MatchStats;

  /**
   * Who is who in the stats and boards. Defaults to "You" / "Enemy";
   * Local mode (no enemy) passes "Player 1" / "Player 2".
   */
  names?: StatNames;

  /**
   * Final boards, shown read-only behind the "View boards" button.
   * Omit to hide the button.
   */
  boards?: {
    player: Board;
    enemy: Board;
  };
};

export const RESULTS_HEADLINE_ID = 'results-headline';

export const RESULTS_NEW_GAME_ID = 'results-new-game';

export const RESULTS_VIEW_BOARDS_ID = 'results-view-boards';

export const RESULTS_BOARDS_ID = 'results-boards';

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);

  node.className = className;

  if (text !== undefined) {
    node.textContent = text;
  }

  return node;
}

/** "Your Fleet" for the default "You", otherwise "Player 1's Fleet". */
function fleetTitle(name: string): string {
  return name === DEFAULT_STAT_NAMES.player
    ? 'Your Fleet'
    : name === DEFAULT_STAT_NAMES.opponent
      ? 'Enemy Fleet'
      : `${name}'s Fleet`;
}

function renderResultDetail(
  detail: string,
  names: StatNames
): HTMLElement {
  const paragraph = element('p', 'results-detail');

  const playerName = detail.includes(names.player)
    ? names.player
    : detail.includes(names.opponent)
      ? names.opponent
      : null;

  if (!playerName) {
    paragraph.textContent = detail;
    return paragraph;
  }

  const index = detail.indexOf(playerName);

  paragraph.append(
    detail.slice(0, index),
    element(
      'span',
      playerName === names.player
        ? 'results-player results-player--one'
        : 'results-player results-player--two',
      playerName
    ),
    detail.slice(index + playerName.length)
  );

  return paragraph;
}

function renderBoardsPanel(
  boards: NonNullable<ResultsView['boards']>,
  names: StatNames
): HTMLElement {
  const panel = element('div', 'results-boards');

  panel.id = RESULTS_BOARDS_ID;
  panel.hidden = true;

  const entries = [
    {
      title: fleetTitle(names.player),
      side: 'player',
      board: boards.player,
      isEnemyBoard: false
    },
    {
      title: fleetTitle(names.opponent),
      side: 'opponent',
      board: boards.enemy,
      isEnemyBoard: true
    }
  ];

  for (const { title, side, board, isEnemyBoard } of entries) {
    const section = element(
      'div',
      `board-section board-section--${side}`
    );

    const grid = element(
      'div',
      'board board--readonly'
    );

    grid.setAttribute('role', 'group');
    grid.setAttribute(
      'aria-label',
      `${title}, final state`
    );

    renderBoard(grid, board, {
      isEnemyBoard,
      gamePhase: 'battle',
      selectedShip: null,
      orientation: 'horizontal',
      playerBoard: board,
      readOnly: true
    });

    section.append(
      element(
        'h3',
        'results-board-title',
        title
      ),
      grid
    );

    panel.append(section);
  }

  return panel;
}

/**
 * Fills `container` with the results screen and returns the headline so
 * the caller can move focus to it once the screen is visible (focus() is a
 * no-op on a hidden element). The headline is focusable only
 * programmatically (tabindex="-1"), so screen readers announce the outcome
 * ("VICTORY" / "DEFEAT") when the screen appears.
 *
 * Idempotent: any previous content is replaced.
 */
export function renderResultsScreen(
  container: HTMLElement,
  view: ResultsView,
  onNewGame: () => void
): HTMLElement {
  const names =
    view.names ?? DEFAULT_STAT_NAMES;

  const header =
    element('div', 'game-mode-header');

  const headline = element(
    'h2',
    `results-headline results-headline--${view.outcome}`,
    view.outcome === 'victory'
      ? 'VICTORY'
      : 'DEFEAT'
  );

  headline.id = RESULTS_HEADLINE_ID;
  headline.tabIndex = -1;

  header.append(
    element(
      'span',
      'game-mode-eyebrow',
      'MATCH RESULT'
    ),
    headline,
    renderResultDetail(
      view.detail,
      names
    )
  );

  const groups =
    element('div', 'results-groups');

  for (
    const group of describeStatGroups(
      view.stats,
      names
    )
  ) {
    const section = element(
      'div',
      `results-group results-group--${group.id}`
    );

    const title = element(
      'h3',
      'results-group-title',
      group.title
    );

    title.id =
      `results-group-${group.id}`;

    section.setAttribute(
      'role',
      'group'
    );

    section.setAttribute(
      'aria-labelledby',
      title.id
    );

    const list =
      element('ul', 'results-stats');

    for (
      const {
        value,
        label,
        meter
      } of group.rows
    ) {
      const item =
        element(
          'li',
          'results-stat'
        );

      // The literal space keeps the text reading "17 shots" for screen
      // readers (the value is shown on the right via CSS, not DOM order).
      item.append(
        element(
          'span',
          'results-stat-value',
          value
        ),
        ' ',
        element(
          'span',
          'results-stat-label',
          label
        )
      );

      if (meter !== undefined) {
        item.classList.add(
          'results-stat--meter'
        );

        item.style.setProperty(
          '--meter',
          String(meter)
        );
      }

      list.append(item);
    }

    section.append(
      title,
      list
    );

    groups.append(section);
  }

  const newGameButton =
    element(
      'button',
      'results-new-game',
      'New Game'
    );

  newGameButton.id =
    RESULTS_NEW_GAME_ID;

  newGameButton.type = 'button';

  newGameButton.addEventListener(
    'click',
    onNewGame
  );

  const actions =
    element('div', 'results-actions');

  if (view.boards) {
    const panel =
      renderBoardsPanel(
        view.boards,
        names
      );

    const toggle =
      element(
        'button',
        'results-view-boards',
        'View boards'
      );

    toggle.id =
      RESULTS_VIEW_BOARDS_ID;

    toggle.type = 'button';

    toggle.setAttribute(
      'aria-controls',
      RESULTS_BOARDS_ID
    );

    toggle.addEventListener(
      'click',
      () => {
        panel.hidden =
          !panel.hidden;

        toggle.textContent =
          panel.hidden
            ? 'View boards'
            : 'Hide boards';
      }
    );

    actions.append(
      toggle,
      newGameButton
    );

    container.replaceChildren(
      header,
      groups,
      actions,
      panel
    );
  } else {
    actions.append(
      newGameButton
    );

    container.replaceChildren(
      header,
      groups,
      actions
    );
  }

  return headline;
}