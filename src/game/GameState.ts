import { Board } from './Board';

import {
  AI
} from './AI';

import type {
  Opponent
} from './Opponent';

import {
  MultiplayerGame
} from './MultiplayerGame';

import type {
  GameTransport
} from './GameTransport';

import type {
  MatchClock
} from './matchStats';

import type {
  AIDifficulty,
  FleetDefinition,
  GameMode,
  GamePhase
} from './types';

export type GameState = MatchClock & {
  phase: GamePhase;
  gameMode: GameMode;
  playerTurn: boolean;
  gameOver: boolean;
  playerBoard: Board;
  enemyBoard: Board;
  opponent: Opponent;
  multiplayerGame: MultiplayerGame | null;
  fleet: FleetDefinition[];
};

export function createGameState(
  fleet: FleetDefinition[],
  gameMode: GameMode = 'ai',
  transport: GameTransport | null = null,
  playerStarts: boolean = true,
  playerBoard: Board | null = null,
  enemyBoard: Board | null = null,
  difficulty: AIDifficulty = 'hard'
): GameState {
  const isMultiplayer =
    gameMode === 'local' ||
    gameMode === 'online';

  const ownBoard =
    playerBoard ?? new Board();

  /*
   * Against the AI the enemy fleet is real and lives here.
   * In multiplayer the enemy board is a fog-of-war tracking board:
   * it starts empty and is filled only from the defender's replies.
   * It must never hold (or share) the opponent's real ships.
   */
  const opponentBoard =
    enemyBoard ?? new Board();

  if (!enemyBoard && !isMultiplayer) {
    opponentBoard.placeFleetRandomly();
  }

  const opponent =
    new AI(
      ownBoard.size,
      difficulty
    );

  const multiplayerGame =
    isMultiplayer && transport
      ? new MultiplayerGame({
          playerBoard: ownBoard,
          enemyBoard: opponentBoard,
          transport,
          startsFirst: playerStarts,
          fleetSize: fleet.length
        })
      : null;

  return {
    phase: 'placement',
    gameMode,
    playerTurn: playerStarts,
    gameOver: false,
    playerBoard: ownBoard,
    enemyBoard: opponentBoard,
    opponent,
    multiplayerGame,
    fleet,
    battleStartedAt: null,
    battleEndedAt: null
  };
}