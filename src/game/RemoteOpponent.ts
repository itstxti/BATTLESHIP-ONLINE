import type { Board } from './Board';

import type {
  Opponent,
  ShotResult
} from './Opponent';

export class RemoteOpponent
  implements Opponent {

  shoot(_board: Board): ShotResult {
    throw new Error(
      'RemoteOpponent waits for an external shot.'
    );
  }
}

