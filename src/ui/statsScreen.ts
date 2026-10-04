import { formatAccuracy } from '../game/matchStats';

import {
  deriveStats,
  emptyBaseStats,
  getScopeStats,
  type DerivedStats,
  type PlayerStats,
  type StatsScope
} from '../game/playerStats';

import type { AIDifficulty } from '../game/types';

import { confirmDialog } from './confirmDialog';
import { HISTORY_HEADLINE_ID } from './historyScreen';

export const STATS_RESET_ID = 'stats-reset';

/** How long the numbers take to count up or down. */
const COUNT_MS = 450;

/** Delay between one card and the next when the screen opens. */
const STAGGER_MS = 55;

type Section = StatsScope['section'];

type AIView = AIDifficulty | 'all';

const SECTIONS: readonly { id: Section; label: string }[] = [
  { id: 'global', label: 'Global' },
  { id: 'ai', label: 'VS AI' },
  { id: 'online', label: 'Online' }
];

const AI_VIEWS: readonly { id: AIView; label: string }[] = [
  { id: 'all', label: 'All levels' },
  { id: 'easy', label: 'Easy' },
  { id: 'medium', label: 'Medium' },
  { id: 'hard', label: 'Hard' }
];

const SECTION_NOTES: Record<Section, string> = {
  global: 'Solo and online matches combined.',
  ai: 'Matches against the computer.',
  online: 'Matches against other players online.'
};

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

/* -------------------------------- cards --------------------------------- */

type StatCard = {
  label: string;
  value: string;

  /** The number behind `value` (a percentage when `percent` is set). */
  amount: number;

  percent?: boolean;

  /** 0-100: draws a bar under the value. */
  meter?: number;
};

/**
 * The eight statistics in reading order. On the 4-column grid (and on the
 * 2-column one on phones) Accuracy lands right under Win Rate.
 */
export function describeStatCards(stats: DerivedStats): StatCard[] {
  const count = (label: string, amount: number): StatCard => ({
    label,
    amount,
    value: String(amount)
  });

  const percent = (label: string, amount: number): StatCard => ({
    label,
    amount,
    percent: true,
    value: formatAccuracy(amount),
    meter: amount
  });

  return [
    count('Matches Played', stats.matches),
    count('Wins', stats.wins),
    count('Losses', stats.losses),
    percent('Win Rate', stats.winRate),
    count('Shots Fired', stats.shots),
    count('Hits', stats.hits),
    count('Ships Sunk', stats.shipsSunk),
    percent('Accuracy', stats.accuracy)
  ];
}

/** Numbers only animate for people who have not asked for reduced motion. */
function canAnimate(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    typeof window.requestAnimationFrame === 'function' &&
    window.matchMedia('(prefers-reduced-motion: no-preference)').matches
  );
}

type LiveCard = {
  item: HTMLElement;
  value: HTMLElement;
  shown: number;
  frame: number;
};

/** Cards are created once and updated in place, so changes can be animated. */
function createCard(card: StatCard): LiveCard {
  const item = element('div', 'stats-card');

  const value = element('dd', 'stats-card-value', card.value);

  if (card.meter !== undefined) {
    item.classList.add('stats-card--meter');
  }

  // <dt> before <dd> keeps the label/value pairing valid for screen readers.
  item.append(element('dt', 'stats-card-label', card.label), value);

  return { item, value, shown: card.amount, frame: 0 };
}

function updateCard(
  live: LiveCard,
  card: StatCard,
  /** Waits before counting, so cards can start one after another. */
  delayMs = 0
): void {
  const format = (amount: number): string =>
    card.percent
      ? formatAccuracy(amount)
      : String(Math.round(amount));

  if (card.meter !== undefined) {
    // The bar width has a CSS transition, so setting the variable animates it.
    live.item.style.setProperty(
      '--meter',
      String(Math.max(0, Math.min(100, card.meter)))
    );
  }

  window.cancelAnimationFrame?.(live.frame);

  const from = live.shown;

  live.shown = card.amount;

  if (from === card.amount || !canAnimate()) {
    live.value.textContent = card.value;

    return;
  }

  const start = performance.now();

  const step = (time: number): void => {
    const progress = Math.max(
      0,
      Math.min(1, (time - start - delayMs) / COUNT_MS)
    );

    const eased = 1 - (1 - progress) ** 3;

    live.value.textContent =
      progress === 1
        ? card.value
        : format(from + (card.amount - from) * eased);

    if (progress < 1) {
      live.frame = window.requestAnimationFrame(step);
    }
  };

  live.frame = window.requestAnimationFrame(step);
}

/* ------------------------------- segments -------------------------------- */

type Segments<T extends string> = {
  element: HTMLElement;
  select: (id: T) => void;
};

/**
 * A segmented control following the ARIA tabs pattern: one tab stop,
 * Left/Right/Home/End move between options. A single indicator slides under
 * the selected option, so it lives as long as the control does.
 */
function createSegments<T extends string>(
  label: string,
  options: readonly { id: T; label: string }[],
  initial: T,
  onSelect: (id: T) => void
): Segments<T> {
  const group = element('div', 'stats-segments');

  group.setAttribute('role', 'tablist');
  group.setAttribute('aria-label', label);

  const indicator = element('span', 'stats-indicator');

  indicator.setAttribute('aria-hidden', 'true');

  let selected = initial;

  const buttons = options.map((option) => {
    const button = element('button', 'stats-segment', option.label);

    button.type = 'button';
    button.setAttribute('role', 'tab');

    button.addEventListener('click', () => {
      if (option.id !== selected) {
        onSelect(option.id);
      }
    });

    return button;
  });

  /** Moves the indicator under the selected button; `instant` skips the slide. */
  const place = (instant: boolean): void => {
    const current = buttons[options.findIndex((o) => o.id === selected)];

    // Not laid out (hidden, or not attached yet): nothing to measure.
    if (!current || group.offsetWidth === 0) {
      return;
    }

    if (instant) {
      indicator.style.transition = 'none';
    }

    indicator.style.width = `${current.offsetWidth}px`;
    indicator.style.transform = `translateX(${current.offsetLeft}px)`;

    if (instant) {
      // Commit the jump before transitions are switched back on.
      void indicator.offsetWidth;

      indicator.style.transition = '';
    }
  };

  const paint = (): void => {
    options.forEach((option, index) => {
      const isSelected = option.id === selected;

      buttons[index].setAttribute('aria-selected', String(isSelected));
      buttons[index].tabIndex = isSelected ? 0 : -1;
    });
  };

  paint();

  group.addEventListener('keydown', (event) => {
    const current = buttons.indexOf(
      document.activeElement as HTMLButtonElement
    );

    if (current === -1) {
      return;
    }

    const last = buttons.length - 1;

    const target =
      event.key === 'ArrowRight'
        ? (current + 1) % buttons.length
        : event.key === 'ArrowLeft'
          ? (current + last) % buttons.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : -1;

    if (target === -1) {
      return;
    }

    event.preventDefault();

    if (options[target].id !== selected) {
      onSelect(options[target].id);
    }

    buttons[target].focus();
  });

  group.append(indicator, ...buttons);

  // Also covers fonts loading late, window resizes and the control being
  // revealed (its size goes from 0 to something): place without sliding.
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => place(true)).observe(group);
  }

  place(true);

  return {
    element: group,

    select: (id) => {
      selected = id;

      paint();

      place(false);
    }
  };
}

/* -------------------------------- screen -------------------------------- */

/**
 * Fills `container` with the persistent statistics. `loadStats` is called on
 * every change, so the numbers are never stale.
 *
 * Idempotent: any previous content is replaced.
 */
export function renderStatsScreen(
  container: HTMLElement,
  loadStats: () => PlayerStats,
  clearStats: () => void,
  initialScope: StatsScope = { section: 'global' }
): HTMLElement {
  let section: Section = initialScope.section;

  // Remembered while on another section, so coming back to VS AI keeps the level.
  let aiView: AIView =
    initialScope.section === 'ai' ? initialScope.difficulty : 'all';

  const headline = element('h2', 'history-headline', 'Statistics');

  headline.id = HISTORY_HEADLINE_ID;
  headline.tabIndex = -1;

  const header = element('div', 'game-mode-header');

  header.append(
    element('span', 'game-mode-eyebrow', 'STATISTICS'),
    headline
  );

  const currentScope = (): StatsScope =>
    section === 'ai'
      ? { section, difficulty: aiView }
      : { section };

  const note = element('p', 'history-note');

  const grid = element('dl', 'stats-grid');

  // When the screen opens the cards fade in one after another while their
  // numbers count up from zero; without animation they just show the values.
  const opening = canAnimate();

  const cards = describeStatCards(
    opening
      ? deriveStats(emptyBaseStats())
      : getScopeStats(loadStats(), currentScope())
  ).map(createCard);

  cards.forEach((card, index) =>
    card.item.style.setProperty('--i', String(index))
  );

  grid.append(...cards.map((card) => card.item));

  /** Writes the current scope's numbers into the existing cards. */
  const update = (staggered = false): void => {
    levels.element.hidden = section !== 'ai';

    note.textContent = SECTION_NOTES[section];

    describeStatCards(
      getScopeStats(loadStats(), currentScope())
    ).forEach((card, index) =>
      updateCard(
        cards[index],
        card,
        staggered ? index * STAGGER_MS : 0
      )
    );
  };

  const sections = createSegments<Section>(
    'Statistics section',
    SECTIONS,
    section,
    (next) => {
      section = next;

      sections.select(next);

      update();
    }
  );

  const levels = createSegments<AIView>(
    'AI difficulty',
    AI_VIEWS,
    aiView,
    (next) => {
      aiView = next;

      levels.select(next);

      update();
    }
  );

  levels.element.classList.add('stats-segments--reveal');

  const filters = element('div', 'stats-filters');

  // Sits to the right of the section filter and only shows in VS AI. It stays
  // in the DOM so its indicator and animation keep working.
  filters.append(sections.element, levels.element);

  const reset = element('button', 'history-clear', 'Reset statistics');

  reset.id = STATS_RESET_ID;
  reset.type = 'button';

  reset.addEventListener('click', () => {
    void confirmDialog({
      title: 'Reset statistics?',
      message:
        'This deletes your saved Solo and Online statistics. Your match history is not affected.',
      confirmLabel: 'Reset statistics',
      danger: true
    }).then((confirmed) => {
      if (confirmed) {
        clearStats();

        update();
      }
    });
  });

  container.replaceChildren(header, filters, note, grid, reset);

  update(opening);

  // The first measurement can happen before the container is in the page.
  window.requestAnimationFrame?.(() => {
    sections.select(section);
    levels.select(aiView);
  });

  return headline;
}
