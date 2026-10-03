import {
  createGameState,
  type GameState
} from './GameState';

import type {
  FleetDefinition,
  GameMode
} from './types';

import type {
  GameTransport
} from './GameTransport';

import type {
  PlacementState
} from '../placement/PlacementState';

import {
  createPlacementState
} from '../placement/PlacementState';

import {
  audio
} from '../audio/audio';


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
  function startGame(
    gameMode: GameMode = 'ai',
    transport: GameTransport | null = null,
    playerStarts: boolean = true
  ): void {
    const gameState =
      createGameState(
        options.fleet,
        gameMode,
        transport,
        playerStarts
      );

    gameState.playerTurn =
      playerStarts;

    const placementState =
      createPlacementState();

    options.setGameState(
      gameState
    );

    options.setPlacementState(
      placementState
    );

    audio.playMusic('menu');

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

    if (
      gameState.gameMode === 'ai'
    ) {
      gameState.playerTurn =
        true;

      audio.playMusic('battle');
    }

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