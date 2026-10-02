import './style.css';

import {
  renderBoard
} from './ui/boardRenderer';

import {
  renderFleet
} from './ui/fleetRenderer';

import {
  updateGameUI
} from './ui/gameUI';

import {
  setTurnStatus
} from './ui/status';

import {
  selectShip,
  selectPlacedShip,
  handlePlacement,
  rotateShip,
  resetFleet as resetPlacementFleet,
  cancelPlacement
} from './placement/placement';

import {
  createPlacementState,
  type PlacementState
} from './placement/PlacementState';

import {
  createGameState,
  type GameState
} from './game/GameState';

import {
  handleEnemyShot
} from './battle/battle';

import {
  createGameController
} from './game/GameController';

import {
  STANDARD_FLEET
} from './game/fleet';

const playerBoardElement =
  document.querySelector<HTMLDivElement>(
    '#player-board'
  );

const enemyBoardElement =
  document.querySelector<HTMLDivElement>(
    '#enemy-board'
  );

const turnStatusElement =
  document.querySelector<HTMLSpanElement>(
    '#turn-status'
  );

const newGameButton =
  document.querySelector<HTMLButtonElement>(
    '#new-game'
  );

const playerFleetElement =
  document.querySelector<HTMLDivElement>(
    '#player-fleet'
  );

const enemyFleetElement =
  document.querySelector<HTMLDivElement>(
    '#enemy-fleet'
  );

const rotateShipButton =
  document.querySelector<HTMLButtonElement>(
    '#rotate-ship'
  );

const resetFleetButton =
  document.querySelector<HTMLButtonElement>(
    '#reset-fleet'
  );

let gameState: GameState =
  createGameState(
    STANDARD_FLEET
  );

let placementState: PlacementState =
  createPlacementState();

function isFleetComplete(): boolean {
  return (
    gameState.playerBoard
      .getShips()
      .length ===
    gameState.fleet.length
  );
}

function updateUI(): void {
  updateGameUI(
    gameState.phase,
    isFleetComplete(),
    {
      newGameButton:
        newGameButton!,

      rotateShipButton:
        rotateShipButton!,

      resetFleetButton:
        resetFleetButton!
    }
  );
}

function getPlacementOptions() {
  return {
    gameState,

    state:
      placementState,

    playerBoardElement:
      playerBoardElement!,

    playerFleetElement:
      playerFleetElement!,

    onPlacementComplete:
      gameController
        .checkPlacementComplete
  };
}

function getBattleOptions() {
  return {
    gameState,

    playerBoardElement:
      playerBoardElement!,

    enemyBoardElement:
      enemyBoardElement!,

    playerFleetElement:
      playerFleetElement!,

    enemyFleetElement:
      enemyFleetElement!
  };
}

function renderPlayerBoard(): void {
  renderBoard(
    playerBoardElement!,
    gameState.playerBoard,
    {
      gamePhase:
        gameState.phase,

      selectedShip:
        placementState.selectedShip,

      orientation:
        placementState.orientation,

      playerBoard:
        gameState.playerBoard,

      onPlacedShipSelect:
        (row, column) => {
          selectPlacedShip(
            row,
            column,
            getPlacementOptions()
          );
        },

      onPlacement:
        (row, column) => {
          handlePlacement(
            row,
            column,
            getPlacementOptions()
          );
        },

      onRotate: () => {
        rotateShip(
          getPlacementOptions()
        );
      }
    }
  );
}

function renderPlayerFleet(): void {
  renderFleet(
    playerFleetElement!,
    gameState.playerBoard,
    gameState.fleet,
    gameState.phase,
    placementState.selectedShip,
    (ship) => {
      selectShip(
        ship,
        getPlacementOptions()
      );
    }
  );
}

function renderEnemyBoard(): void {
  renderBoard(
    enemyBoardElement!,
    gameState.enemyBoard,
    {
      isEnemyBoard: true,

      gamePhase:
        gameState.phase,

      selectedShip:
        null,

      orientation:
        'horizontal',

      playerBoard:
        gameState.playerBoard,

      onEnemyShot:
        gameState.phase === 'battle' &&
        gameState.playerTurn &&
        !gameState.gameOver
          ? (row, column) => {
              handleEnemyShot(
                row,
                column,
                getBattleOptions()
              );
            }
          : undefined
    }
  );
}

function renderEnemyFleet(): void {
  renderFleet(
    enemyFleetElement!,
    gameState.enemyBoard,
    gameState.fleet,
    gameState.phase,
    null,
    () => {}
  );
}

function renderGame(): void {
  renderPlayerBoard();
  renderEnemyBoard();
  renderPlayerFleet();
  renderEnemyFleet();

  updateUI();
}

function handlePlacementComplete(): void {
  setTurnStatus(
    'Fleet ready! Start the battle.',
    'player'
  );

  updateUI();
}

const gameController =
  createGameController({
    fleet:
      STANDARD_FLEET,

    getGameState:
      () => gameState,

    getPlacementState:
      () => placementState,

    setGameState:
      (newGameState) => {
        gameState =
          newGameState;
      },

    setPlacementState:
      (newPlacementState) => {
        placementState =
          newPlacementState;
      },

    onPhaseChange:
      () => {
        renderGame();
      },

    onPlacementComplete:
      handlePlacementComplete
  });

newGameButton?.addEventListener(
  'click',
  () => {
    if (
      gameState.phase ===
      'placement'
    ) {
      if (!isFleetComplete()) {
        return;
      }

      gameController.startBattle();

      setTurnStatus(
        'Your turn',
        'player'
      );

      return;
    }

    gameController.startGame();

    setTurnStatus(
      'Place your fleet',
      'player'
    );
  }
);

rotateShipButton?.addEventListener(
  'click',
  () => {
    rotateShip(
      getPlacementOptions()
    );
  }
);

resetFleetButton?.addEventListener(
  'click',
  () => {
    if (
      gameState.phase !==
      'placement'
    ) {
      return;
    }

    resetPlacementFleet(
      getPlacementOptions()
    );

    updateUI();
  }
);

document.addEventListener(
  'keydown',
  (event) => {
    if (
      gameState.phase !==
      'placement'
    ) {
      return;
    }

    if (
      event.key.toLowerCase() ===
      'r'
    ) {
      rotateShip(
        getPlacementOptions()
      );
    }

    if (
      event.key === 'Escape'
    ) {
      cancelPlacement(
        getPlacementOptions()
      );
    }
  }
);

if (
  playerBoardElement &&
  enemyBoardElement &&
  turnStatusElement &&
  newGameButton &&
  playerFleetElement &&
  enemyFleetElement &&
  rotateShipButton &&
  resetFleetButton
) {
  gameController.startGame();

  setTurnStatus(
    'Place your fleet',
    'player'
  );
}

