import {
  describeRecordMode,
  describeRecordOutcome,
  formatRecordDate,
  HISTORY_LIMIT,
  type MatchRecord
} from '../game/matchHistory';

import { formatAccuracy, formatDuration } from '../game/matchStats';

import { confirmDialog } from './confirmDialog';

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

<<<<<<< HEAD
const SVG_NS = 'http://www.w3.org/2000/svg';

function svg(
  tag: string,
  attributes: Record<string, string | number>,
  className?: string
): SVGElement {
  const node = document.createElementNS(SVG_NS, tag);

  for (const [name, value] of Object.entries(attributes)) {
    node.setAttribute(name, String(value));
  }

  if (className) {
    node.setAttribute('class', className);
  }

  return node;
}

/**
 * A small slice of the game board for the empty state: one ship, a miss and
 * a target waiting for the first shot. Drawn with the same colours as the
 * real hulls so it reads as "your matches will land here".
 */
function renderEmptyBoard(): SVGElement {
  const COLUMNS = 8;
  const ROWS = 4;
  const SIZE = 36;
  const PITCH = 40;

  const width = COLUMNS * PITCH - (PITCH - SIZE);
  const height = ROWS * PITCH - (PITCH - SIZE);

  const board = svg(
    'svg',
    { viewBox: `0 0 ${width} ${height}`, focusable: 'false' },
    'history-empty-board'
  );

  for (let row = 0; row < ROWS; row++) {
    for (let column = 0; column < COLUMNS; column++) {
      board.append(
        svg(
          'rect',
          {
            x: column * PITCH,
            y: row * PITCH,
            width: SIZE,
            height: SIZE,
            rx: 7
          },
          'history-empty-cell'
        )
      );
    }
  }

  // Ship: three cells wide on row 2, bow to the left (same shape as the game).
  const x = PITCH;
  const y = PITCH;
  const length = PITCH * 3 - (PITCH - SIZE);
  const top = y + SIZE * 0.15;
  const bottom = y + SIZE * 0.85;
  const middle = y + SIZE / 2;

  board.append(
    svg(
      'polygon',
      {
        points: [
          [x, middle],
          [x + length * 0.16, top],
          [x + length, top],
          [x + length, bottom],
          [x + length * 0.16, bottom]
        ]
          .map((point) => point.join(','))
          .join(' ')
      },
      'history-empty-hull'
    ),
    svg(
      'rect',
      {
        x: x + length * 0.2,
        y: middle - SIZE * 0.13,
        width: length * 0.8,
        height: SIZE * 0.26
      },
      'history-empty-deck'
    ),
    svg(
      'rect',
      {
        x: x + length * 0.54,
        y: middle - SIZE * 0.14,
        width: length * 0.16,
        height: SIZE * 0.28
      },
      'history-empty-bridge'
    )
  );

  // A miss, and the cell that is waiting for a shot.
  board.append(
    svg(
      'circle',
      {
        cx: 6 * PITCH + SIZE / 2,
        cy: 2 * PITCH + SIZE / 2,
        r: 6
      },
      'history-empty-miss'
    ),
    svg(
      'rect',
      {
        x: 4 * PITCH + 2,
        y: 3 * PITCH + 2,
        width: SIZE - 4,
        height: SIZE - 4,
        rx: 6
      },
      'history-empty-target'
    )
  );

  return board;
}

=======
>>>>>>> 69564e5cd4b53338c46c06c5dd0b554835e946bf
function renderRow(record: MatchRecord, index: number): HTMLElement {
  const item = element('li', `history-row history-row--${record.outcome}`);

  item.style.setProperty('--i', String(index));

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
    // Decorative only: the header note already says there are no matches.
    const empty = element('div', 'history-empty');

    empty.setAttribute('aria-hidden', 'true');

    empty.append(renderEmptyBoard());

    container.replaceChildren(header, empty);

    return headline;
  }

  const list = element('ol', 'history-list');

  list.setAttribute('aria-label', 'Match history, newest first');

  records.forEach((record, index) => {
    list.append(renderRow(record, index));
  });

  const clear = element('button', 'history-clear', 'Clear history');

  clear.id = HISTORY_CLEAR_ID;
  clear.type = 'button';

  clear.addEventListener('click', () => {
    void confirmDialog({
      title: 'Clear history?',
      message: 'This deletes all of your saved matches.',
      confirmLabel: 'Clear history',
      danger: true
    }).then((confirmed) => {
      if (confirmed) {
        onClear();
      }
    });
  });

  container.replaceChildren(header, list, clear);

  return headline;
}
