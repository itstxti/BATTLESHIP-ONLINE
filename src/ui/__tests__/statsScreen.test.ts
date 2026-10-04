// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

import {
  clearPlayerStats,
  loadPlayerStats,
  recordMatchStats
} from '../../game/playerStats';
import { describeStatCards, renderStatsScreen } from '../statsScreen';

const read = (container: HTMLElement): Record<string, string> =>
  Object.fromEntries(
    [...container.querySelectorAll('.stats-card')].map((card) => [
      card.querySelector('dt')!.textContent!,
      card.querySelector('dd')!.textContent!
    ])
  );

const click = (container: HTMLElement, text: string): void => {
  const button = [...container.querySelectorAll('button')].find(
    (item) => item.textContent === text
  );

  expect(button, `button "${text}"`).toBeTruthy();

  button!.click();
};

const seed = (): void => {
  recordMatchStats({
    mode: 'ai',
    difficulty: 'easy',
    outcome: 'victory',
    stats: { shots: 10, hits: 5, shipsSunk: 5 }
  });
  recordMatchStats({
    mode: 'ai',
    difficulty: 'hard',
    outcome: 'defeat',
    stats: { shots: 10, hits: 3, shipsSunk: 2 }
  });
  recordMatchStats({
    mode: 'online',
    outcome: 'victory',
    stats: { shots: 20, hits: 10, shipsSunk: 5 }
  });
};

describe('statistics screen', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.replaceChildren();
  });

  it('shows the eight statistics in order', () => {
    expect(
      describeStatCards({
        matches: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        shots: 0,
        hits: 0,
        accuracy: 0,
        shipsSunk: 0
      }).map((card) => card.label)
    ).toEqual([
      'Matches Played',
      'Wins',
      'Losses',
      'Win Rate',
      'Shots Fired',
      'Hits',
      'Ships Sunk',
      'Accuracy'
    ]);
  });

  it('starts on Global and switches section and difficulty', () => {
    seed();

    const container = document.createElement('div');

    renderStatsScreen(container, loadPlayerStats, clearPlayerStats);

    expect(read(container)).toMatchObject({
      'Matches Played': '3',
      Wins: '2',
      Losses: '1',
      'Win Rate': '66.7%',
      'Shots Fired': '40',
      Hits: '18',
      Accuracy: '45.0%',
      'Ships Sunk': '12'
    });

    click(container, 'Online');

    expect(read(container)['Matches Played']).toBe('1');
    expect(read(container).Accuracy).toBe('50.0%');

    click(container, 'VS AI');

    // "All levels" combines the three levels.
    expect(read(container)['Matches Played']).toBe('2');

    click(container, 'Hard');

    expect(read(container)).toMatchObject({
      'Matches Played': '1',
      Losses: '1',
      Accuracy: '30.0%'
    });

    click(container, 'Medium');

    expect(read(container)['Matches Played']).toBe('0');
    expect(read(container)['Win Rate']).toBe('0.0%');
  });

  it('puts Accuracy right under Win Rate', () => {
    const container = document.createElement('div');

    renderStatsScreen(container, loadPlayerStats, clearPlayerStats);

    const labels = [...container.querySelectorAll('dt')].map(
      (node) => node.textContent
    );

    // Same column on the 4-column grid (index +4), and on the 2-column one.
    expect(labels.indexOf('Accuracy') - labels.indexOf('Win Rate')).toBe(4);
    expect(labels.indexOf('Win Rate') % 4).toBe(3);
  });

  it('marks the active filters with aria-selected', () => {
    const container = document.createElement('div');

    renderStatsScreen(container, loadPlayerStats, clearPlayerStats);

    const selected = (): string[] =>
      [...container.querySelectorAll('[aria-selected="true"]')]
        .filter((node) => !node.closest('[hidden]'))
        .map((node) => node.textContent!);

    const levels = container.querySelector<HTMLElement>(
      '[aria-label="AI difficulty"]'
    )!;

    expect(selected()).toEqual(['Global']);
    expect(levels.hidden).toBe(true);

    click(container, 'VS AI');

    expect(levels.hidden).toBe(false);
    expect(selected()).toEqual(['VS AI', 'All levels']);

    click(container, 'Online');

    expect(levels.hidden).toBe(true);
  });

  it('updates the same elements in place so changes can animate', () => {
    seed();

    const container = document.createElement('div');

    renderStatsScreen(container, loadPlayerStats, clearPlayerStats);

    const segment = container.querySelector('.stats-segment')!;
    const indicator = container.querySelector('.stats-indicator')!;
    const card = container.querySelector('.stats-card')!;

    click(container, 'VS AI');
    click(container, 'Hard');

    expect(container.querySelector('.stats-segment')).toBe(segment);
    expect(container.querySelector('.stats-indicator')).toBe(indicator);
    expect(container.querySelector('.stats-card')).toBe(card);
  });

  it('sets the meter variable on Win Rate and Accuracy', () => {
    seed();

    const container = document.createElement('div');

    renderStatsScreen(container, loadPlayerStats, clearPlayerStats);

    const meters = [...container.querySelectorAll<HTMLElement>('.stats-card--meter')];

    expect(meters).toHaveLength(2);
    expect(meters[1].style.getPropertyValue('--meter')).toBe('45');

    click(container, 'Online');

    expect(meters[1].style.getPropertyValue('--meter')).toBe('50');
  });

  it('keeps the chosen AI level when leaving and coming back to VS AI', () => {
    const container = document.createElement('div');

    renderStatsScreen(container, loadPlayerStats, clearPlayerStats);

    click(container, 'VS AI');
    click(container, 'Hard');
    click(container, 'Global');
    click(container, 'VS AI');

    expect(
      [...container.querySelectorAll('[aria-selected="true"]')]
        .filter((node) => !node.closest('[hidden]'))
        .map((node) => node.textContent)
    ).toEqual(['VS AI', 'Hard']);
  });

  it('moves between filters with the arrow keys', () => {
    const container = document.createElement('div');

    document.body.append(container);

    renderStatsScreen(container, loadPlayerStats, clearPlayerStats);

    const press = (key: string): void => {
      (document.activeElement as HTMLElement).dispatchEvent(
        new KeyboardEvent('keydown', { key, bubbles: true })
      );
    };

    container
      .querySelector<HTMLElement>('[aria-selected="true"]')!
      .focus();

    press('ArrowRight');

    expect(document.activeElement?.textContent).toBe('VS AI');

    press('End');

    expect(document.activeElement?.textContent).toBe('Online');

    press('ArrowRight');

    // Wraps around.
    expect(document.activeElement?.textContent).toBe('Global');
  });

  it('does not show the old footnote', () => {
    const container = document.createElement('div');

    renderStatsScreen(container, loadPlayerStats, clearPlayerStats);

    expect(container.textContent).not.toMatch(/saved in this browser/);
    expect(container.textContent).not.toMatch(/not counted/);
  });
});
