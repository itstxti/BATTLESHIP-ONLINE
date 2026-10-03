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

import {
  LocalGameTransport
} from './game/LocalGameTransport';

import type {
  MultiplayerEvent
} from './game/MultiplayerGame';

import {
  mountLobbyScreen
} from './online/lobbyScreen';

import type {
  Match
} from './online/lobbyClient';

import type {
  ShipName
} from './game/Ship';

import type {
  GameMode
} from './game/types';

const gameModeMenu =
  document.querySelector<HTMLElement>(
    '#game-mode-menu'
  );

const gameScreen =
  document.querySelector<HTMLElement>(
    '#game-screen'
  );

const passDeviceScreen =
  document.querySelector<HTMLElement>(
    '#pass-device-screen'
  );

const modeAIButton =
  document.querySelector<HTMLButtonElement>(
    '#mode-ai'
  );

const modeLocalButton =
  document.querySelector<HTMLButtonElement>(
    '#mode-local'
  );

const modeOnlineButton =
  document.querySelector<HTMLButtonElement>(
    '#mode-online'
  );

const onlineScreen =
  document.querySelector<HTMLElement>(
    '#online-screen'
  );

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

let gameMode: GameMode = 'ai';

let gameState: GameState =
  createGameState(
    STANDARD_FLEET,
    'ai'
  );

let placementState: PlacementState =
  createPlacementState();

type LocalSeatIndex = 0 | 1;

type LocalSeat = {
  label: string;
  gameState: GameState;
  placement: PlacementState;
};

type ShotAnimation = {
  target: 'player' | 'enemy';
  row: number;
  column: number;
  sunkShip?: ShipName;
};

type IncomingShot = {
  row: number;
  column: number;
  sunkShip?: ShipName;
};

/*
 * Hot-seat session. Each seat is a full peer (own boards + own
 * MultiplayerGame) talking through an in-memory transport, so local and
 * online play exercise exactly the same protocol code.
 */
let localSeats:
  [LocalSeat, LocalSeat] | null = null;

let localActiveSeat:
  LocalSeatIndex = 0;

let localLastIncoming:
  [IncomingShot | null, IncomingShot | null] = [null, null];

/*
 * Bumped whenever the session is replaced/finished so that delayed
 * callbacks (turn hand-off timers) from an old session do nothing.
 */
let localFlowId = 0;

let pendingAnimation:
  ShotAnimation | null = null;

/*
 * Online session. The local player is a single peer of the same
 * MultiplayerGame protocol used by hot-seat play, but the transport is a
 * WebSocket to the relay server and the opponent is on another device.
 */
let disposeLobbyScreen:
  (() => void) | null = null;

/* Bumped when the online session ends so late events are ignored. */
let onlineFlowId = 0;

let onlineReady = false;

let onlineOpponentReady = false;

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

  if (
    gameMode === 'local' &&
    gameState.phase === 'placement'
  ) {
    newGameButton!.textContent =
      localActiveSeat === 0
        ? 'Ready · Pass Device'
        : 'Start Battle';
  }

  if (gameMode === 'online') {
    if (gameState.phase === 'placement') {
      rotateShipButton!.disabled = onlineReady;
      resetFleetButton!.disabled = onlineReady;

      newGameButton!.textContent =
        onlineReady
          ? 'Waiting for opponent…'
          : 'Ready';

      newGameButton!.disabled =
        onlineReady || !isFleetComplete();
    } else if (gameState.phase === 'battle') {
      newGameButton!.textContent = 'Forfeit';
    } else {
      newGameButton!.textContent = 'Back to Menu';
    }
  }
}

function isPlacementLocked(): boolean {
  return gameMode === 'online' && onlineReady;
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

      animatedShot:
        pendingAnimation?.target === 'player'
          ? {
            row: pendingAnimation.row,
            column: pendingAnimation.column
          }
          : undefined,

      onPlacedShipSelect:
        (row, column) => {
          if (isPlacementLocked()) {
            return;
          }

          selectPlacedShip(
            row,
            column,
            getPlacementOptions()
          );
        },

      onPlacement:
        (row, column) => {
          if (isPlacementLocked()) {
            return;
          }

          handlePlacement(
            row,
            column,
            getPlacementOptions()
          );
        },

      onRotate: () => {
        if (isPlacementLocked()) {
          return;
        }

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
      if (isPlacementLocked()) {
        return;
      }

      selectShip(
        ship,
        getPlacementOptions()
      );
    },
    pendingAnimation?.target === 'player'
      ? pendingAnimation.sunkShip
      : undefined
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

      animatedShot:
        pendingAnimation?.target === 'enemy'
          ? {
            row: pendingAnimation.row,
            column: pendingAnimation.column
          }
          : undefined,

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
    () => { },
    pendingAnimation?.target === 'enemy'
      ? pendingAnimation.sunkShip
      : undefined
  );
}

function renderGame(): void {
  renderPlayerBoard();
  renderEnemyBoard();
  renderPlayerFleet();
  renderEnemyFleet();

  /* An animation plays once, on the render that follows the shot. */
  pendingAnimation = null;

  updateUI();
}

function handlePlacementComplete(): void {
  if (
    gameMode === 'local'
  ) {
    setTurnStatus(
      localActiveSeat === 0
        ? 'Fleet ready! Confirm to pass the device.'
        : 'Fleet ready! Start the battle.',
      'player'
    );

    updateUI();

    return;
  }

  setTurnStatus(
    'Fleet ready! Start the battle.',
    'player'
  );

  updateUI();
}

/* =========================================================
   LOCAL MULTIPLAYER (hot seat)
   ========================================================= */

function syncTurn(
  state: GameState
): void {
  /*
   * playerTurn is a projection of the protocol state, never an
   * independent source of truth.
   */
  state.playerTurn =
    state.multiplayerGame?.canShoot() ?? false;
}

function otherSeat(
  index: LocalSeatIndex
): LocalSeatIndex {
  return index === 0 ? 1 : 0;
}

function createLocalSeat(
  label: string,
  transport: LocalGameTransport,
  startsFirst: boolean
): LocalSeat {
  return {
    label,

    gameState:
      createGameState(
        STANDARD_FLEET,
        'local',
        transport,
        startsFirst
      ),

    placement:
      createPlacementState()
  };
}

function disposeLocalGame(): void {
  localFlowId++;

  if (!localSeats) {
    return;
  }

  for (const seat of localSeats) {
    seat.gameState.multiplayerGame?.dispose();
  }

  localSeats = null;
  pendingAnimation = null;
}

function activateLocalSeat(
  index: LocalSeatIndex
): void {
  if (!localSeats) {
    return;
  }

  const seat = localSeats[index];

  localActiveSeat = index;
  gameState = seat.gameState;
  placementState = seat.placement;

  syncTurn(gameState);

  hidePassDeviceScreen();

  setTurnStatus(
    gameState.phase === 'placement'
      ? `${seat.label} — Place your fleet`
      : `${seat.label} — Your turn`,
    'player'
  );

  const incoming = localLastIncoming[index];

  if (incoming) {
    pendingAnimation = {
      target: 'player',
      ...incoming
    };

    localLastIncoming[index] = null;
  }

  renderGame();
}

type PassDeviceOptions = {
  seatIndex: LocalSeatIndex;
  message: string;
  buttonLabel: string;
  onContinue: () => void;
};

function showPassDeviceScreen(
  options: PassDeviceOptions
): void {
  if (!localSeats) {
    return;
  }

  const label =
    localSeats[options.seatIndex].label;

  gameScreen!.hidden = true;
  gameModeMenu!.hidden = true;

  passDeviceScreen!.hidden = false;

  passDeviceScreen!.innerHTML = `
    <div class="game-mode-header">
      <span class="game-mode-eyebrow">
        LOCAL MULTIPLAYER
      </span>

      <h2>
        Pass the device
      </h2>

      <p>
        ${options.message}
      </p>
    </div>

    <button
      id="continue-local"
      class="game-mode-button"
      type="button"
    >
      <span class="game-mode-number">
        ${options.seatIndex === 0 ? '01' : '02'}
      </span>

      <span class="game-mode-content">
        <span class="game-mode-title">
          ${label}
        </span>

        <span class="game-mode-description">
          ${options.buttonLabel}
        </span>
      </span>

      <span class="game-mode-arrow">
        →
      </span>
    </button>
  `;

  const flowId = localFlowId;

  passDeviceScreen!
    .querySelector<HTMLButtonElement>(
      '#continue-local'
    )
    ?.addEventListener(
      'click',
      () => {
        if (flowId !== localFlowId) {
          return;
        }

        options.onContinue();
      }
    );
}

function hidePassDeviceScreen(): void {
  passDeviceScreen!.hidden = true;
  gameModeMenu!.hidden = true;
  gameScreen!.hidden = false;
}

/*
 * A seat confirms its fleet. This is the same call an online client
 * makes: it locks the fleet and sends `ready`. The battle starts when
 * BOTH sides are ready, announced through the `battle-start` event.
 */
function confirmLocalPlacement(): void {
  if (!localSeats) {
    return;
  }

  const seat =
    localSeats[localActiveSeat];

  if (
    !seat.gameState.multiplayerGame?.markReady()
  ) {
    return;
  }

  if (localActiveSeat === 0) {
    showPassDeviceScreen({
      seatIndex: 1,
      message:
        'Player 1 is ready. Pass the device to Player 2.',
      buttonLabel:
        'Place your fleet',
      onContinue: () => {
        activateLocalSeat(1);
      }
    });
  }
}

function scheduleLocalHandoff(
  nextSeat: LocalSeatIndex
): void {
  const flowId = localFlowId;

  setTimeout(() => {
    if (
      flowId !== localFlowId ||
      !localSeats
    ) {
      return;
    }

    showPassDeviceScreen({
      seatIndex: nextSeat,
      message:
        `Pass the device to ${localSeats[nextSeat].label}.`,
      buttonLabel:
        'Start your turn',
      onContinue: () => {
        activateLocalSeat(nextSeat);
      }
    });
  }, 1000);
}

function handleLocalEvent(
  index: LocalSeatIndex,
  event: MultiplayerEvent
): void {
  if (!localSeats) {
    return;
  }

  const seat = localSeats[index];

  switch (event.type) {
    case 'battle-start': {
      /*
       * Both peers announce it; react once.
       */
      if (index !== 0) {
        return;
      }

      for (const item of localSeats) {
        item.gameState.phase = 'battle';
        item.gameState.gameOver = false;

        item.placement.selectedShip = null;
        item.placement.movingShipOriginalPositions = null;

        syncTurn(item.gameState);
      }

      const first: LocalSeatIndex =
        localSeats[0].gameState.playerTurn ? 0 : 1;

      showPassDeviceScreen({
        seatIndex: first,
        message:
          `Both fleets are ready. Pass the device to ${localSeats[first].label}.`,
        buttonLabel:
          'Start the battle',
        onContinue: () => {
          activateLocalSeat(first);
        }
      });

      return;
    }

    case 'shot-fired': {
      if (index !== localActiveSeat) {
        return;
      }

      syncTurn(seat.gameState);

      setTurnStatus(
        'Firing...',
        'enemy'
      );

      renderGame();

      return;
    }

    case 'shot-resolved': {
      if (index !== localActiveSeat) {
        return;
      }

      syncTurn(seat.gameState);

      pendingAnimation = {
        target: 'enemy',
        row: event.row,
        column: event.column,
        sunkShip: event.sunk?.name
      };

      /*
       * Final blow: the game-over event renders the end state.
       */
      if (seat.gameState.multiplayerGame?.isGameOver()) {
        return;
      }

      if (event.result === 'hit') {
        setTurnStatus(
          event.sunk
            ? `You sunk the enemy ${event.sunk.name}! Shoot again.`
            : 'Hit! Shoot again.',
          'player'
        );
      } else {
        const next = otherSeat(index);

        setTurnStatus(
          `Miss! Pass the device to ${localSeats[next].label}.`,
          'enemy'
        );

        scheduleLocalHandoff(next);
      }

      renderGame();

      return;
    }

    case 'shot-rejected': {
      if (index !== localActiveSeat) {
        return;
      }

      syncTurn(seat.gameState);

      setTurnStatus(
        `Shot rejected (${event.reason}). Try another cell.`,
        'player'
      );

      renderGame();

      return;
    }

    case 'incoming-shot': {
      /*
       * The defender is not on screen in hot-seat play. Remember the
       * shot so it is highlighted when the device reaches them.
       */
      if (index !== localActiveSeat) {
        localLastIncoming[index] = {
          row: event.row,
          column: event.column,
          sunkShip: event.sunk?.name
        };
      }

      return;
    }

    case 'game-over': {
      /*
       * Both peers announce it; react once, from the winner's side.
       */
      if (event.winner !== 'me') {
        return;
      }

      localFlowId++;

      for (const item of localSeats) {
        item.gameState.gameOver = true;
        item.gameState.phase = 'game-over';
        item.gameState.playerTurn = false;
      }

      localActiveSeat = index;
      gameState = seat.gameState;
      placementState = seat.placement;

      hidePassDeviceScreen();

      setTurnStatus(
        `${seat.label} wins!`,
        'game-over'
      );

      renderGame();

      return;
    }

    case 'protocol-error': {
      console.warn(
        `[multiplayer] ${event.detail}`
      );

      return;
    }

    case 'opponent-ready':
      return;
  }
}

function startLocalGame(): void {
  disposeLocalGame();

  const [transportOne, transportTwo] =
    LocalGameTransport.createPair();

  const seats: [LocalSeat, LocalSeat] = [
    createLocalSeat(
      'Player 1',
      transportOne,
      true
    ),

    createLocalSeat(
      'Player 2',
      transportTwo,
      false
    )
  ];

  localSeats = seats;
  localLastIncoming = [null, null];

  seats.forEach((seat, index) => {
    seat.gameState.multiplayerGame?.subscribe(
      (event) => {
        handleLocalEvent(
          index as LocalSeatIndex,
          event
        );
      }
    );
  });

  activateLocalSeat(0);
}

/* =========================================================
   ONLINE MULTIPLAYER
   ========================================================= */

function showModeMenu(): void {
  disposeOnlineGame();
  disposeLocalGame();

  gameMode = 'ai';

  onlineScreen!.hidden = true;
  passDeviceScreen!.hidden = true;
  gameScreen!.hidden = true;
  gameModeMenu!.hidden = false;
}

function disposeOnlineGame(): void {
  onlineFlowId++;

  disposeLobbyScreen?.();
  disposeLobbyScreen = null;

  if (gameMode === 'online') {
    gameState.multiplayerGame?.dispose();
  }

  onlineReady = false;
  onlineOpponentReady = false;
  pendingAnimation = null;
}

function startOnlineLobby(): void {
  disposeLocalGame();
  disposeOnlineGame();

  gameMode = 'online';

  gameModeMenu!.hidden = true;
  passDeviceScreen!.hidden = true;
  gameScreen!.hidden = true;
  onlineScreen!.hidden = false;

  disposeLobbyScreen =
    mountLobbyScreen(
      onlineScreen!,
      {
        onMatched: startOnlineGame,
        onBack: showModeMenu
      }
    );
}

function startOnlineGame(
  match: Match
): void {
  disposeLobbyScreen?.();
  disposeLobbyScreen = null;

  const flowId = ++onlineFlowId;

  onlineReady = false;
  onlineOpponentReady = false;

  gameMode = 'online';

  gameState =
    createGameState(
      STANDARD_FLEET,
      'online',
      match.transport,
      match.startsFirst
    );

  placementState =
    createPlacementState();

  gameState.multiplayerGame?.subscribe(
    (event) => {
      if (flowId !== onlineFlowId) {
        return;
      }

      handleOnlineEvent(event);
    }
  );

  syncTurn(gameState);

  onlineScreen!.hidden = true;
  gameModeMenu!.hidden = true;
  passDeviceScreen!.hidden = true;
  gameScreen!.hidden = false;

  setTurnStatus(
    'Opponent found! Place your fleet',
    'player'
  );

  renderGame();
}

function confirmOnlinePlacement(): void {
  if (
    onlineReady ||
    !isFleetComplete()
  ) {
    return;
  }

  if (
    !gameState.multiplayerGame?.markReady()
  ) {
    return;
  }

  onlineReady = true;

  placementState.selectedShip = null;
  placementState.movingShipOriginalPositions = null;

  setTurnStatus(
    onlineOpponentReady
      ? 'Starting battle…'
      : 'Fleet locked. Waiting for your opponent…',
    'player'
  );

  renderGame();
}

function handleOnlineButton(): void {
  if (gameState.phase === 'placement') {
    confirmOnlinePlacement();
    return;
  }

  if (gameState.phase === 'battle') {
    if (
      window.confirm(
        'Forfeit this game? Your opponent will win.'
      )
    ) {
      gameState.multiplayerGame?.forfeit();
    }

    return;
  }

  showModeMenu();
}

function handleOnlineEvent(
  event: MultiplayerEvent
): void {
  const game = gameState.multiplayerGame;

  if (!game) {
    return;
  }

  switch (event.type) {
    case 'opponent-ready': {
      onlineOpponentReady = true;

      if (!onlineReady) {
        setTurnStatus(
          'Opponent is ready. Place your fleet!',
          'player'
        );
      }

      return;
    }

    case 'battle-start': {
      gameState.phase = 'battle';
      gameState.gameOver = false;

      placementState.selectedShip = null;
      placementState.movingShipOriginalPositions = null;

      syncTurn(gameState);

      setTurnStatus(
        event.turn === 'me'
          ? 'Your turn — fire!'
          : "Opponent's turn…",
        event.turn === 'me'
          ? 'player'
          : 'enemy'
      );

      renderGame();

      return;
    }

    case 'shot-fired': {
      syncTurn(gameState);

      setTurnStatus(
        'Firing…',
        'enemy'
      );

      renderGame();

      return;
    }

    case 'shot-resolved': {
      syncTurn(gameState);

      pendingAnimation = {
        target: 'enemy',
        row: event.row,
        column: event.column,
        sunkShip: event.sunk?.name
      };

      /* Final blow: the game-over event renders the end state. */
      if (game.isGameOver()) {
        return;
      }

      if (event.result === 'hit') {
        setTurnStatus(
          event.sunk
            ? `You sunk the enemy ${event.sunk.name}! Shoot again.`
            : 'Hit! Shoot again.',
          'player'
        );
      } else {
        setTurnStatus(
          "Miss! Opponent's turn…",
          'enemy'
        );
      }

      renderGame();

      return;
    }

    case 'incoming-shot': {
      syncTurn(gameState);

      pendingAnimation = {
        target: 'player',
        row: event.row,
        column: event.column,
        sunkShip: event.sunk?.name
      };

      if (game.isGameOver()) {
        return;
      }

      if (event.result === 'hit') {
        setTurnStatus(
          event.sunk
            ? `Opponent sunk your ${event.sunk.name}!`
            : 'Opponent hit your ship!',
          'enemy'
        );
      } else {
        setTurnStatus(
          'Opponent missed! Your turn',
          'player'
        );
      }

      renderGame();

      return;
    }

    case 'shot-rejected': {
      syncTurn(gameState);

      setTurnStatus(
        `Shot rejected (${event.reason}). Try another cell.`,
        'player'
      );

      renderGame();

      return;
    }

    case 'game-over': {
      const duringPlacement =
        gameState.phase === 'placement';

      gameState.gameOver = true;
      gameState.phase = 'game-over';
      gameState.playerTurn = false;

      let message: string;

      if (event.winner === 'me') {
        message =
          event.reason === 'disconnect'
            ? (
              duringPlacement
                ? 'Opponent left before the battle started.'
                : 'Opponent disconnected — you win!'
            )
            : event.reason === 'forfeit'
              ? 'Opponent forfeited — you win!'
              : 'You win! Enemy fleet destroyed.';
      } else {
        message =
          event.reason === 'forfeit'
            ? 'You forfeited the game.'
            : 'You lose! Your fleet was sunk.';
      }

      setTurnStatus(
        message,
        'game-over'
      );

      renderGame();

      /* The match is over: free the socket (and the room) right away. */
      game.dispose();

      return;
    }

    case 'protocol-error': {
      console.warn(
        `[multiplayer] ${event.detail}`
      );

      return;
    }
  }
}

function startSelectedMode(
  selectedMode: GameMode
): void {
  if (selectedMode === 'online') {
    startOnlineLobby();

    return;
  }

  disposeOnlineGame();

  gameMode =
    selectedMode;

  if (
    selectedMode === 'ai'
  ) {
    disposeLocalGame();

    gameModeMenu!.hidden = true;
    gameScreen!.hidden = false;

    gameController.startGame(
      'ai'
    );

    setTurnStatus(
      'Place your fleet',
      'player'
    );

    return;
  }

  if (
    selectedMode === 'local'
  ) {
    gameModeMenu!.hidden = true;
    gameScreen!.hidden = false;

    startLocalGame();

    return;
  }

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

modeAIButton?.addEventListener(
  'click',
  () => {
    startSelectedMode('ai');
  }
);

modeLocalButton?.addEventListener(
  'click',
  () => {
    startSelectedMode('local');
  }
);

modeOnlineButton?.addEventListener(
  'click',
  () => {
    startSelectedMode('online');
  }
);

newGameButton?.addEventListener(
  'click',
  () => {
    if (gameMode === 'online') {
      handleOnlineButton();
      return;
    }

    if (
      gameState.phase === 'placement'
    ) {
      if (!isFleetComplete()) {
        return;
      }

      if (
        gameMode === 'local'
      ) {
        confirmLocalPlacement();
        return;
      }

      gameController.startBattle();

      setTurnStatus(
        'Your turn',
        'player'
      );

      return;
    }

    if (
      gameMode === 'local'
    ) {
      startLocalGame();
      return;
    }

    gameController.startGame(
      gameMode
    );

    setTurnStatus(
      'Place your fleet',
      'player'
    );
  }
);

rotateShipButton?.addEventListener(
  'click',
  () => {
    if (isPlacementLocked()) {
      return;
    }

    rotateShip(
      getPlacementOptions()
    );
  }
);

resetFleetButton?.addEventListener(
  'click',
  () => {
    if (
      gameState.phase !== 'placement' ||
      isPlacementLocked()
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
      gameState.phase !== 'placement' ||
      isPlacementLocked()
    ) {
      return;
    }

    if (
      event.key.toLowerCase() === 'r'
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
  resetFleetButton &&
  gameModeMenu &&
  passDeviceScreen &&
  onlineScreen &&
  gameScreen &&
  modeAIButton &&
  modeLocalButton &&
  modeOnlineButton
) {
  gameModeMenu.hidden = false;
  gameScreen.hidden = true;
}