import type { Board } from './Board';

import {
  PROTOCOL_VERSION,
  parseGameMessage,
  type GameMessage,
  type RejectReason,
  type SunkShipInfo
} from './GameMessage';

import type { GameTransport, Unsubscribe } from './GameTransport';

export type MultiplayerStatus = 'placement' | 'battle' | 'finished';

export type Turn = 'me' | 'opponent';

export type GameEndReason = 'fleet-sunk' | 'forfeit' | 'disconnect';

export type MultiplayerEvent =
  | { type: 'opponent-ready' }
  | { type: 'battle-start'; turn: Turn }
  | { type: 'shot-fired'; row: number; column: number }
  | {
      type: 'shot-resolved';
      row: number;
      column: number;
      result: 'hit' | 'miss';
      sunk: SunkShipInfo | null;
      turn: Turn;
    }
  | {
      type: 'shot-rejected';
      row: number;
      column: number;
      reason: RejectReason;
    }
  | {
      type: 'incoming-shot';
      row: number;
      column: number;
      result: 'hit' | 'miss';
      sunk: SunkShipInfo | null;
      turn: Turn;
    }
  | { type: 'game-over'; winner: 'me' | 'opponent'; reason: GameEndReason }
  | { type: 'protocol-error'; detail: string };

export type MultiplayerListener = (event: MultiplayerEvent) => void;

export type MultiplayerOptions = {
  /** My own fleet: the only board that contains real ships. */
  playerBoard: Board;

  /** Fog-of-war board: filled exclusively from the defender's replies. */
  enemyBoard: Board;

  transport: GameTransport;

  /** Decided out-of-band (lobby/host). Exactly one side must pass true. */
  startsFirst: boolean;

  /** Ships required before `markReady()` is accepted. */
  fleetSize: number;
};

type PendingShot = {
  seq: number;
  row: number;
  column: number;
};

/**
 * Transport-agnostic game protocol.
 *
 * Invariants:
 *  1. Turn state changes happen on each side as the SAME pure rule applied
 *     to the SAME message: hit -> shooter keeps the turn, miss -> it passes.
 *  2. State is committed BEFORE a message is sent (defender) or BEFORE the
 *     shot is sent (shooter: `pendingShot`), so behaviour is identical
 *     whether the transport delivers synchronously or not.
 *  3. Every invalid shot gets an explicit `shot-rejected`; the shooter is
 *     never left waiting forever.
 *  4. The UI never polls: it reacts to events.
 */
export class MultiplayerGame {
  private readonly playerBoard: Board;

  private readonly enemyBoard: Board;

  private readonly transport: GameTransport;

  private readonly fleetSize: number;

  private readonly listeners = new Set<MultiplayerListener>();

  private readonly unsubscribers: Unsubscribe[];

  private status: MultiplayerStatus = 'placement';

  private turn: Turn;

  private localReady = false;

  private remoteReady = false;

  private pendingShot: PendingShot | null = null;

  private nextSeq = 1;

  private winner: 'me' | 'opponent' | null = null;

  constructor(options: MultiplayerOptions) {
    this.playerBoard = options.playerBoard;
    this.enemyBoard = options.enemyBoard;
    this.transport = options.transport;
    this.fleetSize = options.fleetSize;
    this.turn = options.startsFirst ? 'me' : 'opponent';

    this.unsubscribers = [
      this.transport.onMessage((raw) => this.handleRaw(raw)),
      this.transport.onClose(() => this.handleDisconnect())
    ];
  }

  /* ------------------------------ queries ------------------------------ */

  subscribe(listener: MultiplayerListener): Unsubscribe {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  getStatus(): MultiplayerStatus {
    return this.status;
  }

  getWinner(): 'me' | 'opponent' | null {
    return this.winner;
  }

  isMyTurn(): boolean {
    return this.status === 'battle' && this.turn === 'me';
  }

  isAwaitingResult(): boolean {
    return this.pendingShot !== null;
  }

  /** True when the local player may fire right now. */
  canShoot(): boolean {
    return this.isMyTurn() && this.pendingShot === null;
  }

  isGameOver(): boolean {
    return this.status === 'finished';
  }

  /* ------------------------------ commands ------------------------------ */

  /** Locks the fleet and tells the opponent. Battle starts when both are ready. */
  markReady(): boolean {
    if (
      this.status !== 'placement' ||
      this.localReady ||
      this.playerBoard.getShips().length !== this.fleetSize
    ) {
      return false;
    }

    this.localReady = true;

    this.transport.send({ type: 'ready', protocol: PROTOCOL_VERSION });

    this.maybeStartBattle();

    return true;
  }

  shoot(row: number, column: number): boolean {
    if (
      !this.canShoot() ||
      !this.enemyBoard.isInsideBoard(row, column) ||
      this.enemyBoard.getCell(row, column) !== 'empty'
    ) {
      return false;
    }

    const shot: PendingShot = { seq: this.nextSeq++, row, column };

    this.pendingShot = shot;

    this.emit({ type: 'shot-fired', row, column });

    this.transport.send({
      type: 'shot',
      seq: shot.seq,
      row,
      column
    });

    return true;
  }

  forfeit(): void {
    if (this.status === 'finished') {
      return;
    }

    this.transport.send({ type: 'forfeit' });

    this.conclude('opponent', 'forfeit');
  }

  /** Detaches from the transport. After this the instance is inert. */
  dispose(): void {
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }

    this.listeners.clear();
    this.transport.close();
  }

  /* ------------------------------ inbound ------------------------------ */

  private handleRaw(raw: unknown): void {
    if (this.status === 'finished') {
      return;
    }

    const message = parseGameMessage(raw);

    if (!message) {
      this.emit({ type: 'protocol-error', detail: 'Malformed message' });
      return;
    }

    this.handleMessage(message);
  }

  private handleMessage(message: GameMessage): void {
    switch (message.type) {
      case 'ready':
        this.handleReady();
        break;

      case 'shot':
        this.handleIncomingShot(message);
        break;

      case 'shot-result':
        this.handleShotResult(message);
        break;

      case 'shot-rejected':
        this.handleShotRejected(message);
        break;

      case 'forfeit':
        this.conclude('me', 'forfeit');
        break;
    }
  }

  private handleReady(): void {
    if (this.remoteReady) {
      return;
    }

    this.remoteReady = true;

    this.emit({ type: 'opponent-ready' });

    this.maybeStartBattle();
  }

  private handleIncomingShot(
    message: Extract<GameMessage, { type: 'shot' }>
  ): void {
    const reject = (reason: RejectReason): void => {
      this.transport.send({
        type: 'shot-rejected',
        seq: message.seq,
        reason
      });
    };

    const { seq, row, column } = message;

    if (this.status !== 'battle') {
      reject('not-in-battle');
      return;
    }

    if (this.turn !== 'opponent') {
      reject('not-your-turn');
      return;
    }

    if (!this.playerBoard.isInsideBoard(row, column)) {
      reject('out-of-bounds');
      return;
    }

    const result = this.playerBoard.shoot(row, column);

    if (result === 'already-shot') {
      reject('already-shot');
      return;
    }

    const ship =
      result === 'hit' ? this.playerBoard.getShipAt(row, column) : undefined;

    const sunk: SunkShipInfo | null = ship?.isSunk()
      ? {
          name: ship.name,
          size: ship.size,
          positions: ship.positions.map((position) => ({ ...position }))
        }
      : null;

    const gameOver = this.playerBoard.allShipsSunk();

    // Commit local state first, then tell the opponent (invariant 2).
    if (gameOver) {
      this.status = 'finished';
      this.winner = 'opponent';
    } else {
      this.turn = result === 'hit' ? 'opponent' : 'me';
    }

    this.transport.send({
      type: 'shot-result',
      seq,
      row,
      column,
      result,
      sunk,
      gameOver
    });

    this.emit({
      type: 'incoming-shot',
      row,
      column,
      result,
      sunk,
      turn: this.turn
    });

    if (gameOver) {
      this.emit({
        type: 'game-over',
        winner: 'opponent',
        reason: 'fleet-sunk'
      });
    }
  }

  private handleShotResult(
    message: Extract<GameMessage, { type: 'shot-result' }>
  ): void {
    const pending = this.pendingShot;

    if (
      !pending ||
      pending.seq !== message.seq ||
      pending.row !== message.row ||
      pending.column !== message.column
    ) {
      this.emit({
        type: 'protocol-error',
        detail: 'Unexpected shot result'
      });
      return;
    }

    this.pendingShot = null;

    this.enemyBoard.recordShot(message.row, message.column, message.result);

    let sunk: SunkShipInfo | null = null;

    if (message.sunk) {
      const accepted = this.enemyBoard.markSunk(
        message.sunk.name,
        message.sunk.size,
        message.sunk.positions
      );

      if (accepted) {
        sunk = message.sunk;
      } else {
        this.emit({
          type: 'protocol-error',
          detail: 'Inconsistent sunk ship report'
        });
      }
    }

    if (message.gameOver) {
      this.status = 'finished';
      this.winner = 'me';
    } else {
      this.turn = message.result === 'hit' ? 'me' : 'opponent';
    }

    this.emit({
      type: 'shot-resolved',
      row: message.row,
      column: message.column,
      result: message.result,
      sunk,
      turn: this.turn
    });

    if (message.gameOver) {
      this.emit({ type: 'game-over', winner: 'me', reason: 'fleet-sunk' });
    }
  }

  private handleShotRejected(
    message: Extract<GameMessage, { type: 'shot-rejected' }>
  ): void {
    const pending = this.pendingShot;

    if (!pending || pending.seq !== message.seq) {
      this.emit({
        type: 'protocol-error',
        detail: 'Unexpected shot rejection'
      });
      return;
    }

    this.pendingShot = null;

    this.emit({
      type: 'shot-rejected',
      row: pending.row,
      column: pending.column,
      reason: message.reason
    });
  }

  private handleDisconnect(): void {
    if (this.status === 'finished') {
      return;
    }

    this.conclude('me', 'disconnect');
  }

  /* ------------------------------ internals ------------------------------ */

  private maybeStartBattle(): void {
    if (
      this.status !== 'placement' ||
      !this.localReady ||
      !this.remoteReady
    ) {
      return;
    }

    this.status = 'battle';

    this.emit({ type: 'battle-start', turn: this.turn });
  }

  private conclude(winner: 'me' | 'opponent', reason: GameEndReason): void {
    this.status = 'finished';
    this.winner = winner;
    this.pendingShot = null;

    this.emit({ type: 'game-over', winner, reason });
  }

  private emit(event: MultiplayerEvent): void {
    for (const listener of [...this.listeners]) {
      listener(event);
    }
  }
}
