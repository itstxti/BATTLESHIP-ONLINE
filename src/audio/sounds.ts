export const MUSIC = {
  menu: "/audio/music/menu.mp3",
  battle: "/audio/music/game.mp3",
} as const;

export const SFX = {
  click: "/audio/sfx/click.mp3",
  fire: "/audio/sfx/fire.mp3",
  hit: "/audio/sfx/hit.mp3",
  miss: "/audio/sfx/miss.mp3",
  sunk: "/audio/sfx/sunk.mp3",
  place: "/audio/sfx/place.mp3",
  win: "/audio/sfx/win.mp3",
  lose: "/audio/sfx/lose.mp3",
} as const;

export type MusicTrack = keyof typeof MUSIC;
export type SfxName = keyof typeof SFX;