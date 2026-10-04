import type { Board } from '../game/Board';

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
   BOARD
   ========================================================= */

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
}

