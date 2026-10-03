import { describe, expect, it } from 'vitest';

import { Board } from '../Board';
import { STANDARD_FLEET } from '../fleet';
import { PROTOCOL_VERSION, parseGameMessage } from '../GameMessage';
import type { GameMessage } from '../GameMessage';
import type { GameTransport, Unsubscribe } from '../GameTransport';
import { LocalGameTransport } from '../LocalGameTransport';
import {
  MultiplayerGame,
  type MultiplayerEvent
} from '../MultiplayerGame';

/** Lets queued microtasks (transport deliveries) run. */
const flush = async () => {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
};

/** Deterministic fleet: one ship per row, starting at column 0. */
function fixedBoard(): Board {
  const board = new Board();

  STANDARD_FLEET.forEach((ship, row) => {
    board.placeShip(
      ship.name,
      ship.size,
      Array.from({ length: ship.size }, (_, column) => ({ row, column }))
    );
  });

  return board;
}

type Peer = {
  game: MultiplayerGame;
  own: Board;
  tracking: Board;
  events: MultiplayerEvent[];
};

function createPeer(
  transport: GameTransport,
  startsFirst: boolean,
  own: Board = fixedBoard()
): Peer {
  const tracking = new Board();

  const game = new MultiplayerGame({
    playerBoard: own,
    enemyBoard: tracking,
    transport,
    startsFirst,
    fleetSize: STANDARD_FLEET.length
  });

  const events: MultiplayerEvent[] = [];

  game.subscribe((event) => events.push(event));

  return { game, own, tracking, events };
}

async function startedMatch() {
  const [t1, t2] = LocalGameTransport.createPair();

  const a = createPeer(t1, true);
  const b = createPeer(t2, false);

  a.game.markReady();
  b.game.markReady();

  await flush();

  return { a, b, t1, t2 };
}

describe('handshake', () => {
  it('starts the battle only when BOTH players are ready', async () => {
    const [t1, t2] = LocalGameTransport.createPair();
    const a = createPeer(t1, true);
    const b = createPeer(t2, false);

    a.game.markReady();
    await flush();

    expect(a.game.getStatus()).toBe('placement');
    expect(b.game.getStatus()).toBe('placement');

    b.game.markReady();
    await flush();

    expect(a.game.getStatus()).toBe('battle');
    expect(b.game.getStatus()).toBe('battle');
    expect(a.game.isMyTurn()).toBe(true);
    expect(b.game.isMyTurn()).toBe(false);
  });

  it('refuses markReady with an incomplete fleet', () => {
    const [t1] = LocalGameTransport.createPair();
    const peer = createPeer(t1, true, new Board());

    expect(peer.game.markReady()).toBe(false);
  });

  it('rejects shots that arrive before the battle starts', async () => {
    const [t1, t2] = LocalGameTransport.createPair();
    const a = createPeer(t1, true);
    const b = createPeer(t2, false);

    // A hostile/buggy client shoots during placement.
    t1.send({ type: 'shot', seq: 1, row: 0, column: 0 });
    await flush();

    expect(b.own.getCell(0, 0)).toBe('ship');
    expect(a.game.isAwaitingResult()).toBe(false);
  });
});

describe('turn rules (regression: deadlock after a hit)', () => {
  it('a hit keeps the turn with the shooter on BOTH peers', async () => {
    const { a, b } = await startedMatch();

    expect(a.game.shoot(0, 0)).toBe(true); // B has a ship at (0,0)
    await flush();

    expect(a.game.canShoot()).toBe(true);
    expect(b.game.isMyTurn()).toBe(false);
    expect(a.tracking.getCell(0, 0)).toBe('hit');
  });

  it('a miss passes the turn on BOTH peers', async () => {
    const { a, b } = await startedMatch();

    a.game.shoot(9, 9);
    await flush();

    expect(a.game.isMyTurn()).toBe(false);
    expect(b.game.canShoot()).toBe(true);
    expect(a.tracking.getCell(9, 9)).toBe('miss');
  });

  it('always has exactly one side able to move until the game ends', async () => {
    const { a, b } = await startedMatch();

    let steps = 0;

    while (!a.game.isGameOver() && steps++ < 400) {
      const canA = a.game.canShoot();
      const canB = b.game.canShoot();

      // XOR: never both locked out (the old deadlock), never both active.
      expect(canA !== canB).toBe(true);

      const shooter = canA ? a : b;
      let fired = false;

      for (let row = 0; row < 10 && !fired; row++) {
        for (let column = 0; column < 10 && !fired; column++) {
          fired = shooter.game.shoot(row, column);
        }
      }

      expect(fired).toBe(true);

      await flush();
    }

    expect(a.game.isGameOver()).toBe(true);
    expect(b.game.isGameOver()).toBe(true);
  });

  it('cannot fire twice while a result is pending', async () => {
    const { a } = await startedMatch();

    expect(a.game.shoot(9, 9)).toBe(true);
    expect(a.game.shoot(9, 8)).toBe(false);
  });
});

describe('shot validation', () => {
  it('rejects a shot out of turn instead of silently ignoring it', async () => {
    const { a, b } = await startedMatch();

    // B is not allowed to shoot yet; forge one on the wire.
    (b.game as unknown as { turn: string }).turn = 'me';
    b.game.shoot(5, 5);
    await flush();

    expect(b.events.some((e) => e.type === 'shot-rejected')).toBe(true);
    expect(a.own.getCell(5, 5)).toBe('empty');
  });

  it('answers a repeated cell with a rejection and the shooter keeps playing', async () => {
    const { a, b, t1 } = await startedMatch();

    a.game.shoot(0, 0); // hit: A keeps the turn
    await flush();

    // Forge a duplicate on the wire (bypasses A's own local guard).
    t1.send({ type: 'shot', seq: 99, row: 0, column: 0 });
    await flush();

    expect(b.own.getCell(0, 0)).toBe('hit');
    expect(b.game.isGameOver()).toBe(false);
    expect(b.game.isMyTurn()).toBe(false); // still A's turn
    expect(a.game.canShoot()).toBe(true);
  });

  it('does not let the local player re-shoot a known cell', async () => {
    const { a } = await startedMatch();

    a.game.shoot(0, 0);
    await flush();

    expect(a.game.shoot(0, 0)).toBe(false);
  });

  it('survives out-of-bounds and non-integer coordinates without throwing', async () => {
    const [t1, t2] = LocalGameTransport.createPair();
    const victim = createPeer(t2, false);
    const attacker = createPeer(t1, true);

    attacker.game.markReady();
    victim.game.markReady();
    await flush();

    const raw = (m: unknown) => (t1 as unknown as { send(x: unknown): void }).send(m);

    raw({ type: 'shot', seq: 1, row: -1, column: 0 });
    raw({ type: 'shot', seq: 2, row: 10, column: 3 });
    raw({ type: 'shot', seq: 3, row: 1.5, column: 2 });
    raw({ type: 'shot', seq: 4, row: 'a', column: 2 });
    raw('garbage');
    raw(null);

    await flush();

    expect(victim.game.getStatus()).toBe('battle');
    expect(victim.events.some((e) => e.type === 'protocol-error')).toBe(true);
  });
});

describe('fog of war', () => {
  it('never exposes the opponent fleet on the tracking board', async () => {
    const { a } = await startedMatch();

    expect(a.tracking.getShips()).toHaveLength(0);

    for (let row = 0; row < 10; row++) {
      for (let column = 0; column < 10; column++) {
        expect(a.tracking.getCell(row, column)).toBe('empty');
      }
    }
  });

  it('reveals a ship only once it is sunk, and marks it sunk', async () => {
    const { a } = await startedMatch();

    // Destroyer is row 4, columns 0-1. Keep the turn by hitting.
    a.game.shoot(4, 0);
    await flush();

    expect(a.tracking.getShips()).toHaveLength(0);

    a.game.shoot(4, 1);
    await flush();

    const ships = a.tracking.getShips();

    expect(ships).toHaveLength(1);
    expect(ships[0].name).toBe('Destroyer');
    expect(ships[0].isSunk()).toBe(true);

    const resolved = a.events.filter((e) => e.type === 'shot-resolved').pop();

    expect(resolved).toMatchObject({ sunk: { name: 'Destroyer' } });
  });

  it('does not share board instances between the two peers', async () => {
    const { a, b } = await startedMatch();

    expect(a.tracking).not.toBe(b.own);
    expect(b.tracking).not.toBe(a.own);
  });
});

describe('game over', () => {
  it('is atomic: both peers agree on the winner and nobody can move', async () => {
    const { a, b } = await startedMatch();

    for (let row = 0; row < 5; row++) {
      for (let column = 0; column < STANDARD_FLEET[row].size; column++) {
        a.game.shoot(row, column);
        await flush();
      }
    }

    expect(a.game.getWinner()).toBe('me');
    expect(b.game.getWinner()).toBe('opponent');
    expect(a.game.canShoot()).toBe(false);
    expect(b.game.canShoot()).toBe(false);

    expect(a.events.filter((e) => e.type === 'game-over')).toHaveLength(1);
    expect(b.events.filter((e) => e.type === 'game-over')).toHaveLength(1);
  });

  it('forfeit and disconnect end the game for the other side', async () => {
    const m1 = await startedMatch();

    m1.a.game.forfeit();
    await flush();

    expect(m1.b.game.getWinner()).toBe('me');

    const m2 = await startedMatch();

    m2.a.game.dispose();
    await flush();

    expect(m2.b.game.getWinner()).toBe('me');
    expect(m2.b.events.at(-1)).toMatchObject({ reason: 'disconnect' });
  });
});

describe('transport independence', () => {
  /** Worst case: delivery is synchronous and re-entrant. */
  class SyncTransport implements GameTransport {
    peer!: SyncTransport;
    private handler: ((m: unknown) => void) | null = null;

    send(message: GameMessage): void {
      this.peer.handler?.(structuredClone(message));
    }

    onMessage(handler: (m: unknown) => void): Unsubscribe {
      this.handler = handler;
      return () => {
        this.handler = null;
      };
    }

    onClose(): Unsubscribe {
      return () => { };
    }

    close(): void { }
  }

  it('keeps the same turn semantics with synchronous delivery', () => {
    const t1 = new SyncTransport();
    const t2 = new SyncTransport();

    t1.peer = t2;
    t2.peer = t1;

    const a = createPeer(t1, true);
    const b = createPeer(t2, false);

    a.game.markReady();
    b.game.markReady();

    a.game.shoot(0, 0); // hit
    expect(a.game.canShoot()).toBe(true);
    expect(b.game.isMyTurn()).toBe(false);

    a.game.shoot(9, 9); // miss
    expect(a.game.isMyTurn()).toBe(false);
    expect(b.game.canShoot()).toBe(true);
  });
});

describe('parseGameMessage', () => {
  it('accepts valid messages', () => {
    expect(parseGameMessage({ type: 'ready', protocol: PROTOCOL_VERSION })).not.toBeNull();
    expect(parseGameMessage({ type: 'shot', seq: 1, row: 0, column: 0 })).not.toBeNull();
    expect(parseGameMessage({ type: 'forfeit' })).not.toBeNull();
  });

  it('rejects wrong protocol versions and malformed payloads', () => {
    expect(parseGameMessage({ type: 'ready', protocol: 999 })).toBeNull();
    expect(parseGameMessage({ type: 'shot', seq: 1, row: NaN, column: 0 })).toBeNull();
    expect(parseGameMessage({ type: 'shot-result', seq: 1, row: 0, column: 0, result: 'win', sunk: null, gameOver: false })).toBeNull();
    expect(parseGameMessage({
      type: 'shot-result', seq: 1, row: 0, column: 0, result: 'hit', gameOver: false,
      sunk: { name: 'Titanic', size: 2, positions: [{ row: 0, column: 0 }, { row: 0, column: 1 }] }
    })).toBeNull();
    expect(parseGameMessage(undefined)).toBeNull();
    expect(parseGameMessage([])).toBeNull();
  });
});

describe('Board.markSunk consistency', () => {
  it('refuses to reveal a ship that is not fully hit or not in a line', () => {
    const tracking = new Board();

    tracking.recordShot(0, 0, 'hit');

    expect(tracking.markSunk('Destroyer', 2, [{ row: 0, column: 0 }, { row: 0, column: 1 }])).toBe(false);

    tracking.recordShot(5, 5, 'hit');

    expect(tracking.markSunk('Destroyer', 2, [{ row: 0, column: 0 }, { row: 5, column: 5 }])).toBe(false);
    expect(tracking.getShips()).toHaveLength(0);
  });
});
