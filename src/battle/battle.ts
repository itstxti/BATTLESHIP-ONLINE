import type { GameState } from '../game/GameState';

import {
  renderBoard
} from '../ui/boardRenderer';

import {
  renderFleet
} from '../ui/fleetRenderer';

import {
  setTurnStatus
} from '../ui/status';

type BattleOptions = {
  gameState: GameState;

  playerBoardElement: HTMLDivElement;

  enemyBoardElement: HTMLDivElement;

  playerFleetElement: HTMLDivElement;

  enemyFleetElement: HTMLDivElement;
};


export function handleEnemyShot(
  row: number,
  column: number,
  options: BattleOptions
): void {
  const {
    gameState
  } = options;

  if (
    !gameState.playerTurn ||
    gameState.gameOver ||
    gameState.phase !== 'battle'
  ) {
    return;
  }

  const result =
    gameState.enemyBoard.shoot(
      row,
      column
    );

  if (
    result === 'already-shot'
  ) {
    return;
  }

  if (
    result === 'hit'
  ) {
    const ship =
      gameState.enemyBoard.getShipAt(
        row,
        column
      );

    if (
      ship?.isSunk()
    ) {
      setTurnStatus(
        `You sunk the enemy ${ship.name}! Shoot again.`,
        'player'
      );
    } else {
      setTurnStatus(
        'Hit! Shoot again.',
        'player'
      );
    }

    renderBoard(
      options.enemyBoardElement,
      gameState.enemyBoard,
      {
        isEnemyBoard: true,

        gamePhase:
          gameState.phase,

        selectedShip: null,

        orientation:
          'horizontal',

        playerBoard:
          gameState.playerBoard,

        onEnemyShot: (
          nextRow,
          nextColumn
        ) => {
          handleEnemyShot(
            nextRow,
            nextColumn,
            options
          );
        },

        animatedShot: {
          row,
          column
        }
      }
    );

    renderFleet(
      options.enemyFleetElement,
      gameState.enemyBoard,
      gameState.fleet,
      gameState.phase,
      null,
      () => { },
      ship?.isSunk()
        ? ship.name
        : undefined
    );

    if (
      gameState.enemyBoard
        .allShipsSunk()
    ) {
      gameState.gameOver =
        true;

      gameState.phase =
        'game-over';

      setTurnStatus(
        'You win!',
        'game-over'
      );

      return;
    }

    return;
  }

  setTurnStatus(
    'Miss! Enemy turn...',
    'enemy'
  );

  renderBoard(
    options.enemyBoardElement,
    gameState.enemyBoard,
    {
      isEnemyBoard: true,

      gamePhase:
        gameState.phase,

      selectedShip: null,

      orientation:
        'horizontal',

      playerBoard:
        gameState.playerBoard,

      onEnemyShot: (
        nextRow,
        nextColumn
      ) => {
        handleEnemyShot(
          nextRow,
          nextColumn,
          options
        );
      },

      animatedShot: {
        row,
        column
      }
    }
  );

  renderFleet(
    options.enemyFleetElement,
    gameState.enemyBoard,
    gameState.fleet,
    gameState.phase,
    null,
    () => { }
  );

  gameState.playerTurn =
    false;

  setTimeout(() => {
    handleAITurn(
      options
    );
  }, 700);
}

export function handleAITurn(
  options: BattleOptions
): void {
  const {
    gameState
  } = options;

  if (
    gameState.gameOver ||
    gameState.phase !== 'battle'
  ) {
    return;
  }

  setTurnStatus(
    'Enemy turn...',
    'enemy'
  );

  const shot =
    gameState.ai.shoot(
      gameState.playerBoard
    );

  const ship =
    gameState.playerBoard.getShipAt(
      shot.row,
      shot.column
    );

  renderBoard(
    options.playerBoardElement,
    gameState.playerBoard,
    {
      isEnemyBoard: false,

      gamePhase:
        gameState.phase,

      selectedShip: null,

      orientation:
        'horizontal',

      playerBoard:
        gameState.playerBoard,

      animatedShot: {
        row: shot.row,
        column: shot.column
      }
    }
  );

  renderFleet(
    options.playerFleetElement,
    gameState.playerBoard,
    gameState.fleet,
    gameState.phase,
    null,
    () => { },
    ship?.isSunk()
      ? ship.name
      : undefined
  );

  if (
    gameState.playerBoard
      .allShipsSunk()
  ) {
    gameState.gameOver =
      true;

    gameState.phase =
      'game-over';

    setTurnStatus(
      'You lose!',
      'game-over'
    );

    return;
  }

  if (
    shot.result === 'hit'
  ) {
    if (
      ship?.isSunk()
    ) {
      setTurnStatus(
        `Enemy sunk your ${ship.name}!`,
        'enemy'
      );
    } else {
      setTurnStatus(
        'Enemy hit!',
        'enemy'
      );
    }

    setTimeout(() => {
      if (
        gameState.gameOver
      ) {
        return;
      }

      handleAITurn(
        options
      );
    }, 700);

    return;
  }

  setTurnStatus(
    'Enemy missed! Your turn',
    'player'
  );

  setTimeout(() => {
    if (
      gameState.gameOver ||
      gameState.phase !== 'battle'
    ) {
      return;
    }

    gameState.playerTurn =
      true;

    setTurnStatus(
      'Your turn',
      'player'
    );

    renderBoard(
      options.enemyBoardElement,
      gameState.enemyBoard,
      {
        isEnemyBoard: true,

        gamePhase:
          gameState.phase,

        selectedShip: null,

        orientation:
          'horizontal',

        playerBoard:
          gameState.playerBoard,

        onEnemyShot: (
          row,
          column
        ) => {
          handleEnemyShot(
            row,
            column,
            options
          );
        }
      }
    );
  }, 700);
}

