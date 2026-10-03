import type { GameMessage } from './GameMessage';
import type { GameTransport, Unsubscribe } from './GameTransport';

/**
 * GameTransport over a WebSocket that is already paired by the relay
 * server (see server/index.mjs). Game messages travel wrapped as
 * `{ t: 'relay', data }`; `{ t: 'peer-left' }` means the opponent is gone.
 *
 * Honours the GameTransport contract:
 *  - delivery is asynchronous (socket events),
 *  - incoming data is handed over as `unknown` (the game validates it),
 *  - `onClose` fires once when the other side goes away; calling
 *    `close()` locally does not fire it.
 *
 * Messages that arrive before anyone subscribed are queued, so nothing
 * is lost between "matched" and the game wiring its handlers.
 */
export class WebSocketGameTransport implements GameTransport {
  private readonly messageHandlers = new Set<(message: unknown) => void>();

  private readonly closeHandlers = new Set<() => void>();

  private readonly queue: unknown[] = [];

  private closed = false;

  private peerGone = false;

  private readonly socket: WebSocket;

  constructor(socket: WebSocket) {
    this.socket = socket;

    socket.addEventListener('message', this.handleSocketMessage);
    socket.addEventListener('close', this.handleSocketClose);
    socket.addEventListener('error', this.handleSocketClose);
  }

  send(message: GameMessage): void {
    if (this.closed || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    this.socket.send(JSON.stringify({ t: 'relay', data: message }));
  }

  onMessage(handler: (message: unknown) => void): Unsubscribe {
    this.messageHandlers.add(handler);

    if (this.queue.length > 0) {
      const pending = this.queue.splice(0);

      queueMicrotask(() => {
        for (const message of pending) {
          this.dispatch(message);
        }
      });
    }

    return () => {
      this.messageHandlers.delete(handler);
    };
  }

  onClose(handler: () => void): Unsubscribe {
    this.closeHandlers.add(handler);

    return () => {
      this.closeHandlers.delete(handler);
    };
  }

  close(): void {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.detach();

    if (
      this.socket.readyState === WebSocket.OPEN ||
      this.socket.readyState === WebSocket.CONNECTING
    ) {
      this.socket.close(1000);
    }
  }

  private readonly handleSocketMessage = (event: MessageEvent): void => {
    if (this.closed || typeof event.data !== 'string') {
      return;
    }

    let envelope: unknown;

    try {
      envelope = JSON.parse(event.data);
    } catch {
      return;
    }

    if (typeof envelope !== 'object' || envelope === null) {
      return;
    }

    const { t, data } = envelope as { t?: unknown; data?: unknown };

    if (t === 'relay') {
      this.dispatch(data);
    } else if (t === 'peer-left') {
      this.notifyPeerGone();
    }
  };

  private readonly handleSocketClose = (): void => {
    this.notifyPeerGone();
  };

  private dispatch(message: unknown): void {
    if (this.messageHandlers.size === 0) {
      this.queue.push(message);
      return;
    }

    for (const handler of [...this.messageHandlers]) {
      handler(message);
    }
  }

  private notifyPeerGone(): void {
    if (this.closed || this.peerGone) {
      return;
    }

    this.peerGone = true;
    this.closed = true;
    this.detach();

    if (this.socket.readyState === WebSocket.OPEN) {
      this.socket.close(1000);
    }

    for (const handler of [...this.closeHandlers]) {
      handler();
    }
  }

  private detach(): void {
    this.socket.removeEventListener('message', this.handleSocketMessage);
    this.socket.removeEventListener('close', this.handleSocketClose);
    this.socket.removeEventListener('error', this.handleSocketClose);
  }
}
