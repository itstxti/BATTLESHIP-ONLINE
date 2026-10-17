import type { Board } from '../game/Board';

import type { Ship } from '../game/Ship';

import type {
  FleetDefinition,
  GamePhase
} from '../game/types';

export type Orientation =
  | 'horizontal'
  | 'vertical';

export type ShotPosition = {
  row: number;
  column: number;
};

type BoardRendererOptions = {
  isEnemyBoard?: boolean;
  gamePhase: GamePhase;
  selectedShip: FleetDefinition | null;
  orientation: Orientation;
  playerBoard: Board;

  onPlacedShipSelect?: (
    row: number,
    column: number
  ) => void;

  onPlacement?: (
    row: number,
    column: number
  ) => void;

  onRotate?: () => void;

  onEnemyShot?: (
    row: number,
    column: number
  ) => void;

  animatedShot?: ShotPosition;

  /**
   * Renders a non-interactive snapshot (e.g. on the results screen):
   * cells are plain labelled elements instead of buttons, with no handlers.
   */
  readOnly?: boolean;
};

/* =========================================================
   SHIP POSITIONS
   ========================================================= */

function getShipPositions(
  row: number,
  column: number,
  size: number,
  orientation: Orientation
): ShotPosition[] {
  const positions: ShotPosition[] = [];

  for (
    let i = 0;
    i < size;
    i++
  ) {
    positions.push({
      row:
        orientation === 'horizontal'
          ? row
          : row + i,

      column:
        orientation === 'horizontal'
          ? column + i
          : column
    });
  }

  return positions;
}

/* =========================================================
   CLEAR PLACEMENT PREVIEW
   ========================================================= */

export function clearPlacementPreview(
  element: HTMLDivElement
): void {
  const cells =
    element.querySelectorAll<HTMLButtonElement>(
      '.cell'
    );

  for (const cell of cells) {
    cell.classList.remove(
      'placement-preview',
      'placement-invalid'
    );
  }
}

/* =========================================================
   PLACEMENT PREVIEW
   ========================================================= */

export function renderPlacementPreview(
  element: HTMLDivElement,
  row: number,
  column: number,
  selectedShip: FleetDefinition | null,
  orientation: Orientation,
  playerBoard: Board
): void {
  if (!selectedShip) {
    return;
  }

  clearPlacementPreview(element);

  const positions =
    getShipPositions(
      row,
      column,
      selectedShip.size,
      orientation
    );

  const valid =
    playerBoard.canPlaceShip(
      selectedShip.size,
      positions
    );

  const cells =
    element.querySelectorAll<HTMLButtonElement>(
      '.cell'
    );

  for (
    const position of positions
  ) {
    if (
      position.row < 0 ||
      position.row >=
        playerBoard.size ||
      position.column < 0 ||
      position.column >=
        playerBoard.size
    ) {
      continue;
    }

    /*
     * There is one coordinate label
     * before the cells of every row,
     * plus the top column labels.
     *
     * The .cell selector contains
     * only actual board cells, so the
     * index is straightforward.
     */
    const index =
      position.row *
        playerBoard.size +
      position.column;

    const cell =
      cells[index];

    if (!cell) {
      continue;
    }

    cell.classList.add(
      valid
        ? 'placement-preview'
        : 'placement-invalid'
    );
  }
}

/* =========================================================
   CELL DESCRIPTION (read-only boards)
   ========================================================= */

function describeCell(
  board: Board,
  row: number,
  column: number,
  isEnemyBoard: boolean
): string {
  const state =
    board.getCell(
      row,
      column
    );

  if (state === 'hit') {
    return board.getShipAt(
      row,
      column
    )?.isSunk()
      ? 'hit, ship sunk'
      : 'hit';
  }

  if (state === 'miss') {
    return 'miss';
  }

  if (isEnemyBoard) {
    return 'not fired at';
  }

  return state === 'ship'
    ? 'ship'
    : 'water';
}

/* =========================================================
   HULL CLASSES
   ========================================================= */

/*
 * Tags a cell with the part of the ship it shows (bow / middle / stern),
 * its direction and its class, so the stylesheet can draw one continuous
 * hull instead of separate squares.
 */
function addHullClasses(
  cell: HTMLElement,
  ship: Ship,
  row: number,
  column: number
): void {
  const vertical =
    ship.positions.length > 1 &&
    ship.positions[0].column ===
      ship.positions[1].column;

  const coordinates =
    ship.positions.map(
      (position) =>
        vertical
          ? position.row
          : position.column
    );

  const first = Math.min(...coordinates);
  const last = Math.max(...coordinates);
  const here = vertical ? row : column;

  cell.classList.add(
    'hull',
    vertical ? 'hull-v' : 'hull-h',
    `hull-${ship.name.toLowerCase()}`
  );

  if (here === first) {
    cell.classList.add('hull-bow');
  } else if (here === last) {
    cell.classList.add('hull-stern');
  } else {
    cell.classList.add('hull-mid');
  }

  if (
    ship.size >= 3 &&
    here === first + Math.floor(ship.size / 2)
  ) {
    cell.classList.add('hull-bridge');
  }
}

/* =========================================================
   BOARD
   ========================================================= */

/*
 * Hull cells each board showed at its last render, so the next render can
 * tell which ones are new (a ship just placed or moved) and animate only those.
 */
const shownHulls = new WeakMap<HTMLElement, Set<string>>();

export function renderBoard(
  element: HTMLDivElement,
  board: Board,
  options: BoardRendererOptions
): void {
  const {
    isEnemyBoard = false,
    gamePhase,
    selectedShip,
    orientation,
    playerBoard,
    onPlacedShipSelect,
    onPlacement,
    onRotate,
    onEnemyShot,
    animatedShot,
    readOnly = false
  } = options;

  element.innerHTML = '';

  const previousHulls =
    shownHulls.get(element);

  const hulls =
    new Set<string>();

  // Hull cells new in this render, grouped by ship, with their position along it.
  const arrivals =
    new Map<object, { cell: HTMLElement; axis: number }[]>();

  const animateHulls =
    gamePhase === 'placement' &&
    !readOnly &&
    !isEnemyBoard;

  /*
   * Top-left empty corner.
   */
  const corner =
    document.createElement('div');

  corner.classList.add(
    'board-corner'
  );

  element.appendChild(
    corner
  );

  /*
   * Column labels A-J.
   */
  for (
    let column = 0;
    column < board.size;
    column++
  ) {
    const label =
      document.createElement('div');

    label.classList.add(
      'board-label'
    );

    label.textContent =
      String.fromCharCode(
        65 + column
      );

    element.appendChild(
      label
    );
  }

  /*
   * Rows.
   */
  for (
    let row = 0;
    row < board.size;
    row++
  ) {
    /*
     * Row label 1-10.
     */
    const label =
      document.createElement('div');

    label.classList.add(
      'board-label'
    );

    label.textContent =
      String(row + 1);

    element.appendChild(
      label
    );

    /*
     * Cells.
     */
    for (
      let column = 0;
      column < board.size;
      column++
    ) {
      const cell =
        document.createElement(
          readOnly ? 'div' : 'button'
        );

      if (
        cell instanceof HTMLButtonElement
      ) {
        cell.type = 'button';
      }

      cell.classList.add(
        'cell'
      );

      const state =
        board.getCell(
          row,
          column
        );

      if (readOnly) {
        cell.setAttribute(
          'role',
          'img'
        );

        cell.setAttribute(
          'aria-label',
          `${String.fromCharCode(65 + column)}${row + 1}: ${describeCell(
            board,
            row,
            column,
            isEnemyBoard
          )}`
        );
      }

      /*
       * Player ships.
       */
      if (
        state === 'ship' &&
        !isEnemyBoard
      ) {
        cell.classList.add(
          'ship'
        );
      }

      /*
       * Draw the hull on ships we may see: your own, and enemy
       * ships once they are sunk.
       */
      if (
        (state === 'ship' && !isEnemyBoard) ||
        state === 'hit'
      ) {
        const hullShip =
          board.getShipAt(
            row,
            column
          );

        if (
          hullShip &&
          (!isEnemyBoard ||
            hullShip.isSunk())
        ) {
          addHullClasses(
            cell,
            hullShip,
            row,
            column
          );

          const key =
            `${row},${column}`;

          hulls.add(key);

          if (
            animateHulls &&
            previousHulls &&
            !previousHulls.has(key)
          ) {
            const list =
              arrivals.get(hullShip) ?? [];

            list.push({
              cell,
              axis:
                cell.classList.contains('hull-v')
                  ? row
                  : column
            });

            arrivals.set(hullShip, list);
          }
        }
      }

      /*
       * Movable ships during
       * placement.
       */
      if (
        !isEnemyBoard &&
        gamePhase === 'placement' &&
        state === 'ship'
      ) {
        cell.classList.add(
          'movable'
        );
      }

      /*
       * Hit.
       */
      if (
        state === 'hit'
      ) {
        cell.classList.add(
          'hit'
        );

        cell.textContent = '×';

        const ship =
          board.getShipAt(
            row,
            column
          );

        if (
          ship?.isSunk()
        ) {
          cell.classList.add(
            'sunk'
          );
        }
      }

      /*
       * Miss.
       */
      if (
        state === 'miss'
      ) {
        cell.classList.add(
          'miss'
        );

        cell.textContent = '•';
      }

      /*
       * Placement interaction.
       */
      if (
        !readOnly &&
        !isEnemyBoard &&
        gamePhase === 'placement'
      ) {
        cell.addEventListener(
          'mouseenter',
          () => {
            renderPlacementPreview(
              element,
              row,
              column,
              selectedShip,
              orientation,
              playerBoard
            );
          }
        );

        cell.addEventListener(
          'mouseleave',
          () => {
            clearPlacementPreview(
              element
            );
          }
        );

        /*
         * Right click rotates
         * the selected ship.
         */
        cell.addEventListener(
          'contextmenu',
          (event) => {
            event.preventDefault();

            if (
              !selectedShip ||
              !onRotate
            ) {
              return;
            }

            onRotate();
          }
        );

        /*
         * Left click places a new
         * ship or selects an existing one.
         */
        cell.addEventListener(
          'click',
          () => {
            if (
              state === 'ship' &&
              !selectedShip
            ) {
              onPlacedShipSelect?.(
                row,
                column
              );

              return;
            }

            onPlacement?.(
              row,
              column
            );
          }
        );
      }

      /*
       * Enemy board interaction.
       */
      if (
        !readOnly &&
        isEnemyBoard &&
        gamePhase === 'battle' &&
        state !== 'hit' &&
        state !== 'miss'
      ) {
        if (
          onEnemyShot
        ) {
          cell.classList.add(
            'available'
          );

          cell.addEventListener(
            'click',
            () => {
              onEnemyShot(
                row,
                column
              );
            }
          );
        } else {
          cell.classList.add(
            'disabled'
          );
        }
      }

      /*
       * Shot animation.
       */
      if (
        animatedShot &&
        animatedShot.row === row &&
        animatedShot.column === column
      ) {
        requestAnimationFrame(
          () => {
            cell.classList.add(
              'shot-animation'
            );

            if (
              state === 'hit'
            ) {
              cell.classList.add(
                'hit-animation'
              );
            }

            if (
              state === 'miss'
            ) {
              cell.classList.add(
                'miss-animation'
              );
            }

            if (
              state === 'hit'
            ) {
              const ship =
                board.getShipAt(
                  row,
                  column
                );

              if (
                ship?.isSunk()
              ) {
                cell.classList.add(
                  'sunk-animation'
                );
              }
            }
          }
        );
      }

      element.appendChild(
        cell
      );
    }
  }

  // New hull cells grow in from the bow, one after another.
  for (const list of arrivals.values()) {
    list
      .sort((a, b) => a.axis - b.axis)
      .forEach(({ cell }, index) => {
        cell.style.setProperty('--n', String(index));

        cell.classList.add('hull-enter');
      });
  }

  shownHulls.set(element, hulls);
}

