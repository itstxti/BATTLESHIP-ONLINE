import {
  createGameState,
  type GameState
} from './GameState';

import type {
  FleetDefinition
} from './types';

import type {
  PlacementState
} from '../placement/PlacementState';

import {
  createPlacementState
} from '../placement/PlacementState';

type GameControllerOptions = {
  fleet: FleetDefinition[];

  getGameState: () => GameState;

  getPlacementState: () => PlacementState;

  setGameState: (
    gameState: GameState
  ) => void;

  setPlacementState: (
    placementState: PlacementState
  ) => void;

  onPhaseChange: () => void;

  onPlacementComplete: () => void;
};

export function createGameController(
  options: GameControllerOptions
) {
  function startGame(): void {
    const gameState =
      createGameState(
        options.fleet
      );

    const placementState =
      createPlacementState();

    options.setGameState(
      gameState
    );

    options.setPlacementState(
      placementState
    );

    options.onPhaseChange();
  }

  function startBattle(): void {
    const gameState =
      options.getGameState();

    const placementState =
      options.getPlacementState();

    if (
      gameState.playerBoard
        .getShips()
        .length !==
      gameState.fleet.length
    ) {
      return;
    }

    gameState.phase =
      'battle';

    gameState.playerTurn =
      true;

    gameState.gameOver =
      false;

    placementState.selectedShip =
      null;

    placementState
      .movingShipOriginalPositions =
      null;

    options.onPhaseChange();
  }

  function checkPlacementComplete(): void {
    const gameState =
      options.getGameState();

    if (
      gameState.playerBoard
        .getShips()
        .length !==
      gameState.fleet.length
    ) {
      return;
    }

    options.onPlacementComplete();
  }

  return {
    startGame,
    startBattle,
    checkPlacementComplete
  };
}

