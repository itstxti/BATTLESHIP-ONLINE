import type { GameMessage } from './GameMessage';
import type { GameTransport, Unsubscribe } from './GameTransport';

/**
 * In-memory transport that behaves like a real network:
 *  - messages are cloned (peers never share object references),
 *  - delivery is asynchronous (microtask), so code that only works
 *    with synchronous re-entrant delivery fails here, not in production.
 */
export class LocalGameTransport implements GameTransport {
  private readonly messageHandlers = new Set<(message: unknown) => void>();

  private readonly closeHandlers = new Set<() => void>();

  private peer: LocalGameTransport | null = null;

  private closed = false;

  static createPair(): [LocalGameTransport, LocalGameTransport] {
    const first = new LocalGameTransport();
    const second = new LocalGameTransport();

    first.connect(second);
    second.connect(first);

    return [first, second];
  }

  connect(other: LocalGameTransport): void {
    this.peer = other;
  }

  send(message: GameMessage): void {
    const peer = this.peer;

    if (this.closed || !peer) {
      return;
    }

    const wire = structuredClone(message);

    queueMicrotask(() => peer.deliver(wire));
  }

  onMessage(handler: (message: unknown) => void): Unsubscribe {
    this.messageHandlers.add(handler);

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

    const peer = this.peer;

    queueMicrotask(() => peer?.handlePeerClosed());
  }

  private deliver(message: unknown): void {
    if (this.closed) {
      return;
    }

    for (const handler of [...this.messageHandlers]) {
      handler(message);
    }
  }

  private handlePeerClosed(): void {
    if (this.closed) {
      return;
    }

    this.closed = true;

    for (const handler of [...this.closeHandlers]) {
      handler();
    }
  }
}
