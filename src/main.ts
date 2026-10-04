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
  cancelBattleTimers,
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
  GameEndReason,
  MultiplayerEvent
} from './game/MultiplayerGame';

import {
  computeMatchStats,
  swapPerspective,
  getMatchDurationMs,
  hasMatchStarted,
  startMatchClock,
  stopMatchClock,
  type MatchOutcome,
  type StatNames
} from './game/matchStats';

import {
  renderResultsScreen
} from './ui/resultsScreen';

import {
  renderHistoryScreen
} from './ui/historyScreen';

import {
  renderStatsScreen
} from './ui/statsScreen';

import {
  confirmDialog,
  dismissConfirmDialog
} from './ui/confirmDialog';

import {
  addMatchRecord,
  clearHistory,
  createMatchRecord,
  loadHistory
} from './game/matchHistory';

import {
  clearPlayerStats,
  loadPlayerStats,
  recordMatchStats
} from './game/playerStats';

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
  AIDifficulty,
  GameMode
} from './game/types';

import {
  audio
} from './audio/audio';


/* =========================================================
   ENTRY SCREEN
   ========================================================= */

const entryScreen =
  document.querySelector<HTMLElement>(
    '#entry-screen'
  );


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

const difficultyScreen =
  document.querySelector<HTMLElement>(
    '#difficulty-screen'
  );

const resultsScreen =
  document.querySelector<HTMLElement>(
    '#results-screen'
  );

const modeAIButton =
  document.querySelector<HTMLButtonElement>(
    '#mode-ai'
  );

const modeLocalButton =
  document.querySelector<HTMLButtonElement>(
    '#mode-local'
  );

const historyScreen =
  document.querySelector<HTMLElement>(
    '#history-screen'
  );

const statsToggleButton =
  document.querySelector<HTMLButtonElement>(
    '#stats-toggle'
  );

const historyToggleButton =
  document.querySelector<HTMLButtonElement>(
    '#history-toggle'
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


/* =========================================================
   GAME CONTROLS
   ========================================================= */

const backToMenuButton =
  document.querySelector<HTMLButtonElement>(
    '#back-to-menu'
  );

const soundToggleButton =
  document.querySelector<HTMLButtonElement>(
    '#sound-toggle'
  );

const soundPanel =
  document.querySelector<HTMLElement>(
    '#sound-panel'
  );

const musicVolumeSlider =
  document.querySelector<HTMLInputElement>(
    '#music-volume'
  );

const musicVolumeValue =
  document.querySelector<HTMLElement>(
    '#music-volume-value'
  );

const sfxVolumeSlider =
  document.querySelector<HTMLInputElement>(
    '#sfx-volume'
  );

const sfxVolumeValue =
  document.querySelector<HTMLElement>(
    '#sfx-volume-value'
  );

const soundMuteButton =
  document.querySelector<HTMLButtonElement>(
    '#sound-mute'
  );

const soundIcon =
  document.querySelector<SVGElement>(
    '#sound-icon'
  );


let gameMode: GameMode = 'ai';

/* Level of the AI in Solo; kept so "New Game" replays at the same level. */
let aiDifficulty: AIDifficulty = 'hard';

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


let localSeats:
  [LocalSeat, LocalSeat] | null = null;

let localActiveSeat:
  LocalSeatIndex = 0;

let localLastIncoming:
  [IncomingShot | null, IncomingShot | null] = [
    null,
    null
  ];

let localFlowId = 0;

let pendingAnimation:
  ShotAnimation | null = null;


let disposeLobbyScreen:
  (() => void) | null = null;

let onlineFlowId = 0;

let onlineReady = false;

let onlineOpponentReady = false;

/*
 * Bumped whenever the results screen is shown, dismissed or superseded, so a
 * delayed presentation that is no longer wanted can tell and do nothing.
 */
let resultsFlowId = 0;

/* A match is saved to the history once, however many times its end is signalled. */
const recordedMatches =
  new WeakSet<GameState>();


/* =========================================================
   SOUND CONTROLS
   ========================================================= */

function updateSoundUI(): void {
  const musicVolume =
    audio.getMusicVolume();

  const sfxVolume =
    audio.getSfxVolume();

  const muted =
    audio.isMuted();

  if (musicVolumeSlider) {
    musicVolumeSlider.value =
      String(musicVolume);
  }

  if (sfxVolumeSlider) {
    sfxVolumeSlider.value =
      String(sfxVolume);
  }

  if (musicVolumeValue) {
    musicVolumeValue.textContent =
      `${Math.round(
        musicVolume * 100
      )}%`;
  }

  if (sfxVolumeValue) {
    sfxVolumeValue.textContent =
      `${Math.round(
        sfxVolume * 100
      )}%`;
  }

  if (soundMuteButton) {
    soundMuteButton.textContent =
      muted
        ? 'Unmute'
        : 'Mute';
  }

  if (soundToggleButton) {
    soundToggleButton.setAttribute(
      'aria-label',
      muted
        ? 'Open sound settings — muted'
        : 'Open sound settings'
    );
  }

  if (soundIcon) {
    soundIcon.innerHTML =
      muted
        ? `
          <path d="M11 5L6 9H3v6h3l5 4V5z" />
          <path d="M16 9l5 6" />
          <path d="M21 9l-5 6" />
        `
        : `
          <path d="M11 5L6 9H3v6h3l5 4V5z" />
          <path d="M15.5 8.5a5 5 0 010 7" />
          <path d="M18 6a9 9 0 010 12" />
        `;
  }
}


function setSoundPanelOpen(
  open: boolean
): void {
  if (
    !soundPanel ||
    !soundToggleButton
  ) {
    return;
  }

  soundPanel.hidden =
    !open;

  soundToggleButton.setAttribute(
    'aria-expanded',
    String(open)
  );
}


function toggleSoundPanel(): void {
  if (!soundPanel) {
    return;
  }

  setSoundPanelOpen(
    Boolean(soundPanel.hidden)
  );
}


function handleBackToMenu(): void {
  setSoundPanelOpen(false);

  // From the results screen, go back one step: the AI level picker in
  // Solo, game mode selection otherwise.
  if (!resultsScreen!.hidden) {
    leaveMatch();
    return;
  }

  // Same from inside the game.
  if (!gameScreen!.hidden) {
    leaveMatch();
    return;
  }

  // From the history screen, back to game mode selection.
  if (!historyScreen!.hidden) {
    showModeMenu();
    return;
  }

  // From the AI level picker, go back to game mode selection.
  if (!difficultyScreen!.hidden) {
    showModeMenu();
    return;
  }

  // If we are in the game mode menu, return to entry screen.
  if (!gameModeMenu!.hidden) {
    handleBackToEntry();
  }

  if (!onlineScreen!.hidden) {
    showModeMenu();
  }

  if (!passDeviceScreen!.hidden) {
    showModeMenu();
  }

}

function leaveMatch(): void {
  const wasSolo =
    gameMode === 'ai';

  // Shared clean-up: timers, results, music and screens.
  showModeMenu();

  if (wasSolo) {
    showDifficultyMenu();
  }
}

function handleBackToEntry(): void {
  setSoundPanelOpen(false);

  dismissConfirmDialog();

  hideResultsScreen();

  cancelBattleTimers(
    gameState
  );

  entryScreen?.classList.remove(
    'hidden'
  );

  gameModeMenu!.hidden =
    true;

  gameScreen!.hidden =
    true;

  passDeviceScreen!.hidden =
    true;

  difficultyScreen!.hidden =
    true;

  historyScreen!.hidden =
    true;

  onlineScreen!.hidden =
    true;
}

/* =========================================================
   ENTRY SCREEN
   ========================================================= */

function enterGame(): void {
  if (!entryScreen) {
    return;
  }

  audio.playSfx(
    'click'
  );

  audio.playMusic(
    'menu'
  );

  entryScreen.classList.add(
    'hidden'
  );

  showModeMenu();
}

entryScreen?.addEventListener(
  'pointerdown',
  enterGame
);


/* =========================================================
   GAME STATE
   ========================================================= */

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
      rotateShipButton!.disabled =
        onlineReady;

      resetFleetButton!.disabled =
        onlineReady;

      newGameButton!.textContent =
        onlineReady
          ? 'Waiting for opponent…'
          : 'Ready';

      newGameButton!.disabled =
        onlineReady ||
        !isFleetComplete();
    } else if (
      gameState.phase === 'battle'
    ) {
      newGameButton!.textContent =
        'Forfeit';
    } else {
      newGameButton!.textContent =
        'Back to Menu';
    }
  }
}


function isPlacementLocked(): boolean {
  return (
    gameMode === 'online' &&
    onlineReady
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
  // Pinned now: a callback from a finished-off match must not act on the next one.
  const state = gameState;

  return {
    gameState: state,

    onGameOver:
      (outcome: MatchOutcome) => {
        presentResults(
          state,
          {
            outcome,
            detail:
              describeMatchEnd(
                outcome === 'victory' ? 'me' : 'opponent',
                'fleet-sunk'
              ),
            delayMs:
              RESULTS_DELAY_MS
          }
        );
      },

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


/* =========================================================
   RENDERING
   ========================================================= */

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
            row:
              pendingAnimation.row,

            column:
              pendingAnimation.column
          }
          : undefined,

      onPlacedShipSelect:
        (row, column) => {
          if (
            isPlacementLocked()
          ) {
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
          if (
            isPlacementLocked()
          ) {
            return;
          }

          handlePlacement(
            row,
            column,
            getPlacementOptions()
          );
        },

      onRotate: () => {
        if (
          isPlacementLocked()
        ) {
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
      if (
        isPlacementLocked()
      ) {
        return;
      }

      selectShip(
        ship,
        getPlacementOptions()
      );
    },
    pendingAnimation?.target === 'player'
      ? pendingAnimation.sunkShip
      : undefined,
    true
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
            row:
              pendingAnimation.row,

            column:
              pendingAnimation.column
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

  pendingAnimation =
    null;

  updateUI();
}


/* =========================================================
   PLACEMENT
   ========================================================= */

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
   RESULTS SCREEN
   ========================================================= */

/*
 * Lets the final explosion and the win/lose jingle land before the
 * screen changes. Skipped when nothing visible just happened (forfeit,
 * disconnect).
 */
const RESULTS_DELAY_MS = 750;

type MatchEnd = {
  outcome: MatchOutcome;
  detail: string;
  delayMs: number;

  /**
   * Local (hot-seat) matches have no enemy: the results are shown as
   * Player 1 vs Player 2, whichever seat won.
   */
  localWinnerSeat?: LocalSeatIndex;
};


function describeMatchEnd(
  winner: 'me' | 'opponent',
  reason: GameEndReason
): string {
  if (winner === 'me') {
    return reason === 'disconnect'
      ? 'Your opponent disconnected.'
      : reason === 'forfeit'
        ? 'Your opponent forfeited.'
        : 'Enemy fleet destroyed.';
  }

  return reason === 'forfeit'
    ? 'You forfeited the match.'
    : 'Your fleet was sunk.';
}


function hideResultsScreen(): void {
  resultsFlowId++;

  resultsScreen!.hidden =
    true;

  resultsScreen!.replaceChildren();
}


/**
 * The single entry point every game-over path goes through (Solo, Local
 * and Online), so they cannot diverge.
 *
 * The numbers are frozen immediately; only the screen swap is delayed.
 */
function presentResults(
  state: GameState,
  end: MatchEnd
): void {
  if (
    !resultsScreen ||
    state !== gameState
  ) {
    // A leftover callback from a match that was already replaced.
    return;
  }

  if (
    !hasMatchStarted(state)
  ) {
    // No battle took place (e.g. the opponent left during placement):
    // there is no match to summarise.
    return;
  }

  stopMatchClock(
    state
  );

  const isLocalMatch =
    end.localWinnerSeat !== undefined &&
    localSeats !== null;

  // Stats are always computed from the point of view of `state`.
  let stats =
    computeMatchStats(
      state.enemyBoard,
      getMatchDurationMs(
        state
      ),
      state.playerBoard
    );

  let names: StatNames | undefined;

  let boards = {
    player:
      state.playerBoard,

    enemy:
      state.enemyBoard
  };

  if (
    isLocalMatch &&
    localSeats
  ) {
    // Always Player 1 on the left and Player 2 on the right.
    if (
      end.localWinnerSeat === 1
    ) {
      stats =
        swapPerspective(
          stats
        );
    }

    names = {
      player:
        localSeats[0].label,

      opponent:
        localSeats[1].label
    };

    boards = {
      player:
        localSeats[0].gameState.playerBoard,

      enemy:
        localSeats[1].gameState.playerBoard
    };
  }

  const view = {
    outcome:
      end.outcome,

    detail:
      end.detail,

    stats,

    names,

    boards
  };

  if (!recordedMatches.has(state)) {
    recordedMatches.add(state);

    // Persistent statistics: Solo and Online only. Local matches are skipped
    // inside recordMatchStats (no stable player identity on a shared device).
    recordMatchStats({
      mode:
        gameMode,

      difficulty:
        gameMode === 'ai'
          ? aiDifficulty
          : undefined,

      outcome:
        end.outcome,

      stats
    });

    addMatchRecord(
      createMatchRecord({
        mode:
          gameMode,

        difficulty:
          gameMode === 'ai'
            ? aiDifficulty
            : undefined,

        // Local: "victory" = Player 1 won (stats are already oriented that way).
        outcome:
          isLocalMatch
            ? (
              end.localWinnerSeat === 0
                ? 'victory'
                : 'defeat'
            )
            : end.outcome,

        stats
      })
    );
  }

  const flowId =
    ++resultsFlowId;

  const show = (): void => {
    if (
      flowId !== resultsFlowId ||
      state !== gameState
    ) {
      // Dismissed, or a new match already replaced this one.
      return;
    }

    // The match is over: a pending "forfeit?" question no longer applies.
    dismissConfirmDialog();

    gameScreen!.hidden =
      true;

    gameModeMenu!.hidden =
      true;

    passDeviceScreen!.hidden =
      true;

    onlineScreen!.hidden =
      true;

    const headline =
      renderResultsScreen(
        resultsScreen,
        view,
        handleResultsNewGame
      );

    resultsScreen.hidden =
      false;

    // The battle is over: swap its music for the menu theme (cross-fade).
    audio.playMusic(
      'menu'
    );

    audio.playSfx(
      view.outcome === 'victory'
        ? 'win'
        : 'lose'
    );

    // Focus the headline (not the button) so screen readers announce the
    // outcome; New Game is one Tab away.
    headline.focus();
  };

  if (
    end.delayMs > 0
  ) {
    setTimeout(
      show,
      end.delayMs
    );

    return;
  }

  show();
}


/*
 * Starts another match in the same mode. Online has no opponent yet, so
 * that means going back to the lobby to be paired again.
 */
function handleResultsNewGame(): void {
  startSelectedMode(
    gameMode
  );
}


/* =========================================================
   LOCAL MULTIPLAYER
   ========================================================= */

function syncTurn(
  state: GameState
): void {
  state.playerTurn =
    state.multiplayerGame?.canShoot() ??
    false;
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

  for (
    const seat of localSeats
  ) {
    seat.gameState
      .multiplayerGame
      ?.dispose();
  }

  localSeats =
    null;

  pendingAnimation =
    null;
}


function activateLocalSeat(
  index: LocalSeatIndex
): void {
  if (!localSeats) {
    return;
  }

  const seat =
    localSeats[index];

  localActiveSeat =
    index;

  gameState =
    seat.gameState;

  placementState =
    seat.placement;

  syncTurn(
    gameState
  );

  hidePassDeviceScreen();

  setTurnStatus(
    gameState.phase === 'placement'
      ? `${seat.label} — Place your fleet`
      : `${seat.label} — Your turn`,
    'player'
  );

  const incoming =
    localLastIncoming[index];

  if (incoming) {
    pendingAnimation = {
      target:
        'player',

      ...incoming
    };

    localLastIncoming[index] =
      null;
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
    localSeats[
      options.seatIndex
    ].label;

  gameScreen!.hidden =
    true;

  gameModeMenu!.hidden =
    true;

  passDeviceScreen!.hidden =
    false;

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
        ${
          options.seatIndex === 0
            ? '01'
            : '02'
        }
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

  const flowId =
    localFlowId;

  passDeviceScreen!
    .querySelector<HTMLButtonElement>(
      '#continue-local'
    )
    ?.addEventListener(
      'click',
      () => {
        if (
          flowId !==
          localFlowId
        ) {
          return;
        }

        options.onContinue();
      }
    );
}


function hidePassDeviceScreen(): void {
  passDeviceScreen!.hidden =
    true;

  gameModeMenu!.hidden =
    true;

  gameScreen!.hidden =
    false;
}


function confirmLocalPlacement(): void {
  if (!localSeats) {
    return;
  }

  const seat =
    localSeats[
      localActiveSeat
    ];

  if (
    !seat.gameState.multiplayerGame?.markReady()
  ) {
    return;
  }

  if (
    localActiveSeat === 0
  ) {
    showPassDeviceScreen({
      seatIndex:
        1,

      message:
        'Player 1 is ready. Pass the device to Player 2.',

      buttonLabel:
        'Place your fleet',

      onContinue: () => {
        activateLocalSeat(
          1
        );
      }
    });
  }
}


function scheduleLocalHandoff(
  nextSeat: LocalSeatIndex
): void {
  const flowId =
    localFlowId;

  setTimeout(
    () => {
      if (
        flowId !== localFlowId ||
        !localSeats
      ) {
        return;
      }

      showPassDeviceScreen({
        seatIndex:
          nextSeat,

        message:
          `Pass the device to ${localSeats[nextSeat].label}.`,

        buttonLabel:
          'Start your turn',

        onContinue: () => {
          activateLocalSeat(
            nextSeat
          );
        }
      });
    },
    1000
  );
}


function handleLocalEvent(
  index: LocalSeatIndex,
  event: MultiplayerEvent
): void {
  if (!localSeats) {
    return;
  }

  const seat =
    localSeats[index];

  switch (event.type) {

    case 'battle-start': {
      if (
        index !== 0
      ) {
        return;
      }

      for (
        const item of localSeats
      ) {
        item.gameState.phase =
          'battle';

        startMatchClock(
          item.gameState
        );

        item.gameState.gameOver =
          false;

        item.placement.selectedShip =
          null;

        item.placement
          .movingShipOriginalPositions =
          null;

        syncTurn(
          item.gameState
        );
      }

      const first:
        LocalSeatIndex =
        localSeats[0]
          .gameState
          .playerTurn
          ? 0
          : 1;

      audio.playMusic(
        'battle'
      );
      
      showPassDeviceScreen({
        seatIndex:
          first,

        message:
          `Both fleets are ready. Pass the device to ${localSeats[first].label}.`,

        buttonLabel:
          'Start the battle',

        onContinue: () => {
          activateLocalSeat(
            first
          );
        }
      });

      return;
    }


    case 'shot-fired': {
      if (
        index !==
        localActiveSeat
      ) {
        return;
      }

      audio.playSfx(
        'fire'
      );

      syncTurn(
        seat.gameState
      );

      setTurnStatus(
        'Firing...',
        'enemy'
      );

      renderGame();

      return;
    }


    case 'shot-resolved': {
      if (
        index !==
        localActiveSeat
      ) {
        return;
      }

      syncTurn(
        seat.gameState
      );

      pendingAnimation = {
        target:
          'enemy',

        row:
          event.row,

        column:
          event.column,

        sunkShip:
          event.sunk?.name
      };

      if (
        seat.gameState
          .multiplayerGame
          ?.isGameOver()
      ) {
        return;
      }

      if (
        event.result ===
        'hit'
      ) {
        audio.playSfx(
          event.sunk
            ? 'sunk'
            : 'hit'
        );

        setTurnStatus(
          event.sunk
            ? `You sunk the enemy ${event.sunk.name}! Shoot again.`
            : 'Hit! Shoot again.',
          'player'
        );
      } else {
        audio.playSfx(
          'miss'
        );

        const next =
          otherSeat(
            index
          );

        setTurnStatus(
          `Miss! Pass the device to ${localSeats[next].label}.`,
          'enemy'
        );

        scheduleLocalHandoff(
          next
        );
      }

      renderGame();

      return;
    }


    case 'shot-rejected': {
      if (
        index !==
        localActiveSeat
      ) {
        return;
      }

      syncTurn(
        seat.gameState
      );

      setTurnStatus(
        `Shot rejected (${event.reason}). Try another cell.`,
        'player'
      );

      renderGame();

      return;
    }


    case 'incoming-shot': {
      if (
        index !==
        localActiveSeat
      ) {
        localLastIncoming[index] = {
          row:
            event.row,

          column:
            event.column,

          sunkShip:
            event.sunk?.name
        };
      }

      return;
    }


    case 'game-over': {
      if (
        event.winner !==
        'me'
      ) {
        return;
      }

      localFlowId++;

      for (
        const item of localSeats
      ) {
        item.gameState.gameOver =
          true;

        item.gameState.phase =
          'game-over';

        item.gameState.playerTurn =
          false;
      }

      localActiveSeat =
        index;

      gameState =
        seat.gameState;

      placementState =
        seat.placement;

      hidePassDeviceScreen();

      setTurnStatus(
        `${seat.label} wins!`,
        'game-over'
      );

      renderGame();

      presentResults(
        seat.gameState,
        {
          outcome:
            'victory',

          detail:
            `${seat.label} destroyed the enemy fleet.`,

          delayMs:
            RESULTS_DELAY_MS,

          localWinnerSeat:
            index
        }
      );

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

  const [
    transportOne,
    transportTwo
  ] =
    LocalGameTransport.createPair();

  const seats:
    [LocalSeat, LocalSeat] = [
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

  localSeats =
    seats;

  localLastIncoming = [
    null,
    null
  ];

  seats.forEach(
    (seat, index) => {
      seat.gameState
        .multiplayerGame
        ?.subscribe(
          (event) => {
            handleLocalEvent(
              index as LocalSeatIndex,
              event
            );
          }
        );
    }
  );

  activateLocalSeat(
    0
  );
}


/* =========================================================
   ONLINE MULTIPLAYER
   ========================================================= */

function showModeMenu(): void {
  dismissConfirmDialog();

  hideResultsScreen();

  cancelBattleTimers(
    gameState
  );

  disposeOnlineGame();
  disposeLocalGame();

  gameMode =
    'ai';

  setSoundPanelOpen(
    false
  );

  audio.playMusic(
    'menu'
  );

  onlineScreen!.hidden =
    true;

  passDeviceScreen!.hidden =
    true;

  difficultyScreen!.hidden =
    true;

  historyScreen!.hidden =
    true;

  gameScreen!.hidden =
    true;

  gameModeMenu!.hidden =
    false;
}


/*
 * Statistics and match history share one screen element; this says which of
 * the two it is currently showing (only meaningful while it is visible).
 */
type RecordsView = 'stats' | 'history';

let recordsView: RecordsView = 'history';


function showRecordsScreen(
  view: RecordsView
): void {
  // Opening it from inside a match abandons it, so ask first.
  const matchInProgress =
    gameState.phase === 'battle' &&
    !gameState.gameOver &&
    (
      !gameScreen!.hidden ||
      !passDeviceScreen!.hidden
    );

  if (matchInProgress) {
    const state = gameState;

    void confirmDialog({
      title: 'Leave the current match?',
      message: 'Your progress will be lost.',
      confirmLabel: 'Leave match',
      danger: true
    }).then((confirmed) => {
      if (
        confirmed &&
        state === gameState
      ) {
        openRecordsScreen(view);
      }
    });

    return;
  }

  openRecordsScreen(view);
}


function openRecordsScreen(
  view: RecordsView
): void {
  // Shared clean-up (timers, results, music, other screens).
  showModeMenu();

  gameModeMenu!.hidden =
    true;

  recordsView =
    view;

  if (view === 'stats') {
    renderStatsScreen(
      historyScreen!,
      loadPlayerStats,
      clearPlayerStats
    );
  } else {
    renderHistoryScreen(
      historyScreen!,
      loadHistory(),
      () => {
        clearHistory();

        openRecordsScreen('history');
      }
    );
  }

  historyScreen!.hidden =
    false;

  // Fade the screen in again, also when switching between its two views
  // (removing the class and forcing a reflow restarts the animation).
  historyScreen!.classList.remove(
    'records-enter'
  );

  void historyScreen!.offsetWidth;

  historyScreen!.classList.add(
    'records-enter'
  );
}


function showDifficultyMenu(): void {
  gameModeMenu!.hidden =
    true;

  difficultyScreen!.hidden =
    false;
}


function startAIGame(
  difficulty: AIDifficulty
): void {
  aiDifficulty =
    difficulty;

  difficultyScreen!.hidden =
    true;

  startSelectedMode(
    'ai'
  );
}


function disposeOnlineGame(): void {
  onlineFlowId++;

  disposeLobbyScreen?.();

  disposeLobbyScreen =
    null;

  if (
    gameMode ===
    'online'
  ) {
    gameState
      .multiplayerGame
      ?.dispose();
  }

  onlineReady =
    false;

  onlineOpponentReady =
    false;

  pendingAnimation =
    null;
}


function startOnlineLobby(): void {
  disposeLocalGame();

  disposeOnlineGame();

  gameMode =
    'online';

  gameModeMenu!.hidden =
    true;

  passDeviceScreen!.hidden =
    true;

  gameScreen!.hidden =
    true;

  onlineScreen!.hidden =
    false;

  disposeLobbyScreen =
    mountLobbyScreen(
      onlineScreen!,
      {
        onMatched:
          startOnlineGame,

        onBack:
          showModeMenu
      }
    );
}


function startOnlineGame(
  match: Match
): void {
  disposeLobbyScreen?.();

  disposeLobbyScreen =
    null;

  const flowId =
    ++onlineFlowId;

  onlineReady =
    false;

  onlineOpponentReady =
    false;

  gameMode =
    'online';

  gameState =
    createGameState(
      STANDARD_FLEET,
      'online',
      match.transport,
      match.startsFirst
    );

  placementState =
    createPlacementState();

  gameState
    .multiplayerGame
    ?.subscribe(
      (event) => {
        if (
          flowId !==
          onlineFlowId
        ) {
          return;
        }

        handleOnlineEvent(
          event
        );
      }
    );

  syncTurn(
    gameState
  );

  onlineScreen!.hidden =
    true;

  gameModeMenu!.hidden =
    true;

  passDeviceScreen!.hidden =
    true;

  gameScreen!.hidden =
    false;

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
    !gameState
      .multiplayerGame
      ?.markReady()
  ) {
    return;
  }

  onlineReady =
    true;

  placementState.selectedShip =
    null;

  placementState
    .movingShipOriginalPositions =
    null;

  setTurnStatus(
    onlineOpponentReady
      ? 'Starting battle…'
      : 'Fleet locked. Waiting for your opponent…',
    'player'
  );

  renderGame();
}


function handleOnlineButton(): void {
  if (
    gameState.phase ===
    'placement'
  ) {
    confirmOnlinePlacement();

    return;
  }

  if (
    gameState.phase ===
    'battle'
  ) {
    // Pinned now: the match may end (e.g. a disconnect) while the dialog is open.
    const state = gameState;

    void confirmDialog({
      title: 'Forfeit this game?',
      message: 'Your opponent will win.',
      confirmLabel: 'Forfeit',
      danger: true
    }).then((confirmed) => {
      if (
        confirmed &&
        state === gameState &&
        state.phase === 'battle'
      ) {
        state
          .multiplayerGame
          ?.forfeit();
      }
    });

    return;
  }

  showModeMenu();
}


function handleOnlineEvent(
  event: MultiplayerEvent
): void {
  const game =
    gameState.multiplayerGame;

  if (!game) {
    return;
  }

  switch (event.type) {

    case 'opponent-ready': {
      onlineOpponentReady =
        true;

      if (
        !onlineReady
      ) {
        setTurnStatus(
          'Opponent is ready. Place your fleet!',
          'player'
        );
      }

      return;
    }


    case 'battle-start': {
      gameState.phase =
        'battle';

      startMatchClock(
        gameState
      );

      gameState.gameOver =
        false;

      placementState.selectedShip =
        null;

      placementState
        .movingShipOriginalPositions =
        null;

      audio.playMusic(
        'battle'
      );

      syncTurn(
        gameState
      );

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
      audio.playSfx(
        'fire'
      );

      syncTurn(
        gameState
      );

      setTurnStatus(
        'Firing…',
        'enemy'
      );

      renderGame();

      return;
    }


    case 'shot-resolved': {
      syncTurn(
        gameState
      );

      pendingAnimation = {
        target:
          'enemy',

        row:
          event.row,

        column:
          event.column,

        sunkShip:
          event.sunk?.name
      };

      if (
        game.isGameOver()
      ) {
        return;
      }

      if (
        event.result ===
        'hit'
      ) {
        audio.playSfx(
          event.sunk
            ? 'sunk'
            : 'hit'
        );

        setTurnStatus(
          event.sunk
            ? `You sunk the enemy ${event.sunk.name}! Shoot again.`
            : 'Hit! Shoot again.',
          'player'
        );
      } else {
        audio.playSfx(
          'miss'
        );

        setTurnStatus(
          "Miss! Opponent's turn…",
          'enemy'
        );
      }

      renderGame();

      return;
    }


    case 'incoming-shot': {
      syncTurn(
        gameState
      );

      pendingAnimation = {
        target:
          'player',

        row:
          event.row,

        column:
          event.column,

        sunkShip:
          event.sunk?.name
      };

      if (
        game.isGameOver()
      ) {
        return;
      }

      if (
        event.result ===
        'hit'
      ) {
        audio.playSfx(
          event.sunk
            ? 'sunk'
            : 'hit'
        );

        setTurnStatus(
          event.sunk
            ? `Opponent sunk your ${event.sunk.name}!`
            : 'Opponent hit your ship!',
          'enemy'
        );
      } else {
        audio.playSfx(
          'miss'
        );

        setTurnStatus(
          'Opponent missed! Your turn',
          'player'
        );
      }

      renderGame();

      return;
    }


    case 'shot-rejected': {
      syncTurn(
        gameState
      );

      setTurnStatus(
        `Shot rejected (${event.reason}). Try another cell.`,
        'player'
      );

      renderGame();

      return;
    }


    case 'game-over': {
      const duringPlacement =
        gameState.phase ===
        'placement';

      gameState.gameOver =
        true;

      gameState.phase =
        'game-over';

      gameState.playerTurn =
        false;

      let message: string;

      if (
        event.winner ===
        'me'
      ) {
        if (
          duringPlacement
        ) {
          // No battle took place, so no results screen will play the jingle.
          audio.playSfx(
            'win'
          );
        }

        message =
          event.reason ===
          'disconnect'
            ? (
              duringPlacement
                ? 'Opponent left before the battle started.'
                : 'Opponent disconnected — you win!'
            )
            : event.reason ===
              'forfeit'
              ? 'Opponent forfeited — you win!'
              : 'You win! Enemy fleet destroyed.';
      } else {
        message =
          event.reason ===
          'forfeit'
            ? 'You forfeited the game.'
            : 'You lose! Your fleet was sunk.';
      }

      setTurnStatus(
        message,
        'game-over'
      );

      renderGame();

      presentResults(
        gameState,
        {
          outcome:
            event.winner === 'me'
              ? 'victory'
              : 'defeat',

          detail:
            describeMatchEnd(
              event.winner,
              event.reason
            ),

          delayMs:
            event.reason === 'fleet-sunk'
              ? RESULTS_DELAY_MS
              : 0
        }
      );

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


/* =========================================================
   GAME MODE
   ========================================================= */

function startSelectedMode(
  selectedMode: GameMode
): void {
  hideResultsScreen();

  difficultyScreen!.hidden =
    true;

  if (
    selectedMode ===
    'online'
  ) {
    startOnlineLobby();

    return;
  }

  disposeOnlineGame();

  gameMode =
    selectedMode;

  if (
    selectedMode ===
    'ai'
  ) {
    disposeLocalGame();

    gameModeMenu!.hidden =
      true;

    gameScreen!.hidden =
      false;

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
    selectedMode ===
    'local'
  ) {
    gameModeMenu!.hidden =
      true;

    gameScreen!.hidden =
      false;

    startLocalGame();

    return;
  }
}


/* =========================================================
   GAME CONTROLLER
   ========================================================= */

const gameController =
  createGameController({
    fleet:
      STANDARD_FLEET,

    getGameState:
      () => gameState,

    getPlacementState:
      () => placementState,

    getDifficulty:
      () => aiDifficulty,

    setGameState:
      (newGameState) => {
        // The match being replaced must not keep playing in the background.
        cancelBattleTimers(
          gameState
        );

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


/* =========================================================
   GLOBAL BUTTON SOUND
   ========================================================= */

document.addEventListener(
  'click',
  (event) => {
    const target =
      event.target;

    // Element, not HTMLElement: clicking the icon of a button targets its
    // inner <svg>/<path>, which is an SVGElement and would get no sound.
    if (
      target instanceof Element &&
      target.closest('button')
    ) {
      audio.playSfx(
        'click'
      );
    }
  }
);


/* =========================================================
   SOUND UI
   ========================================================= */

soundToggleButton?.addEventListener(
  'click',
  (event) => {
    audio.playSfx('click');

    event.stopPropagation();

    toggleSoundPanel();

    updateSoundUI();
  }
);


soundPanel?.addEventListener(
  'click',
  (event) => {
    event.stopPropagation();
  }
);


musicVolumeSlider?.addEventListener(
  'input',
  () => {
    const value =
      Number(
        musicVolumeSlider.value
      );

    audio.setMusicVolume(
      value
    );

    audio.playSfx('click');
    updateSoundUI();
  }
);


sfxVolumeSlider?.addEventListener(
  'input',
  () => {
    const value =
      Number(
        sfxVolumeSlider.value
      );

    audio.setSfxVolume(
      value
    );

    audio.playSfx('click');
    updateSoundUI();
  }
);


soundMuteButton?.addEventListener(
  'click',
  (event) => {
    event.stopPropagation();

    audio.toggleMute();
    audio.playSfx('click');
    updateSoundUI();
  }
);


/*
 * Close the sound panel when clicking outside it.
 */
document.addEventListener(
  'click',
  (event) => {
    if (
      !soundPanel ||
      soundPanel.hidden
    ) {
      return;
    }

    const target =
      event.target;

    if (
      target instanceof Node &&
      (
        soundPanel.contains(
          target
        ) ||
        soundToggleButton?.contains(
          target
        )
      )
    ) {
      return;
    }

    setSoundPanelOpen(
      false
    );
  }
);


/* =========================================================
   NAVIGATION
   ========================================================= */

backToMenuButton?.addEventListener(
  'click',
  (event) => {
    event.stopPropagation();

    audio.playSfx(
      'click'
    );

    handleBackToMenu();
  }
);


modeAIButton?.addEventListener(
  'click',
  showDifficultyMenu
);


(['easy', 'medium', 'hard'] as const).forEach(
  (level) => {
    document
      .querySelector<HTMLButtonElement>(
        `#difficulty-${level}`
      )
      ?.addEventListener(
        'click',
        () => {
          startAIGame(
            level
          );
        }
      );
  }
);


modeLocalButton?.addEventListener(
  'click',
  () => {
    startSelectedMode(
      'local'
    );
  }
);


/*
 * No stopPropagation here: the click sound comes from the global button
 * listener on `document`, which a stopped event would never reach.
 */
/* A second click on the same button closes the screen again. */
function toggleRecordsScreen(
  view: RecordsView
): void {
  setSoundPanelOpen(false);

  if (
    !historyScreen!.hidden &&
    recordsView === view
  ) {
    showModeMenu();
    return;
  }

  showRecordsScreen(view);
}

statsToggleButton?.addEventListener(
  'click',
  () => toggleRecordsScreen('stats')
);

historyToggleButton?.addEventListener(
  'click',
  () => toggleRecordsScreen('history')
);


modeOnlineButton?.addEventListener(
  'click',
  () => {
    startSelectedMode(
      'online'
    );
  }
);


/* =========================================================
   NEW GAME / MAIN GAME CONTROLS
   ========================================================= */

newGameButton?.addEventListener(
  'click',
  () => {
    if (
      gameMode ===
      'online'
    ) {
      handleOnlineButton();

      return;
    }

    if (
      gameState.phase ===
      'placement'
    ) {
      if (
        !isFleetComplete()
      ) {
        return;
      }

      if (
        gameMode ===
        'local'
      ) {
        confirmLocalPlacement();

        return;
      }

      gameController.startBattle();

      audio.playMusic(
        'battle'
      );

      setTurnStatus(
        'Your turn',
        'player'
      );

      return;
    }

    if (
      gameMode ===
      'local'
    ) {
      startLocalGame();

      return;
    }

    /*
     * Starting another game from inside the game
     * keeps the battle music.
     */
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
    if (
      isPlacementLocked()
    ) {
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
      gameState.phase !==
        'placement' ||
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


/* =========================================================
   KEYBOARD CONTROLS
   ========================================================= */

document.addEventListener(
  'keydown',
  (event) => {
    if (
      gameState.phase !==
        'placement' ||
      isPlacementLocked()
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
      event.key ===
      'Escape'
    ) {
      cancelPlacement(
        getPlacementOptions()
      );
    }
  }
);


/* =========================================================
   INITIALIZATION
   ========================================================= */

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
  gameModeMenu.hidden =
    false;

  gameScreen.hidden =
    true;

  updateSoundUI();
}