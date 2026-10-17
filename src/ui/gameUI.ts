import type { GamePhase } from '../game/types';

type GameUIOptions = {
  newGameButton: HTMLButtonElement;
  rotateShipButton: HTMLButtonElement;
  resetFleetButton: HTMLButtonElement;
};

export function updateGameUI(
  phase: GamePhase,
  fleetComplete: boolean,
  options: GameUIOptions
): void {
  const {
    newGameButton,
    rotateShipButton,
    resetFleetButton
  } = options;

  // Lets the stylesheet lay the screen out for the current phase (on phones
  // only the board you act on is shown while placing, and so on).
  newGameButton
    .closest<HTMLElement>('.game-container')
    ?.setAttribute('data-phase', phase);

  if (phase === 'placement') {
    rotateShipButton.disabled = false;
    resetFleetButton.disabled = false;

    newGameButton.textContent =
      fleetComplete
        ? 'Start Battle'
        : 'Start Battle';

    newGameButton.disabled =
      !fleetComplete;

    newGameButton.classList.toggle(
      'start-battle-button',
      fleetComplete
    );

    return;
  }

  if (phase === 'battle') {
    rotateShipButton.disabled = true;
    resetFleetButton.disabled = true;

    newGameButton.disabled = false;
    newGameButton.textContent = 'New Game';

    newGameButton.classList.remove(
      'start-battle-button'
    );

    return;
  }

  rotateShipButton.disabled = true;
  resetFleetButton.disabled = true;

  newGameButton.disabled = false;
  newGameButton.textContent = 'New Game';

  newGameButton.classList.remove(
    'start-battle-button'
  );
}

