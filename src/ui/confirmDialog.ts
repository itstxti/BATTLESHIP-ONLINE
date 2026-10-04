export type ConfirmOptions = {
  title: string;
  message: string;

  /** Defaults to "Confirm". */
  confirmLabel?: string;

  /** Defaults to "Cancel". */
  cancelLabel?: string;

  /** Styles the confirm button as a destructive action. */
  danger?: boolean;
};

export const CONFIRM_DIALOG_ID = 'confirm-dialog';

export const CONFIRM_ACCEPT_ID = 'confirm-dialog-accept';

export const CONFIRM_CANCEL_ID = 'confirm-dialog-cancel';

let dismissOpen: (() => void) | null = null;

/** Closes the open dialog, if any, as if the player had cancelled it. */
export function dismissConfirmDialog(): void {
  dismissOpen?.();
}

/**
 * In-page replacement for `window.confirm`. Resolves `true` on confirm and
 * `false` on cancel, Escape, a click on the backdrop, or when another dialog
 * or `dismissConfirmDialog()` replaces it.
 *
 * Cancel gets the initial focus, so a stray Enter never destroys anything.
 */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  dismissConfirmDialog();

  return new Promise<boolean>((resolve) => {
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const overlay = document.createElement('div');

    overlay.className = 'confirm-overlay';

    const dialog = document.createElement('div');

    dialog.id = CONFIRM_DIALOG_ID;
    dialog.className = 'confirm-dialog';
    dialog.setAttribute('role', 'alertdialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'confirm-dialog-title');
    dialog.setAttribute('aria-describedby', 'confirm-dialog-message');

    const title = document.createElement('h2');

    title.id = 'confirm-dialog-title';
    title.className = 'confirm-title';
    title.textContent = options.title;

    const message = document.createElement('p');

    message.id = 'confirm-dialog-message';
    message.className = 'confirm-message';
    message.textContent = options.message;

    const cancel = document.createElement('button');

    cancel.id = CONFIRM_CANCEL_ID;
    cancel.type = 'button';
    cancel.className = 'confirm-button confirm-button--cancel';
    cancel.textContent = options.cancelLabel ?? 'Cancel';

    const accept = document.createElement('button');

    accept.id = CONFIRM_ACCEPT_ID;
    accept.type = 'button';
    accept.className = options.danger
      ? 'confirm-button confirm-button--danger'
      : 'confirm-button confirm-button--accept';
    accept.textContent = options.confirmLabel ?? 'Confirm';

    const actions = document.createElement('div');

    actions.className = 'confirm-actions';
    actions.append(cancel, accept);

    dialog.append(title, message, actions);
    overlay.append(dialog);

    let settled = false;

    const close = (result: boolean): void => {
      if (settled) {
        return;
      }

      settled = true;

      if (dismissOpen === dismiss) {
        dismissOpen = null;
      }

      overlay.remove();

      // Only give focus back if nothing else has taken it in the meantime.
      if (
        previousFocus?.isConnected &&
        (document.activeElement === document.body ||
          document.activeElement === null)
      ) {
        previousFocus.focus();
      }

      resolve(result);
    };

    const dismiss = (): void => close(false);

    dismissOpen = dismiss;

    accept.addEventListener('click', () => close(true));
    cancel.addEventListener('click', () => close(false));

    // Only a click on the backdrop itself, never one that started in the dialog.
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        close(false);
      }
    });

    overlay.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();

        close(false);

        return;
      }

      // Keep Tab inside the dialog.
      if (event.key === 'Tab') {
        const first = event.shiftKey ? accept : cancel;
        const last = event.shiftKey ? cancel : accept;

        if (
          document.activeElement === last ||
          !dialog.contains(document.activeElement)
        ) {
          event.preventDefault();

          first.focus();
        }
      }
    });

    document.body.append(overlay);

    cancel.focus();
  });
}
