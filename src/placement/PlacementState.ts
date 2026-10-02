import type { Position } from '../game/Ship';
import type { FleetDefinition } from '../game/types';

export type Orientation =
  | 'horizontal'
  | 'vertical';

export type PlacementState = {
  selectedShip:
    | FleetDefinition
    | null;

  orientation: Orientation;

  movingShipOriginalPositions:
    | Position[]
    | null;
};

export function createPlacementState(): PlacementState {
  return {
    selectedShip: null,

    orientation: 'horizontal',

    movingShipOriginalPositions:
      null
  };
}

