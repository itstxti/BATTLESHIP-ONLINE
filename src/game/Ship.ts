export type Position = {
  row: number;
  column: number;
};

export type ShipName =
  | 'Carrier'
  | 'Battleship'
  | 'Cruiser'
  | 'Submarine'
  | 'Destroyer';

export class Ship {
  readonly name: ShipName;
  readonly size: number;
  readonly positions: Position[];

  private hits = new Set<string>();

  constructor(
    name: ShipName,
    size: number,
    positions: Position[]
  ) {
    this.name = name;
    this.size = size;
    this.positions = positions;
  }

  hit(row: number, column: number): void {
    const isPartOfShip = this.positions.some(
      (position) =>
        position.row === row &&
        position.column === column
    );

    if (isPartOfShip) {
      this.hits.add(`${row},${column}`);
    }
  }

  isSunk(): boolean {
    return this.hits.size >= this.size;
  }
}