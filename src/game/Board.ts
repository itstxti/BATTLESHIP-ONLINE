import {
    Ship,
    type Position,
    type ShipName
} from './Ship';

export type CellState =
    | 'empty'
    | 'ship'
    | 'hit'
    | 'miss';

export class Board {
    readonly size = 10;

    private grid: CellState[][];
    private ships: Ship[] = [];

    constructor() {
        this.grid = this.createEmptyGrid();
    }

    private createEmptyGrid(): CellState[][] {
        return Array.from(
            { length: this.size },
            () =>
                Array<CellState>(this.size).fill('empty')
        );
    }

    getCell(
        row: number,
        column: number
    ): CellState {
        return this.grid[row][column];
    }

    canPlaceShip(
        size: number,
        positions: Position[]
    ): boolean {
        if (positions.length !== size) {
            return false;
        }

        for (const position of positions) {
            if (
                !this.isInsideBoard(
                    position.row,
                    position.column
                )
            ) {
                return false;
            }

            if (
                this.grid[position.row][position.column] !==
                'empty'
            ) {
                return false;
            }
        }

        return true;
    }

    placeShip(
        name: ShipName,
        size: number,
        positions: Position[]
    ): boolean {
        if (!this.canPlaceShip(size, positions)) {
            return false;
        }

        if (this.hasShip(name)) {
            return false;
        }

        const ship = new Ship(
            name,
            size,
            positions
        );

        this.ships.push(ship);

        for (const position of positions) {
            this.grid[position.row][position.column] =
                'ship';
        }

        return true;
    }

    removeShip(name: ShipName): Position[] | null {
        const shipIndex =
            this.ships.findIndex(
                (ship) => ship.name === name
            );

        if (shipIndex === -1) {
            return null;
        }

        const ship =
            this.ships[shipIndex];

        for (const position of ship.positions) {
            this.grid[position.row][position.column] =
                'empty';
        }

        this.ships.splice(
            shipIndex,
            1
        );

        return ship.positions.map(
            (position) => ({
                row: position.row,
                column: position.column
            })
        );
    }

    hasShip(name: ShipName): boolean {
        return this.ships.some(
            (ship) => ship.name === name
        );
    }

    getPlacedShipNames(): ShipName[] {
        return this.ships.map(
            (ship) => ship.name
        );
    }

    placeFleetRandomly(): void {
        const fleet: {
            name: ShipName;
            size: number;
        }[] = [
                {
                    name: 'Carrier',
                    size: 5
                },
                {
                    name: 'Battleship',
                    size: 4
                },
                {
                    name: 'Cruiser',
                    size: 3
                },
                {
                    name: 'Submarine',
                    size: 3
                },
                {
                    name: 'Destroyer',
                    size: 2
                }
            ];

        for (const ship of fleet) {
            let placed = false;

            while (!placed) {
                const horizontal =
                    Math.random() < 0.5;

                const startRow =
                    Math.floor(
                        Math.random() * this.size
                    );

                const startColumn =
                    Math.floor(
                        Math.random() * this.size
                    );

                const positions: Position[] = [];

                for (
                    let i = 0;
                    i < ship.size;
                    i++
                ) {
                    positions.push({
                        row: horizontal
                            ? startRow
                            : startRow + i,

                        column: horizontal
                            ? startColumn + i
                            : startColumn
                    });
                }

                placed = this.placeShip(
                    ship.name,
                    ship.size,
                    positions
                );
            }
        }
    }

    shoot(
        row: number,
        column: number
    ):
        | 'hit'
        | 'miss'
        | 'already-shot' {
        if (
            !this.isInsideBoard(
                row,
                column
            )
        ) {
            return 'miss';
        }

        const cell =
            this.grid[row][column];

        if (
            cell === 'hit' ||
            cell === 'miss'
        ) {
            return 'already-shot';
        }

        if (cell === 'ship') {
            this.grid[row][column] =
                'hit';

            const ship =
                this.findShipAt(
                    row,
                    column
                );

            if (ship) {
                ship.hit(
                    row,
                    column
                );
            }

            return 'hit';
        }

        this.grid[row][column] =
            'miss';

        return 'miss';
    }

    /**
     * Fog-of-war API. A tracking board represents what we KNOW about the
     * enemy fleet: it never contains ships up front, only shot outcomes
     * reported by the defender.
     */
    recordShot(
        row: number,
        column: number,
        result: 'hit' | 'miss'
    ): boolean {
        if (!this.isInsideBoard(row, column)) {
            return false;
        }

        const cell = this.grid[row][column];

        if (cell === 'hit' || cell === 'miss') {
            return false;
        }

        this.grid[row][column] = result;

        return true;
    }

    /**
     * Reveals a ship the defender reported as sunk. Only accepted when it
     * is consistent with what we already know (every cell is a recorded hit,
     * contiguous, straight, and the ship was not revealed before).
     */
    markSunk(
        name: ShipName,
        size: number,
        positions: Position[]
    ): boolean {
        if (
            this.hasShip(name) ||
            positions.length !== size ||
            !this.isStraightLine(positions)
        ) {
            return false;
        }

        const allKnownHits = positions.every(
            (position) =>
                this.isInsideBoard(position.row, position.column) &&
                this.grid[position.row][position.column] === 'hit'
        );

        if (!allKnownHits) {
            return false;
        }

        const ship = new Ship(
            name,
            size,
            positions.map((position) => ({
                row: position.row,
                column: position.column
            }))
        );

        for (const position of positions) {
            ship.hit(position.row, position.column);
        }

        this.ships.push(ship);

        return true;
    }

    private isStraightLine(positions: Position[]): boolean {
        if (positions.length === 0) {
            return false;
        }

        const sameRow = positions.every(
            (position) => position.row === positions[0].row
        );

        const sameColumn = positions.every(
            (position) => position.column === positions[0].column
        );

        if (!sameRow && !sameColumn) {
            return false;
        }

        const axis = sameRow ? 'column' : 'row';

        const sorted = positions
            .map((position) => position[axis])
            .sort((a, b) => a - b);

        return sorted.every(
            (value, index) => index === 0 || value === sorted[index - 1] + 1
        );
    }

    allShipsSunk(): boolean {
        return (
            this.ships.length > 0 &&
            this.ships.every(
                (ship) => ship.isSunk()
            )
        );
    }

    getShips(): Ship[] {
        return this.ships;
    }

    getShipAt(
        row: number,
        column: number
    ): Ship | undefined {
        return this.findShipAt(
            row,
            column
        );
    }

    private findShipAt(
        row: number,
        column: number
    ): Ship | undefined {
        return this.ships.find(
            (ship) =>
                ship.positions.some(
                    (position) =>
                        position.row === row &&
                        position.column === column
                )
        );
    }

    isInsideBoard(
        row: number,
        column: number
    ): boolean {
        return (
            row >= 0 &&
            row < this.size &&
            column >= 0 &&
            column < this.size
        );
    }
}