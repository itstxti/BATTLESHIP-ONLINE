import { Board } from './Board';
import { AI } from './AI';

import type {
  FleetDefinition,
  GamePhase
} from './types';

export type GameState = {
  phase: GamePhase;

  playerTurn: boolean;

  gameOver: boolean;

  playerBoard: Board;

  enemyBoard: Board;

  ai: AI;

  fleet: FleetDefinition[];
};

export function createGameState(
  fleet: FleetDefinition[]
): GameState {
  const playerBoard =
    new Board();

  const enemyBoard =
    new Board();

  enemyBoard.placeFleetRandomly();

  const ai =
    new AI(
      playerBoard.size
    );

  return {
    phase: 'placement',

    playerTurn: true,

    gameOver: false,

    playerBoard,

    enemyBoard,

    ai,

    fleet
  };
}

