export type GamePhase =
  | 'placement'
  | 'battle'
  | 'game-over';

export type FleetDefinition = {
  name:
    | 'Carrier'
    | 'Battleship'
    | 'Cruiser'
    | 'Submarine'
    | 'Destroyer';

  size: number;
};

