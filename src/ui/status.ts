export type TurnStatus =
  | 'player'
  | 'enemy'
  | 'game-over';

export function setTurnStatus(
  message: string,
  state: TurnStatus
): void {
  const turnStatusElement =
    document.querySelector<HTMLSpanElement>(
      '#turn-status'
    );

  if (!turnStatusElement) {
    return;
  }

  const changed =
    turnStatusElement.textContent !== message;

  turnStatusElement.textContent =
    message;

  // Re-run the short entrance so a new message is noticed
  // (removing the class and forcing a reflow restarts it).
  if (changed) {
    turnStatusElement.classList.remove(
      'status-swap'
    );

    void turnStatusElement.offsetWidth;

    turnStatusElement.classList.add(
      'status-swap'
    );
  }

  turnStatusElement.classList.remove(
    'player-turn',
    'enemy-turn',
    'game-over'
  );

  if (state === 'player') {
    turnStatusElement.classList.add(
      'player-turn'
    );
  }

  if (state === 'enemy') {
    turnStatusElement.classList.add(
      'enemy-turn'
    );
  }

  if (state === 'game-over') {
    turnStatusElement.classList.add(
      'game-over'
    );
  }
}

