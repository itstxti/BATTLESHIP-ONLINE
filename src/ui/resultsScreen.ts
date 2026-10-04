import {
  describeStats,
  type MatchOutcome,
  type MatchStats
} from '../game/matchStats';

export type ResultsView = {
  outcome: MatchOutcome;

  /** One line on how the match ended, e.g. "Enemy fleet destroyed." */
  detail: string;

  stats: MatchStats;
};

export const RESULTS_HEADLINE_ID = 'results-headline';

export const RESULTS_NEW_GAME_ID = 'results-new-game';

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

/**
 * Fills `container` with the results screen and returns the New Game
 * button so the caller can move focus to it once the screen is visible
 * (focus() is a no-op on a hidden element).
 *
 * Idempotent: any previous content is replaced.
 */
export function renderResultsScreen(
  container: HTMLElement,
  view: ResultsView,
  onNewGame: () => void
): HTMLButtonElement {
  const header = element('div', 'game-mode-header');

  const headline = element(
    'h2',
    `results-headline results-headline--${view.outcome}`,
    view.outcome === 'victory' ? 'VICTORY' : 'DEFEAT'
  );

  headline.id = RESULTS_HEADLINE_ID;

  header.append(
    element('span', 'game-mode-eyebrow', 'MATCH RESULT'),
    headline,
    element('p', 'results-detail', view.detail)
  );

  const list = element('ul', 'results-stats');

  list.setAttribute('aria-label', 'Match statistics');

  for (const { value, label } of describeStats(view.stats)) {
    const item = element('li', 'results-stat');

    // The literal space keeps the text reading "17 shots" for screen readers.
    item.append(
      element('span', 'results-stat-value', value),
      ' ',
      element('span', 'results-stat-label', label)
    );

    list.append(item);
  }

  const newGameButton = element(
    'button',
    'results-new-game',
    'New Game'
  );

  newGameButton.id = RESULTS_NEW_GAME_ID;
  newGameButton.type = 'button';
  newGameButton.addEventListener('click', onNewGame);

  container.replaceChildren(header, list, newGameButton);

  return newGameButton;
}
