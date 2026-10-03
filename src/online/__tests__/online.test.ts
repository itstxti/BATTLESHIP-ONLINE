import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Board } from '../../game/Board';
import { STANDARD_FLEET } from '../../game/fleet';
import {
  MultiplayerGame,
  type MultiplayerEvent
} from '../../game/MultiplayerGame';
import { hostRoom, joinRoom, type LobbyError, type Match } from '../lobbyClient';

import {
  createRelayServer,
  type RelayServer
} from '../../../server/index.mjs';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(condition: () => boolean, timeout = 3000): Promise<void> {
  const start = Date.now();

  while (!condition()) {
    if (Date.now() - start > timeout) {
      throw new Error('Timed out waiting for condition');
    }

    await wait(5);
  }
}

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
  tracking: Board;
  events: MultiplayerEvent[];
};

function createPeer(match: Match): Peer {
  const tracking = new Board();

  const game = new MultiplayerGame({
    playerBoard: fixedBoard(),
    enemyBoard: tracking,
    transport: match.transport,
    startsFirst: match.startsFirst,
    fleetSize: STANDARD_FLEET.length
  });

  const events: MultiplayerEvent[] = [];

  game.subscribe((event) => events.push(event));

  return { game, tracking, events };
}

/** Fires at the first untouched cell whenever it is this peer's turn. */
function autoPlay(peer: Peer): void {
  const fire = () => {
    if (!peer.game.canShoot()) {
      return;
    }

    for (let row = 0; row < peer.tracking.size; row++) {
      for (let column = 0; column < peer.tracking.size; column++) {
        if (peer.game.shoot(row, column)) {
          return;
        }
      }
    }
  };

  peer.game.subscribe(() => queueMicrotask(fire));
}

describe('online multiplayer through the relay', () => {
  let relay: RelayServer;
  let url: string;

  beforeEach(async () => {
    // Bots play far faster than humans: lift the per-connection rate limit.
    relay = createRelayServer({ rateMaxMessages: 100_000 });

    const address = await relay.listen(0, '127.0.0.1');

    url = `ws://127.0.0.1:${address.port}/ws`;
  });

  afterEach(async () => {
    await relay.close();
  });

  function pair(): Promise<[Match, Match]> {
    return new Promise((resolve, reject) => {
      let hostMatch: Match | null = null;
      let guestMatch: Match | null = null;

      const check = () => {
        if (hostMatch && guestMatch) {
          resolve([hostMatch, guestMatch]);
        }
      };

      hostRoom(url, {
        onCreated: (code) => {
          joinRoom(url, code, {
            onMatched: (match) => {
              guestMatch = match;
              check();
            },
            onError: reject
          });
        },
        onMatched: (match) => {
          hostMatch = match;
          check();
        },
        onError: reject
      });
    });
  }

  it('reports an unknown room code', async () => {
    const error = await new Promise<LobbyError>((resolve) => {
      joinRoom(url, 'ZZZZZ', {
        onMatched: () => resolve('bad-request'),
        onError: resolve
      });
    });

    expect(error).toBe('room-not-found');
  });

  it('rejects a third player', async () => {
    let code = '';

    await new Promise<void>((resolve, reject) => {
      hostRoom(url, {
        onCreated: (value) => {
          code = value;

          joinRoom(url, code, {
            onMatched: () => resolve(),
            onError: reject
          });
        },
        onMatched: () => {},
        onError: reject
      });
    });

    const error = await new Promise<LobbyError>((resolve) => {
      joinRoom(url, code, {
        onMatched: () => resolve('bad-request'),
        onError: resolve
      });
    });

    // The room is already gone once it is full and being played, or full.
    expect(['room-full', 'room-not-found']).toContain(error);
  });

  it('pairs two players and exactly one starts', async () => {
    const [host, guest] = await pair();

    expect(host.startsFirst).not.toBe(guest.startsFirst);

    host.transport.close();
    guest.transport.close();
  });

  it('plays a complete game and agrees on the winner', async () => {
    const [hostMatch, guestMatch] = await pair();

    const host = createPeer(hostMatch);
    const guest = createPeer(guestMatch);

    autoPlay(host);
    autoPlay(guest);

    host.game.markReady();
    guest.game.markReady();

    await until(() => host.game.isGameOver() && guest.game.isGameOver());

    expect(host.game.getWinner()).not.toBe(guest.game.getWinner());
    expect(['me', 'opponent']).toContain(host.game.getWinner());

    host.game.dispose();
    guest.game.dispose();
  });

  it('awards the win when the opponent disconnects', async () => {
    const [hostMatch, guestMatch] = await pair();

    const host = createPeer(hostMatch);
    const guest = createPeer(guestMatch);

    host.game.markReady();
    guest.game.markReady();

    await until(
      () =>
        host.game.getStatus() === 'battle' &&
        guest.game.getStatus() === 'battle'
    );

    guest.game.dispose();

    await until(() => host.game.isGameOver());

    expect(host.game.getWinner()).toBe('me');

    expect(
      host.events.some(
        (event) =>
          event.type === 'game-over' && event.reason === 'disconnect'
      )
    ).toBe(true);

    host.game.dispose();
  });
});
