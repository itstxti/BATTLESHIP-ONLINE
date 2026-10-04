import type { GameState } from '../game/GameState';
import type { MatchOutcome } from '../game/matchStats';

import { audio } from '../audio/audio';

import { renderBoard } from '../ui/boardRenderer';
import { renderFleet } from '../ui/fleetRenderer';
import { setTurnStatus } from '../ui/status';

type BattleOptions = {
  gameState: GameState;
  playerBoardElement: HTMLDivElement;
  enemyBoardElement: HTMLDivElement;
  playerFleetElement: HTMLDivElement;
  enemyFleetElement: HTMLDivElement;

  /** Solo only: called once when the match ends. */
  onGameOver?: (outcome: MatchOutcome) => void;
};

/*
 * Solo only. Every delayed step of a match (the AI's reply, its chained
 * shots, handing the turn back) is registered under the match that owns it,
 * so that match can be cancelled as a unit. Without this, an abandoned game
 * (New Game, Back to menu) keeps firing shots and redrawing boards over
 * whatever the player is looking at now.
 */
const pendingTimers = new WeakMap<
  GameState,
  Set<ReturnType<typeof setTimeout>>
>();

function schedule(
  gameState: GameState,
  callback: () => void,
  delayMs: number
): void {
  let timers = pendingTimers.get(gameState);

  if (!timers) {
    timers = new Set();
    pendingTimers.set(gameState, timers);
  }

  const owned = timers;

  const id = setTimeout(() => {
    owned.delete(id);
    callback();
  }, delayMs);

  owned.add(id);
}

/** Stops every pending step of `gameState`'s match. Safe to call any time. */
export function cancelBattleTimers(gameState: GameState): void {
  const timers = pendingTimers.get(gameState);

  if (!timers) {
    return;
  }

  timers.forEach((id) => clearTimeout(id));
  timers.clear();
}

export function handleEnemyShot(
  row: number,
  column: number,
  options: BattleOptions
): void {
  const { gameState } = options;

  if (
    !gameState.playerTurn ||
    gameState.gameOver ||
    gameState.phase !== 'battle'
  ) {
    return;
  }

  if (
    gameState.gameMode === 'local' ||
    gameState.gameMode === 'online'
  ) {
    /*
     * Multiplayer: just fire. The outcome comes back from the defender
     * as an event and the view is refreshed from there, never optimistically.
     */
    gameState.multiplayerGame?.shoot(
      row,
      column
    );

    return;
  }

  audio.playSfx('fire');

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

  if (result === 'hit') {
    const ship =
      gameState.enemyBoard.getShipAt(
        row,
        column
      );

    if (ship?.isSunk()) {
      audio.playSfx('sunk');

      setTurnStatus(
        `You sunk the enemy ${ship.name}! Shoot again.`,
        'player'
      );
    } else {
      audio.playSfx('hit');

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
        gamePhase: gameState.phase,
        selectedShip: null,
        orientation: 'horizontal',
        playerBoard: gameState.playerBoard,
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
      gameState.gameOver = true;
      gameState.phase =
        'game-over';

      setTurnStatus(
        'You win!',
        'game-over'
      );

      options.onGameOver?.('victory');

      return;
    }

    return;
  }

  audio.playSfx('miss');

  setTurnStatus(
    'Miss! Enemy turn...',
    'enemy'
  );

  renderBoard(
    options.enemyBoardElement,
    gameState.enemyBoard,
    {
      isEnemyBoard: true,
      gamePhase: gameState.phase,
      selectedShip: null,
      orientation: 'horizontal',
      playerBoard: gameState.playerBoard,
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

  schedule(gameState, () => {
    handleAITurn(options);
  }, 700);
}

export function handleAITurn(
  options: BattleOptions
): void {
  const { gameState } = options;

  if (
    gameState.gameMode !== 'ai'
  ) {
    return;
  }

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

  audio.playSfx('fire');

  const shot =
    gameState.opponent.shoot(
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
      gamePhase: gameState.phase,
      selectedShip: null,
      orientation: 'horizontal',
      playerBoard: gameState.playerBoard,
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
    gameState.gameOver = true;
    gameState.phase =
      'game-over';

    setTurnStatus(
      'You lose!',
      'game-over'
    );

    options.onGameOver?.('defeat');

    return;
  }

  if (shot.result === 'hit') {
    if (ship?.isSunk()) {
      audio.playSfx('sunk');

      setTurnStatus(
        `Enemy sunk your ${ship.name}!`,
        'enemy'
      );
    } else {
      audio.playSfx('hit');

      setTurnStatus(
        'Enemy hit!',
        'enemy'
      );
    }

    schedule(gameState, () => {
      if (gameState.gameOver) {
        return;
      }

      handleAITurn(options);
    }, 700);

    return;
  }

  audio.playSfx('miss');

  setTurnStatus(
    'Enemy missed! Your turn',
    'player'
  );

  schedule(gameState, () => {
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
        gamePhase: gameState.phase,
        selectedShip: null,
        orientation: 'horizontal',
        playerBoard: gameState.playerBoard,
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