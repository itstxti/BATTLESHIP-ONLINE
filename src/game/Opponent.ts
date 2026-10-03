import type { Board } from './Board';

export type ShotResult = {
  row: number;
  column: number;
  result: 'hit' | 'miss';
};

export interface Opponent {
  shoot(board: Board): ShotResult;
}

