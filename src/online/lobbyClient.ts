import type { GameTransport } from '../game/GameTransport';
import { WebSocketGameTransport } from '../game/WebSocketGameTransport';

export type LobbyError =
  | 'room-not-found'
  | 'room-full'
  | 'room-expired'
  | 'server-full'
  | 'bad-request'
  | 'connection-failed'
  | 'connection-lost';

export type Match = {
  transport: GameTransport;
  startsFirst: boolean;
};

export type LobbyHandlers = {
  /** Host only: the room exists, share this code with the friend. */
  onCreated?: (code: string) => void;

  /** Both players: paired. The transport is ready to be handed to the game. */
  onMatched: (match: Match) => void;

  onError: (reason: LobbyError) => void;
};

export type LobbySession = {
  /** Leaves the lobby. No effect once matched (the game owns the socket). */
  cancel(): void;
};

const KNOWN_ERRORS: readonly LobbyError[] = [
  'room-not-found',
  'room-full',
  'room-expired',
  'server-full',
  'bad-request'
];

function open(
  url: string,
  request: Record<string, unknown>,
  handlers: LobbyHandlers
): LobbySession {
  let finished = false;
  let socket: WebSocket;

  try {
    socket = new WebSocket(url);
  } catch {
    queueMicrotask(() => handlers.onError('connection-failed'));
    return { cancel() {} };
  }

  let opened = false;

  const stop = (): void => {
    finished = true;
    socket.removeEventListener('open', handleOpen);
    socket.removeEventListener('message', handleMessage);
    socket.removeEventListener('close', handleClose);
    socket.removeEventListener('error', handleClose);
  };

  const fail = (reason: LobbyError): void => {
    if (finished) {
      return;
    }

    stop();
    socket.close();
    handlers.onError(reason);
  };

  function handleOpen(): void {
    opened = true;
    socket.send(JSON.stringify(request));
  }

  function handleMessage(event: MessageEvent): void {
    if (finished || typeof event.data !== 'string') {
      return;
    }

    let message: { t?: unknown; code?: unknown; startsFirst?: unknown; reason?: unknown };

    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }

    switch (message.t) {
      case 'created':
        if (typeof message.code === 'string') {
          handlers.onCreated?.(message.code);
        }
        return;

      case 'matched': {
        if (typeof message.startsFirst !== 'boolean') {
          fail('bad-request');
          return;
        }

        /*
         * Hand the socket over synchronously: the transport attaches its
         * own listeners in the same tick, so no message can slip through.
         */
        stop();

        handlers.onMatched({
          transport: new WebSocketGameTransport(socket),
          startsFirst: message.startsFirst
        });
        return;
      }

      case 'error': {
        const reason = KNOWN_ERRORS.find((item) => item === message.reason);

        fail(reason ?? 'bad-request');
        return;
      }
    }
  }

  function handleClose(): void {
    fail(opened ? 'connection-lost' : 'connection-failed');
  }

  socket.addEventListener('open', handleOpen);
  socket.addEventListener('message', handleMessage);
  socket.addEventListener('close', handleClose);
  socket.addEventListener('error', handleClose);

  return {
    cancel() {
      if (finished) {
        return;
      }

      stop();
      socket.close();
    }
  };
}

export function hostRoom(url: string, handlers: LobbyHandlers): LobbySession {
  return open(url, { t: 'create' }, handlers);
}

export function joinRoom(
  url: string,
  code: string,
  handlers: LobbyHandlers
): LobbySession {
  return open(url, { t: 'join', code }, handlers);
}
