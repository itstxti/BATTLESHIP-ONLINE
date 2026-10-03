import type { Position } from '../game/Ship';

import type {
  FleetDefinition
} from '../game/types';

import type {
  GameState
} from '../game/GameState';

import type {
  PlacementState,
  Orientation
} from './PlacementState';

import {
  renderBoard,
  clearPlacementPreview
} from '../ui/boardRenderer';

import {
  renderFleet
} from '../ui/fleetRenderer';

import {
  setTurnStatus
} from '../ui/status';

import {
  audio
} from '../audio/audio';


type PlacementOptions = {
  gameState: GameState;

  state: PlacementState;

  playerBoardElement: HTMLDivElement;

  playerFleetElement: HTMLDivElement;

  onPlacementComplete: () => void;
};


export function getShipPositions(
  row: number,
  column: number,
  size: number,
  orientation: Orientation
): Position[] {
  const positions: Position[] = [];

  for (let i = 0; i < size; i++) {
    positions.push({
      row:
        orientation === 'horizontal'
          ? row
          : row + i,

      column:
        orientation === 'horizontal'
          ? column + i
          : column
    });
  }

  return positions;
}


export function selectShip(
  ship: FleetDefinition,
  options: PlacementOptions
): void {
  if (
    options.gameState.phase !==
    'placement'
  ) {
    return;
  }

  const {
    gameState,
    state,
    playerBoardElement,
    playerFleetElement
  } = options;

  state.selectedShip =
    ship;

  state.movingShipOriginalPositions =
    null;

  setTurnStatus(
    `Place your ${ship.name}`,
    'player'
  );

  renderFleet(
    playerFleetElement,
    gameState.playerBoard,
    gameState.fleet,
    gameState.phase,
    state.selectedShip,
    (selectedShip) => {
      selectShip(
        selectedShip,
        options
      );
    }
  );

  renderBoard(
    playerBoardElement,
    gameState.playerBoard,
    {
      gamePhase:
        gameState.phase,

      selectedShip:
        state.selectedShip,

      orientation:
        state.orientation,

      playerBoard:
        gameState.playerBoard,

      onPlacedShipSelect:
        (row, column) => {
          selectPlacedShip(
            row,
            column,
            options
          );
        },

      onPlacement:
        (row, column) => {
          handlePlacement(
            row,
            column,
            options
          );
        },

      onRotate: () => {
        rotateShip(
          options
        );
      }
    }
  );
}


export function selectPlacedShip(
  row: number,
  column: number,
  options: PlacementOptions
): void {
  if (
    options.gameState.phase !==
    'placement'
  ) {
    return;
  }

  const {
    gameState,
    state,
    playerBoardElement,
    playerFleetElement
  } = options;

  const ship =
    gameState.playerBoard.getShipAt(
      row,
      column
    );

  if (!ship) {
    return;
  }

  if (
    state.selectedShip &&
    state.movingShipOriginalPositions
  ) {
    restoreMovingShip(
      options
    );
  }

  state.movingShipOriginalPositions =
    ship.positions.map(
      (position) => ({
        row: position.row,
        column: position.column
      })
    );

  state.selectedShip =
    gameState.fleet.find(
      (definition) =>
        definition.name ===
        ship.name
    ) ?? null;

  gameState.playerBoard.removeShip(
    ship.name
  );

  if (
    state.movingShipOriginalPositions
      .length > 1
  ) {
    const first =
      state.movingShipOriginalPositions[0];

    const second =
      state.movingShipOriginalPositions[1];

    state.orientation =
      first.row === second.row
        ? 'horizontal'
        : 'vertical';
  }

  renderFleet(
    playerFleetElement,
    gameState.playerBoard,
    gameState.fleet,
    gameState.phase,
    state.selectedShip,
    (selectedShip) => {
      selectShip(
        selectedShip,
        options
      );
    }
  );

  renderBoard(
    playerBoardElement,
    gameState.playerBoard,
    {
      gamePhase:
        gameState.phase,

      selectedShip:
        state.selectedShip,

      orientation:
        state.orientation,

      playerBoard:
        gameState.playerBoard,

      onPlacedShipSelect:
        (
          selectedRow,
          selectedColumn
        ) => {
          selectPlacedShip(
            selectedRow,
            selectedColumn,
            options
          );
        },

      onPlacement:
        (
          selectedRow,
          selectedColumn
        ) => {
          handlePlacement(
            selectedRow,
            selectedColumn,
            options
          );
        },

      onRotate: () => {
        rotateShip(
          options
        );
      }
    }
  );

  setTurnStatus(
    `Moving ${ship.name} — choose a new position`,
    'player'
  );
}


export function handlePlacement(
  row: number,
  column: number,
  options: PlacementOptions
): void {
  if (
    options.gameState.phase !==
    'placement'
  ) {
    return;
  }

  const {
    gameState,
    state,
    playerBoardElement,
    playerFleetElement
  } = options;

  if (!state.selectedShip) {
    return;
  }

  const positions =
    getShipPositions(
      row,
      column,
      state.selectedShip.size,
      state.orientation
    );

  const valid =
    gameState.playerBoard.canPlaceShip(
      state.selectedShip.size,
      positions
    );

  if (!valid) {
    return;
  }

  gameState.playerBoard.placeShip(
    state.selectedShip.name,
    state.selectedShip.size,
    positions
  );

  audio.playSfx('place');

  state.movingShipOriginalPositions =
    null;

  state.selectedShip =
    null;

  state.orientation =
    'horizontal';

  clearPlacementPreview(
    playerBoardElement
  );

  renderBoard(
    playerBoardElement,
    gameState.playerBoard,
    {
      gamePhase:
        gameState.phase,

      selectedShip:
        state.selectedShip,

      orientation:
        state.orientation,

      playerBoard:
        gameState.playerBoard,

      onPlacedShipSelect:
        (
          selectedRow,
          selectedColumn
        ) => {
          selectPlacedShip(
            selectedRow,
            selectedColumn,
            options
          );
        },

      onPlacement:
        (
          selectedRow,
          selectedColumn
        ) => {
          handlePlacement(
            selectedRow,
            selectedColumn,
            options
          );
        },

      onRotate: () => {
        rotateShip(
          options
        );
      }
    }
  );

  renderFleet(
    playerFleetElement,
    gameState.playerBoard,
    gameState.fleet,
    gameState.phase,
    state.selectedShip,
    (selectedShip) => {
      selectShip(
        selectedShip,
        options
      );
    }
  );

  if (
    gameState.playerBoard
      .getShips()
      .length ===
    gameState.fleet.length
  ) {
    options.onPlacementComplete();

    return;
  }

  setTurnStatus(
    'Place your fleet',
    'player'
  );
}


export function restoreMovingShip(
  options: PlacementOptions
): void {
  const {
    gameState,
    state,
    playerBoardElement,
    playerFleetElement
  } = options;

  if (
    !state.selectedShip ||
    !state.movingShipOriginalPositions
  ) {
    return;
  }

  gameState.playerBoard.placeShip(
    state.selectedShip.name,
    state.selectedShip.size,
    state.movingShipOriginalPositions
  );

  state.selectedShip =
    null;

  state.movingShipOriginalPositions =
    null;

  state.orientation =
    'horizontal';

  clearPlacementPreview(
    playerBoardElement
  );

  renderBoard(
    playerBoardElement,
    gameState.playerBoard,
    {
      gamePhase:
        gameState.phase,

      selectedShip:
        state.selectedShip,

      orientation:
        state.orientation,

      playerBoard:
        gameState.playerBoard,

      onPlacedShipSelect:
        (row, column) => {
          selectPlacedShip(
            row,
            column,
            options
          );
        },

      onPlacement:
        (row, column) => {
          handlePlacement(
            row,
            column,
            options
          );
        },

      onRotate: () => {
        rotateShip(
          options
        );
      }
    }
  );

  renderFleet(
    playerFleetElement,
    gameState.playerBoard,
    gameState.fleet,
    gameState.phase,
    state.selectedShip,
    (selectedShip) => {
      selectShip(
        selectedShip,
        options
      );
    }
  );
}


export function rotateShip(
  options: PlacementOptions
): void {
  if (
    options.gameState.phase !==
      'placement' ||
    !options.state.selectedShip
  ) {
    return;
  }

  options.state.orientation =
    options.state.orientation ===
    'horizontal'
      ? 'vertical'
      : 'horizontal';

  clearPlacementPreview(
    options.playerBoardElement
  );

  renderBoard(
    options.playerBoardElement,
    options.gameState.playerBoard,
    {
      gamePhase:
        options.gameState.phase,

      selectedShip:
        options.state.selectedShip,

      orientation:
        options.state.orientation,

      playerBoard:
        options.gameState.playerBoard,

      onPlacedShipSelect:
        (row, column) => {
          selectPlacedShip(
            row,
            column,
            options
          );
        },

      onPlacement:
        (row, column) => {
          handlePlacement(
            row,
            column,
            options
          );
        },

      onRotate: () => {
        rotateShip(
          options
        );
      }
    }
  );
}


export function resetFleet(
  options: PlacementOptions
): void {
  if (
    options.gameState.phase !==
    'placement'
  ) {
    return;
  }

  const {
    gameState,
    state,
    playerBoardElement,
    playerFleetElement
  } = options;

  for (
    const ship of [
      ...gameState.playerBoard.getShips()
    ]
  ) {
    gameState.playerBoard.removeShip(
      ship.name
    );
  }

  state.selectedShip =
    null;

  state.movingShipOriginalPositions =
    null;

  state.orientation =
    'horizontal';

  setTurnStatus(
    'Place your fleet',
    'player'
  );

  renderBoard(
    playerBoardElement,
    gameState.playerBoard,
    {
      gamePhase:
        gameState.phase,

      selectedShip:
        state.selectedShip,

      orientation:
        state.orientation,

      playerBoard:
        gameState.playerBoard,

      onPlacedShipSelect:
        (row, column) => {
          selectPlacedShip(
            row,
            column,
            options
          );
        },

      onPlacement:
        (row, column) => {
          handlePlacement(
            row,
            column,
            options
          );
        },

      onRotate: () => {
        rotateShip(
          options
        );
      }
    }
  );

  renderFleet(
    playerFleetElement,
    gameState.playerBoard,
    gameState.fleet,
    gameState.phase,
    state.selectedShip,
    (selectedShip) => {
      selectShip(
        selectedShip,
        options
      );
    }
  );
}


export function cancelPlacement(
  options: PlacementOptions
): void {
  if (
    options.gameState.phase !==
    'placement'
  ) {
    return;
  }

  if (
    options.state
      .movingShipOriginalPositions
  ) {
    restoreMovingShip(
      options
    );

    setTurnStatus(
      'Place your fleet',
      'player'
    );

    return;
  }

  options.state.selectedShip =
    null;

  clearPlacementPreview(
    options.playerBoardElement
  );

  renderBoard(
    options.playerBoardElement,
    options.gameState.playerBoard,
    {
      gamePhase:
        options.gameState.phase,

      selectedShip:
        options.state.selectedShip,

      orientation:
        options.state.orientation,

      playerBoard:
        options.gameState.playerBoard,

      onPlacedShipSelect:
        (row, column) => {
          selectPlacedShip(
            row,
            column,
            options
          );
        },

      onPlacement:
        (row, column) => {
          handlePlacement(
            row,
            column,
            options
          );
        },

      onRotate: () => {
        rotateShip(
          options
        );
      }
    }
  );

  renderFleet(
    options.playerFleetElement,
    options.gameState.playerBoard,
    options.gameState.fleet,
    options.gameState.phase,
    options.state.selectedShip,
    (selectedShip) => {
      selectShip(
        selectedShip,
        options
      );
    }
  );
}

