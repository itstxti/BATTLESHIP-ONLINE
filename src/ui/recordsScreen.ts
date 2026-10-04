import type { MatchRecord } from '../game/matchHistory';
import type { PlayerStats } from '../game/playerStats';

import { renderHistoryScreen } from './historyScreen';
import { renderStatsScreen } from './statsScreen';

export type RecordsTab = 'stats' | 'history';

export type RecordsDeps = {
  loadHistory: () => MatchRecord[];
  loadStats: () => PlayerStats;
  clearHistory: () => void;
  clearStats: () => void;
};

const TABS: readonly { id: RecordsTab; label: string }[] = [
  { id: 'stats', label: 'Statistics' },
  { id: 'history', label: 'History' }
];

/**
 * The screen behind the top-bar button: persistent statistics and the list of
 * recent matches, switchable in place. Data is read again on every switch, so
 * the numbers are never stale. Idempotent: previous content is replaced.
 *
 * Returns the active panel's headline so the caller can focus it.
 */
export function renderRecordsScreen(
  container: HTMLElement,
  deps: RecordsDeps,
  initialTab: RecordsTab = 'stats'
): HTMLElement {
  const nav = document.createElement('div');

  nav.className = 'stats-choices stats-choices--tabs';
  nav.setAttribute('role', 'group');
  nav.setAttribute('aria-label', 'Statistics or history');

  const panel = document.createElement('div');

  panel.className = 'records-panel';

  const show = (tab: RecordsTab): HTMLElement => {
    for (const button of nav.querySelectorAll('button')) {
      button.setAttribute(
        'aria-pressed',
        String(button.dataset.tab === tab)
      );
    }

    if (tab === 'stats') {
      return renderStatsScreen(panel, deps.loadStats(), () => {
        deps.clearStats();

        show('stats');
      });
    }

    return renderHistoryScreen(panel, deps.loadHistory(), () => {
      deps.clearHistory();

      show('history');
    });
  };

  for (const tab of TABS) {
    const button = document.createElement('button');

    button.type = 'button';
    button.className = 'stats-choice';
    button.textContent = tab.label;
    button.dataset.tab = tab.id;

    button.addEventListener('click', () => {
      if (button.getAttribute('aria-pressed') !== 'true') {
        show(tab.id);
      }
    });

    nav.append(button);
  }

  container.replaceChildren(nav, panel);

  return show(initialTab);
}
