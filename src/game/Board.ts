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

    private isInsideBoard(
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