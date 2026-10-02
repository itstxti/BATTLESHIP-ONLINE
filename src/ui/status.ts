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

  turnStatusElement.textContent =
    message;

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

