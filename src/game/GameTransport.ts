import type { GameMessage } from './GameMessage';

export type Unsubscribe = () => void;

/**
 * Message pipe between two players (same-device, WebSocket, WebRTC...).
 *
 * Contract:
 *  - Delivery is reliable and ordered, but ALWAYS asynchronous.
 *  - `onMessage` hands over `unknown`: the wire is an untrust boundary,
 *    the receiver validates with `parseGameMessage`.
 *  - `onClose` fires once when the other side goes away (or `close()`
 *    is called on the remote end).
 */
export interface GameTransport {
  send(message: GameMessage): void;

  onMessage(handler: (message: unknown) => void): Unsubscribe;

  onClose(handler: () => void): Unsubscribe;

  close(): void;
}
