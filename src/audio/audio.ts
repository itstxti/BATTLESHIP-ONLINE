import {
  MUSIC,
  SFX,
  type MusicTrack,
  type SfxName
} from './sounds';


const STORAGE_KEY =
  'battleship-audio';


/*
 * HTMLMediaElement.play() returns a Promise in modern browsers, but older
 * browsers and some test environments return undefined (or throw
 * synchronously). Normalise every case into a Promise: undefined counts as
 * "playback started" and a synchronous throw counts as a rejection.
 */
function tryPlay(
  element: HTMLMediaElement
): Promise<void> {
  try {
    return Promise.resolve(
      element.play()
    );
  } catch (error) {
    return Promise.reject(error);
  }
}


interface AudioSettings {
  muted: boolean;
  musicVolume: number;
  sfxVolume: number;
}


const DEFAULT_SETTINGS: AudioSettings = {
  muted: false,
  musicVolume: 0.3,
  sfxVolume: 0.7
};


class AudioManager {
  private music:
    HTMLAudioElement | null = null;

  private currentTrack:
    MusicTrack | null = null;

  private settings:
    AudioSettings;

  private audioUnlocked =
    false;

  private pendingMusic:
    MusicTrack | null = null;

  private unlockHandler:
    (() => void) | null = null;


  constructor() {
    this.settings =
      this.loadSettings();

    this.setupUnlock();
  }


  private loadSettings(): AudioSettings {
    try {
      const stored =
        localStorage.getItem(
          STORAGE_KEY
        );

      if (!stored) {
        return {
          ...DEFAULT_SETTINGS
        };
      }

      const parsed =
        JSON.parse(stored);

      return {
        muted:
          typeof parsed.muted === 'boolean'
            ? parsed.muted
            : DEFAULT_SETTINGS.muted,

        musicVolume:
          typeof parsed.musicVolume === 'number'
            ? this.clamp(
                parsed.musicVolume
              )
            : DEFAULT_SETTINGS.musicVolume,

        sfxVolume:
          typeof parsed.sfxVolume === 'number'
            ? this.clamp(
                parsed.sfxVolume
              )
            : DEFAULT_SETTINGS.sfxVolume
      };
    } catch {
      return {
        ...DEFAULT_SETTINGS
      };
    }
  }


  private saveSettings(): void {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(
        this.settings
      )
    );
  }


  private setupUnlock(): void {
    this.unlockHandler =
      () => {
        this.unlockAudio();
      };

    document.addEventListener(
      'pointerdown',
      this.unlockHandler,
      {
        once: true,
        capture: true
      }
    );

    document.addEventListener(
      'keydown',
      this.unlockHandler,
      {
        once: true,
        capture: true
      }
    );
  }


  private unlockAudio(): void {
    if (this.audioUnlocked) {
      return;
    }

    this.audioUnlocked =
      true;

    if (this.unlockHandler) {
      document.removeEventListener(
        'pointerdown',
        this.unlockHandler,
        true
      );

      document.removeEventListener(
        'keydown',
        this.unlockHandler,
        true
      );

      this.unlockHandler =
        null;
    }

    if (
      this.pendingMusic &&
      !this.settings.muted
    ) {
      const track =
        this.pendingMusic;

      this.pendingMusic =
        null;

      this.playMusic(track);
    }
  }


  playMusic(
    track: MusicTrack
  ): void {
    if (
      this.currentTrack === track &&
      this.music
    ) {
      if (
        !this.settings.muted &&
        this.music.paused
      ) {
        this.startMusic(
          this.music
        );
      }

      return;
    }

    if (!this.audioUnlocked) {
      this.pendingMusic =
        track;
    }

    const previousMusic =
      this.music;

    const newMusic =
      new Audio(
        MUSIC[track]
      );

    newMusic.loop =
      true;

    newMusic.preload =
      'auto';

    newMusic.volume =
      0;

    this.music =
      newMusic;

    this.currentTrack =
      track;

    if (previousMusic) {
      this.fadeOut(
        previousMusic,
        () => {
          previousMusic.pause();
          previousMusic.currentTime = 0;
        }
      );
    }

    if (
      this.audioUnlocked &&
      !this.settings.muted
    ) {
      this.startMusic(
        newMusic
      );
    }
  }


  private startMusic(
    audio: HTMLAudioElement
  ): void {
    audio.volume = 0;

    tryPlay(audio)
      .then(() => {
        if (
          this.music !== audio
        ) {
          return;
        }

        this.fadeIn(
          audio
        );
      })
      .catch(() => {
        /*
         * The browser rejected playback.
         * Keep the track loaded; the next user
         * interaction will retry it.
         */
        this.audioUnlocked =
          false;

        this.pendingMusic =
          this.currentTrack;

        this.setupUnlock();
      });
  }


  stopMusic(): void {
    if (!this.music) {
      return;
    }

    const music =
      this.music;

    this.fadeOut(
      music,
      () => {
        music.pause();
        music.currentTime = 0;

        if (
          this.music === music
        ) {
          this.music = null;
          this.currentTrack = null;
        }
      }
    );
  }


  playSfx(
    sound: SfxName
  ): void {
    if (
      this.settings.muted ||
      this.settings.sfxVolume <= 0
    ) {
      return;
    }

    if (!this.audioUnlocked) {
      return;
    }

    const audio =
      new Audio(
        SFX[sound]
      );

    audio.preload =
      'auto';

    audio.volume =
      this.clamp(
        this.settings.sfxVolume
      );

    tryPlay(audio)
      .catch(() => {
        /*
         * Ignore individual SFX failures.
         * The next user interaction will keep
         * the audio system available.
         */
      });
  }


  setMusicVolume(
    volume: number
  ): void {
    this.settings.musicVolume =
      this.clamp(volume);

    if (this.music) {
      this.music.volume =
        this.settings.muted
          ? 0
          : this.clamp(
              this.settings.musicVolume
            );
    }

    this.saveSettings();
  }


  setSfxVolume(
    volume: number
  ): void {
    this.settings.sfxVolume =
      this.clamp(volume);

    this.saveSettings();
  }


  getMusicVolume(): number {
    return this.settings.musicVolume;
  }


  getSfxVolume(): number {
    return this.settings.sfxVolume;
  }


  setMuted(
    muted: boolean
  ): void {
    this.settings.muted =
      muted;

    if (this.music) {
      this.music.volume =
        muted
          ? 0
          : this.clamp(
              this.settings.musicVolume
            );
    }

    this.saveSettings();

    if (
      !muted &&
      this.music
    ) {
      if (this.audioUnlocked) {
        this.startMusic(
          this.music
        );
      } else {
        this.pendingMusic =
          this.currentTrack;
      }
    }
  }


  toggleMute(): boolean {
    this.setMuted(
      !this.settings.muted
    );

    return this.settings.muted;
  }


  isMuted(): boolean {
    return this.settings.muted;
  }


  private fadeIn(
    audio: HTMLAudioElement,
    duration = 800
  ): void {
    const targetVolume =
      this.clamp(
        this.settings.musicVolume
      );

    const start =
      performance.now();

    const update =
      (time: number) => {
        if (
          this.music !== audio
        ) {
          return;
        }

        const progress =
          Math.min(
            (time - start) /
              duration,
            1
          );

        audio.volume =
          this.clamp(
            targetVolume *
              progress
          );

        if (
          progress < 1
        ) {
          requestAnimationFrame(
            update
          );
        }
      };

    requestAnimationFrame(
      update
    );
  }


  private fadeOut(
    audio: HTMLAudioElement,
    onComplete?: () => void,
    duration = 800
  ): void {
    const startVolume =
      this.clamp(
        audio.volume
      );

    const start =
      performance.now();

    const update =
      (time: number) => {
        const progress =
          Math.min(
            (time - start) /
              duration,
            1
          );

        const volume =
          startVolume *
          (1 - progress);

        audio.volume =
          this.clamp(
            volume
          );

        if (
          progress < 1
        ) {
          requestAnimationFrame(
            update
          );
        } else {
          audio.volume = 0;
          onComplete?.();
        }
      };

    requestAnimationFrame(
      update
    );
  }


  private clamp(
    value: number
  ): number {
    if (
      !Number.isFinite(value)
    ) {
      return 0;
    }

    return Math.max(
      0,
      Math.min(1, value)
    );
  }
}


export const audio =
  new AudioManager();