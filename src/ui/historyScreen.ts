import {
  describeRecordMode,
  describeRecordOutcome,
  formatRecordDate,
  HISTORY_LIMIT,
  type MatchRecord
} from '../game/matchHistory';

import { formatAccuracy, formatDuration } from '../game/matchStats';

export const HISTORY_HEADLINE_ID = 'history-headline';

export const HISTORY_CLEAR_ID = 'history-clear';

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

function renderRow(record: MatchRecord): HTMLElement {
  const item = element('li', `history-row history-row--${record.outcome}`);

  if (record.mode === 'local') {
    item.classList.add('history-row--local');
  }

  const stats = record.stats;

  const outcome = element('span', 'history-row-outcome', describeRecordOutcome(record));

  const meta = element(
    'span',
    'history-row-meta',
    `${describeRecordMode(record)} · ${formatRecordDate(record.endedAt)}`
  );

  const main = element('span', 'history-row-main');

  main.append(outcome, meta);

  const numbers = element(
    'span',
    'history-row-numbers',
    `${stats.hits}/${stats.shots} hits · ${formatAccuracy(stats.accuracy)} · ${formatDuration(stats.durationMs)}`
  );

  item.append(main, numbers);

  return item;
}

/**
 * Fills `container` with the list of the last
 * matches (newest first). Returns the headline so the caller can focus it.
 *
 * Idempotent: any previous content is replaced.
 */
export function renderHistoryScreen(
  container: HTMLElement,
  records: readonly MatchRecord[],
  onClear: () => void
): HTMLElement {
  const header = element('div', 'game-mode-header');

  const headline = element('h2', 'history-headline', 'Match history');

  headline.id = HISTORY_HEADLINE_ID;
  headline.tabIndex = -1;

  header.append(
    element('span', 'game-mode-eyebrow', 'HISTORY'),
    headline,
    element(
      'p',
      'history-note',
      records.length === 0
        ? 'No matches yet. Finish a game and it will show up here.'
        : `Last ${Math.min(records.length, HISTORY_LIMIT)} matches`
    )
  );

  if (records.length === 0) {
    container.replaceChildren(header);

    return headline;
  }

  const list = element('ol', 'history-list');

  list.setAttribute('aria-label', 'Match history, newest first');

  for (const record of records) {
    list.append(renderRow(record));
  }

  const clear = element('button', 'history-clear', 'Clear history');

  clear.id = HISTORY_CLEAR_ID;
  clear.type = 'button';

  clear.addEventListener('click', () => {
    if (window.confirm('Delete your match history?')) {
      onClear();
    }
  });

  container.replaceChildren(header, list, clear);

  return headline;
}
