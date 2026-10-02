import type { Board } from '../game/Board';
import type { ShipName } from '../game/Ship';

import type {
  FleetDefinition,
  GamePhase
} from '../game/types';

export function renderFleet(
  element: HTMLDivElement,
  board: Board,
  fleet: FleetDefinition[],
  gamePhase: GamePhase,
  selectedShip: FleetDefinition | null,
  onSelectShip: (
    ship: FleetDefinition
  ) => void,
  animatedShipName?: ShipName
): void {
  element.innerHTML = '';

  for (const ship of fleet) {
    const placedShip =
      board.getShips().find(
        (placed) =>
          placed.name === ship.name
      );

    const shipElement =
      document.createElement('button');

    shipElement.type = 'button';

    shipElement.classList.add(
      'fleet-ship'
    );

    /*
     * Placement selection.
     */
    if (
      gamePhase === 'placement' &&
      !placedShip
    ) {
      shipElement.classList.add(
        'selectable'
      );

      if (
        selectedShip?.name ===
        ship.name
      ) {
        shipElement.classList.add(
          'selected'
        );
      }

      shipElement.addEventListener(
        'click',
        () => {
          onSelectShip(ship);
        }
      );
    }

    /*
     * Sunk state.
     */
    if (
      placedShip?.isSunk()
    ) {
      shipElement.classList.add(
        'sunk'
      );
    }

    /*
     * Ship visual.
     */
    const visualElement =
      document.createElement('div');

    visualElement.classList.add(
      'fleet-ship-visual'
    );

    for (
      let i = 0;
      i < ship.size;
      i++
    ) {
      const segment =
        document.createElement('span');

      segment.classList.add(
        'ship-segment'
      );

      visualElement.appendChild(
        segment
      );
    }

    /*
     * Ship name.
     */
    const nameElement =
      document.createElement('span');

    nameElement.classList.add(
      'fleet-ship-name'
    );

    nameElement.textContent =
      ship.name;

    shipElement.appendChild(
      visualElement
    );

    shipElement.appendChild(
      nameElement
    );

    element.appendChild(
      shipElement
    );

    /*
     * Animate only the ship that
     * has just been sunk.
     */
    if (
      placedShip?.isSunk() &&
      animatedShipName ===
        ship.name
    ) {
      requestAnimationFrame(
        () => {
          shipElement.classList.add(
            'sunk-animation'
          );
        }
      );
    }
  }
}

