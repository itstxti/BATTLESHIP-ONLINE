export type GamePhase =
  | 'placement'
  | 'battle'
  | 'game-over';

export type GameMode =
  | 'ai'
  | 'local'
  | 'online';

export type FleetDefinition = {
  name:
    | 'Carrier'
    | 'Battleship'
    | 'Cruiser'
    | 'Submarine'
    | 'Destroyer';

  size: number;
};

export type AIDifficulty =
  | 'easy'
  | 'medium'
  | 'hard';
