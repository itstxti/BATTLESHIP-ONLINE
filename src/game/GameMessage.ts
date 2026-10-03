import type { Position, ShipName } from './Ship';

/**
 * Wire protocol between two players.
 *
 * Design rules:
 *  - The defender is the only authority on the outcome of a shot.
 *  - Every shot carries a `seq` so results/rejections can be matched
 *    to the shot that caused them (no guessing under reordering).
 *  - A result is ONE atomic message (hit/miss + sunk ship + game over),
 *    so there is no window where peers disagree about turn or winner.
 *  - Anything coming from a transport is untrusted: it must pass
 *    `parseGameMessage` before touching game state.
 */
export const PROTOCOL_VERSION = 1;

export type SunkShipInfo = {
  name: ShipName;
  size: number;
  positions: Position[];
};

export type RejectReason =
  | 'not-in-battle'
  | 'not-your-turn'
  | 'out-of-bounds'
  | 'already-shot';

export type GameMessage =
  | { type: 'ready'; protocol: number }
  | { type: 'shot'; seq: number; row: number; column: number }
  | {
      type: 'shot-result';
      seq: number;
      row: number;
      column: number;
      result: 'hit' | 'miss';
      sunk: SunkShipInfo | null;
      gameOver: boolean;
    }
  | { type: 'shot-rejected'; seq: number; reason: RejectReason }
  | { type: 'forfeit' };

const SHIP_NAMES: readonly ShipName[] = [
  'Carrier',
  'Battleship',
  'Cruiser',
  'Submarine',
  'Destroyer'
];

const REJECT_REASONS: readonly RejectReason[] = [
  'not-in-battle',
  'not-your-turn',
  'out-of-bounds',
  'already-shot'
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

function parsePositions(value: unknown): Position[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 10) {
    return null;
  }

  const positions: Position[] = [];

  for (const item of value) {
    if (!isRecord(item) || !isInt(item.row) || !isInt(item.column)) {
      return null;
    }

    positions.push({ row: item.row, column: item.column });
  }

  return positions;
}

function parseSunk(value: unknown): SunkShipInfo | null | undefined {
  if (value === null) {
    return null;
  }

  if (
    !isRecord(value) ||
    !SHIP_NAMES.includes(value.name as ShipName) ||
    !isInt(value.size)
  ) {
    return undefined;
  }

  const positions = parsePositions(value.positions);

  if (!positions || positions.length !== value.size) {
    return undefined;
  }

  return { name: value.name as ShipName, size: value.size, positions };
}

/**
 * Validates untrusted input and returns a well-typed message,
 * or null if it is malformed. Never throws.
 */
export function parseGameMessage(raw: unknown): GameMessage | null {
  if (!isRecord(raw)) {
    return null;
  }

  switch (raw.type) {
    case 'ready':
      return raw.protocol === PROTOCOL_VERSION
        ? { type: 'ready', protocol: PROTOCOL_VERSION }
        : null;

    case 'shot':
      return isInt(raw.seq) && isInt(raw.row) && isInt(raw.column)
        ? { type: 'shot', seq: raw.seq, row: raw.row, column: raw.column }
        : null;

    case 'shot-result': {
      const sunk = parseSunk(raw.sunk);

      if (
        !isInt(raw.seq) ||
        !isInt(raw.row) ||
        !isInt(raw.column) ||
        (raw.result !== 'hit' && raw.result !== 'miss') ||
        typeof raw.gameOver !== 'boolean' ||
        sunk === undefined
      ) {
        return null;
      }

      return {
        type: 'shot-result',
        seq: raw.seq,
        row: raw.row,
        column: raw.column,
        result: raw.result,
        sunk,
        gameOver: raw.gameOver
      };
    }

    case 'shot-rejected':
      return isInt(raw.seq) &&
        REJECT_REASONS.includes(raw.reason as RejectReason)
        ? {
            type: 'shot-rejected',
            seq: raw.seq,
            reason: raw.reason as RejectReason
          }
        : null;

    case 'forfeit':
      return { type: 'forfeit' };

    default:
      return null;
  }
}
