// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';

import {
  confirmDialog,
  CONFIRM_ACCEPT_ID,
  CONFIRM_CANCEL_ID,
  CONFIRM_DIALOG_ID,
  dismissConfirmDialog
} from '../confirmDialog';

const open = () => document.getElementById(CONFIRM_DIALOG_ID);

const press = (key: string, shiftKey = false) =>
  document.activeElement?.dispatchEvent(
    new KeyboardEvent('keydown', { key, shiftKey, bubbles: true })
  );

const ask = () =>
  confirmDialog({ title: 'Sure?', message: 'Really?', confirmLabel: 'Yes' });

afterEach(() => {
  dismissConfirmDialog();
  document.body.innerHTML = '';
});

describe('confirmDialog', () => {
  it('renders an accessible dialog with Cancel focused', () => {
    void ask();

    const dialog = open()!;

    expect(dialog.getAttribute('role')).toBe('alertdialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.textContent).toContain('Sure?');
    expect(dialog.textContent).toContain('Really?');
    expect(document.getElementById(CONFIRM_ACCEPT_ID)!.textContent).toBe('Yes');
    expect(document.activeElement?.id).toBe(CONFIRM_CANCEL_ID);
  });

  it('resolves true on confirm and removes itself', async () => {
    const result = ask();

    document.getElementById(CONFIRM_ACCEPT_ID)!.click();

    expect(await result).toBe(true);
    expect(open()).toBeNull();
  });

  it('resolves false on cancel, Escape and backdrop click', async () => {
    let result = ask();
    document.getElementById(CONFIRM_CANCEL_ID)!.click();
    expect(await result).toBe(false);

    result = ask();
    press('Escape');
    expect(await result).toBe(false);

    result = ask();
    (open()!.parentElement as HTMLElement).click();
    expect(await result).toBe(false);
    expect(open()).toBeNull();
  });

  it('does not close when the click lands inside the dialog', () => {
    void ask();

    open()!.click();

    expect(open()).not.toBeNull();
  });

  it('keeps Tab inside the dialog', () => {
    void ask();

    document.getElementById(CONFIRM_ACCEPT_ID)!.focus();
    press('Tab');
    expect(document.activeElement?.id).toBe(CONFIRM_CANCEL_ID);

    press('Tab', true);
    expect(document.activeElement?.id).toBe(CONFIRM_ACCEPT_ID);
  });

  it('dismissConfirmDialog and a newer dialog both resolve the old one as false', async () => {
    const first = ask();
    dismissConfirmDialog();
    expect(await first).toBe(false);
    expect(open()).toBeNull();

    const second = ask();
    const third = ask();
    expect(await second).toBe(false);
    expect(document.querySelectorAll(`#${CONFIRM_DIALOG_ID}`)).toHaveLength(1);

    document.getElementById(CONFIRM_ACCEPT_ID)!.click();
    expect(await third).toBe(true);
  });

  it('returns focus to the element that opened it', async () => {
    const trigger = document.createElement('button');

    document.body.append(trigger);
    trigger.focus();

    const result = ask();

    document.getElementById(CONFIRM_CANCEL_ID)!.click();
    await result;

    expect(document.activeElement).toBe(trigger);
  });
});
