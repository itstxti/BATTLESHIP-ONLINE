/*
 * Exit animation for screens.
 *
 * The app switches screens by toggling the `hidden` property, which cuts
 * the old screen away instantly. Rather than rewriting that logic, this
 * wraps `hidden` on each screen: when a visible screen is hidden, a frozen
 * copy of it fades out on top while the real element hides at once. State
 * and tests still see `hidden` change synchronously.
 */

/** Keep in step with --dur-exit in style.css. */
const EXIT_MS = 120;

const hiddenDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'hidden'
);

function canAnimate(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: no-preference)').matches
  );
}

/** A frozen, inert copy of the screen at the position it is leaving. */
function snapshot(screen: HTMLElement): HTMLElement | null {
  const rect = screen.getBoundingClientRect();

  if (rect.width === 0 || rect.height === 0) {
    return null;
  }

  const ghost = screen.cloneNode(true) as HTMLElement;

  // The copy must not duplicate ids or take focus.
  ghost.removeAttribute('id');
  ghost.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));
  ghost.hidden = false;
  ghost.setAttribute('aria-hidden', 'true');
  ghost.setAttribute('inert', '');
  ghost.classList.add('screen-exit-clone');

  ghost.style.top = `${rect.top}px`;
  ghost.style.left = `${rect.left}px`;
  ghost.style.width = `${rect.width}px`;
  ghost.style.height = `${rect.height}px`;

  return ghost;
}

function playExit(screen: HTMLElement, ghost: HTMLElement): void {
  const parent = screen.parentElement;

  if (!parent) {
    return;
  }

  const remove = (): void => ghost.remove();

  ghost.addEventListener('animationend', remove, { once: true });

  // Safety net if the animation never fires.
  window.setTimeout(remove, EXIT_MS + 200);

  parent.appendChild(ghost);
}

/**
 * Slides a still copy of `screen` out sideways while the caller swaps its
 * content, so two views of one screen cross over instead of snapping.
 * Call it before the content changes. `offsetX` is where the old view goes
 * (0 = plain fade).
 */
export function playSwapExit(screen: HTMLElement, offsetX: number): void {
  if (!canAnimate()) {
    return;
  }

  const ghost = snapshot(screen);

  if (!ghost) {
    return;
  }

  ghost.style.setProperty('--exit-x', `${offsetX}px`);
  ghost.style.setProperty('--exit-y', '0px');

  playExit(screen, ghost);
}

export function installScreenExit(ids: readonly string[]): void {
  const read = hiddenDescriptor?.get;
  const write = hiddenDescriptor?.set;

  if (!read || !write) {
    return;
  }

  for (const id of ids) {
    const screen = document.getElementById(id);

    if (!screen) {
      continue;
    }

    // A screen that was shown during this same turn never reached the
    // display, so hiding it again must not flash a copy of it.
    let shownThisTurn = false;

    Object.defineProperty(screen, 'hidden', {
      configurable: true,

      get(): boolean {
        return read.call(screen) as boolean;
      },

      set(value: boolean): void {
        const wasVisible = !(read.call(screen) as boolean);

        const ghost =
          value && wasVisible && !shownThisTurn && canAnimate()
            ? snapshot(screen)
            : null;

        if (!value && !wasVisible) {
          shownThisTurn = true;

          queueMicrotask(() => {
            shownThisTurn = false;
          });
        }

        write.call(screen, value);

        if (!ghost) {
          return;
        }

        // Decide once the calling code has finished: a screen that is hidden
        // and shown again in the same turn must not flash a copy.
        queueMicrotask(() => {
          if (read.call(screen) as boolean) {
            playExit(screen, ghost);
          }
        });
      }
    });
  }
}
