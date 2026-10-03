import {
  hostRoom,
  joinRoom,
  type LobbyError,
  type LobbySession,
  type Match
} from './lobbyClient';

import { getServerUrl } from './serverUrl';

export type LobbyScreenCallbacks = {
  onMatched: (match: Match) => void;
  onBack: () => void;
};

const ERROR_TEXT: Record<LobbyError, string> = {
  'room-not-found': 'That room does not exist. Check the code and try again.',
  'room-full': 'That room already has two players.',
  'room-expired': 'The room expired while waiting. Create a new one.',
  'server-full': 'The server is full right now. Try again in a moment.',
  'bad-request': 'Something went wrong talking to the server.',
  'connection-failed': 'Could not reach the game server.',
  'connection-lost': 'Lost connection to the game server.'
};

const CODE_LENGTH = 5;

/**
 * Renders the online lobby (create a room / join with a code) into `root`.
 * Returns a teardown function that cancels any pending connection.
 */
export function mountLobbyScreen(
  root: HTMLElement,
  callbacks: LobbyScreenCallbacks
): () => void {
  let session: LobbySession | null = null;
  let disposed = false;

  const leave = (): void => {
    session?.cancel();
    session = null;
  };

  const handlers = {
    onMatched: (match: Match): void => {
      if (disposed) {
        match.transport.close();
        return;
      }

      session = null;
      callbacks.onMatched(match);
    },

    onError: (reason: LobbyError): void => {
      if (disposed) {
        return;
      }

      session = null;
      renderChoice(ERROR_TEXT[reason]);
    }
  };

  function frame(title: string, text: string): HTMLDivElement {
    root.replaceChildren();

    const header = document.createElement('div');

    header.className = 'game-mode-header';

    const eyebrow = document.createElement('span');

    eyebrow.className = 'game-mode-eyebrow';
    eyebrow.textContent = 'ONLINE MULTIPLAYER';

    const heading = document.createElement('h2');

    heading.textContent = title;

    const paragraph = document.createElement('p');

    paragraph.textContent = text;

    header.append(eyebrow, heading, paragraph);

    const body = document.createElement('div');

    body.className = 'lobby-body';

    root.append(header, body);

    return body;
  }

  function addBack(
    body: HTMLElement,
    label: string,
    action: () => void
  ): void {
    const button = document.createElement('button');

    button.type = 'button';
    button.className = 'lobby-link';
    button.textContent = label;
    button.addEventListener('click', action);

    body.append(button);
  }

  function renderChoice(error?: string): void {
    leave();

    const body = frame(
      'Play a friend',
      'Create a room and share the code, or join with a code you received.'
    );

    if (error) {
      const alert = document.createElement('p');

      alert.className = 'lobby-error';
      alert.setAttribute('role', 'alert');
      alert.textContent = error;

      body.append(alert);
    }

    const create = document.createElement('button');

    create.type = 'button';
    create.className = 'game-mode-button';
    create.innerHTML = `
      <span class="game-mode-number">01</span>
      <span class="game-mode-content">
        <span class="game-mode-title">Create room</span>
        <span class="game-mode-description">Get a code to share with a friend</span>
      </span>
      <span class="game-mode-arrow">→</span>
    `;
    create.addEventListener('click', renderWaiting);

    const joinBox = document.createElement('div');

    joinBox.className = 'lobby-join';

    const input = document.createElement('input');

    input.className = 'lobby-input';
    input.type = 'text';
    input.inputMode = 'text';
    input.autocomplete = 'off';
    input.autocapitalize = 'characters';
    input.spellcheck = false;
    input.maxLength = CODE_LENGTH;
    input.placeholder = 'ROOM CODE';
    input.setAttribute('aria-label', 'Room code');

    const join = document.createElement('button');

    join.type = 'button';
    join.className = 'lobby-join-button';
    join.textContent = 'Join';
    join.disabled = true;

    const normalize = (): string =>
      input.value.toUpperCase().replace(/[^A-Z0-9]/g, '');

    input.addEventListener('input', () => {
      input.value = normalize();
      join.disabled = input.value.length !== CODE_LENGTH;
    });

    const submit = (): void => {
      const code = normalize();

      if (code.length === CODE_LENGTH) {
        renderJoining(code);
      }
    };

    join.addEventListener('click', submit);

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        submit();
      }
    });

    joinBox.append(input, join);

    body.append(create, joinBox);

    addBack(body, '← Back to menu', () => {
      leave();
      callbacks.onBack();
    });

    input.focus();
  }

  function renderWaiting(): void {
    const body = frame(
      'Creating room…',
      'Connecting to the game server.'
    );

    addBack(body, '← Cancel', () => renderChoice());

    session = hostRoom(getServerUrl(), {
      ...handlers,

      onCreated: (code) => {
        if (disposed) {
          return;
        }

        const waiting = frame(
          'Waiting for your friend',
          'Share this code. The game starts as soon as they join.'
        );

        const codeBox = document.createElement('div');

        codeBox.className = 'lobby-code';
        codeBox.textContent = code;
        codeBox.setAttribute('aria-label', `Room code ${code.split('').join(' ')}`);

        const copy = document.createElement('button');

        copy.type = 'button';
        copy.className = 'lobby-join-button';
        copy.textContent = 'Copy code';

        copy.addEventListener('click', () => {
          void navigator.clipboard
            ?.writeText(code)
            .then(() => {
              copy.textContent = 'Copied!';
            })
            .catch(() => {
              copy.textContent = 'Copy failed';
            });
        });

        waiting.append(codeBox, copy);

        addBack(waiting, '← Cancel', () => renderChoice());
      }
    });
  }

  function renderJoining(code: string): void {
    const body = frame('Joining room…', `Connecting to room ${code}.`);

    addBack(body, '← Cancel', () => renderChoice());

    session = joinRoom(getServerUrl(), code, handlers);
  }

  renderChoice();

  return () => {
    disposed = true;
    leave();
    root.replaceChildren();
  };
}
