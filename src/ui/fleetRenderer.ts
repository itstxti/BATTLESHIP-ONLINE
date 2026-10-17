import type { Board } from '../game/Board';
import type { ShipName } from '../game/Ship';

import type {
  FleetDefinition,
  GamePhase
} from '../game/types';

/*
 * "2 of 5 placed" plus one bar per ship (as long as the ship): outlined
 * while it still has to be placed, filled once it is on the board.
 */
function createPlacementProgress(
  fleet: FleetDefinition[],
  placedNames: ReadonlySet<ShipName>,
  selectedShip: FleetDefinition | null
): HTMLElement {
  const progress =
    document.createElement('div');

  progress.classList.add(
    'fleet-progress'
  );

  progress.setAttribute(
    'role',
    'status'
  );

  const placedCount =
    fleet.filter(
      (ship) =>
        placedNames.has(ship.name)
    ).length;

  const complete =
    placedCount === fleet.length;

  if (complete) {
    progress.classList.add(
      'complete'
    );
  }

  const label =
    document.createElement('span');

  label.classList.add(
    'fleet-progress-label'
  );

  label.textContent = complete
    ? 'Fleet ready'
    : `${placedCount} of ${fleet.length} placed`;

  const pips =
    document.createElement('span');

  pips.classList.add(
    'fleet-progress-pips'
  );

  pips.setAttribute(
    'aria-hidden',
    'true'
  );

  for (const ship of fleet) {
    const pip =
      document.createElement('span');

    pip.classList.add(
      'fleet-progress-pip'
    );

    pip.style.setProperty(
      '--size',
      String(ship.size)
    );

    if (placedNames.has(ship.name)) {
      pip.classList.add('filled');
    } else if (
      selectedShip?.name === ship.name
    ) {
      pip.classList.add('current');
    }

    pips.appendChild(pip);
  }

  progress.append(label, pips);

  return progress;
}

export function renderFleet(
  element: HTMLDivElement,
  board: Board,
  fleet: FleetDefinition[],
  gamePhase: GamePhase,
  selectedShip: FleetDefinition | null,
  onSelectShip: (
    ship: FleetDefinition
  ) => void,
  animatedShipName?: ShipName,
  nameFirst = false
): void {
  element.innerHTML = '';

  /*
   * While placing your own fleet, show how many ships are still to place.
   */
  const showPlacementState =
    gamePhase === 'placement' &&
    nameFirst;

  if (showPlacementState) {
    element.appendChild(
      createPlacementProgress(
        fleet,
        new Set(
          board.getShips().map(
            (placed) => placed.name
          )
        ),
        selectedShip
      )
    );
  }

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
     * Placement state: placed ships get a check, the rest stay outlined.
     */
    if (showPlacementState) {
      if (placedShip) {
        shipElement.classList.add(
          'placed'
        );
      }

      shipElement.setAttribute(
        'aria-label',
        `${ship.name}, ${ship.size} cells, ${
          placedShip
            ? 'placed'
            : 'not placed yet'
        }`
      );
    }

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

    /*
     * Fleet order.
     *
     * Player:
     * name → visual
     *
     * Enemy:
     * visual → name
     */
    if (nameFirst) {
      shipElement.appendChild(
        nameElement
      );

      shipElement.appendChild(
        visualElement
      );
    } else {
      shipElement.appendChild(
        visualElement
      );

      shipElement.appendChild(
        nameElement
      );
    }

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