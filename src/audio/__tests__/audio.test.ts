// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { audio } from '../audio';

const flush = async () => {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
  }
};

describe('audio when play() does not return a Promise', () => {
  let play: ReturnType<typeof vi.spyOn>;

  beforeAll(() => {
    // Never runs the fade callbacks: only play() handling is under test.
    vi.stubGlobal('requestAnimationFrame', () => 0);

    // Browsers allow playback after the first user gesture.
    document.dispatchEvent(new Event('pointerdown'));
  });

  afterEach(() => {
    play.mockRestore();
  });

  it('plays sound effects without throwing when play() returns undefined', async () => {
    play = vi
      .spyOn(HTMLMediaElement.prototype, 'play')
      .mockImplementation(() => undefined as unknown as Promise<void>);

    expect(() => audio.playSfx('click')).not.toThrow();
    await flush();

    expect(play).toHaveBeenCalledTimes(1);
  });

  it('starts music without throwing and keeps audio unlocked', async () => {
    play = vi
      .spyOn(HTMLMediaElement.prototype, 'play')
      .mockImplementation(() => undefined as unknown as Promise<void>);

    expect(() => audio.playMusic('menu')).not.toThrow();
    await flush();

    // A missing Promise counts as "started": the unlock was not re-armed,
    // so effects still play.
    audio.playSfx('click');

    expect(play).toHaveBeenCalledTimes(2);
  });

  it('survives play() throwing synchronously', async () => {
    play = vi
      .spyOn(HTMLMediaElement.prototype, 'play')
      .mockImplementation(() => {
        throw new Error('NotSupportedError');
      });

    expect(() => audio.playSfx('click')).not.toThrow();
    await flush();

    expect(play).toHaveBeenCalledTimes(1);
  });
});
