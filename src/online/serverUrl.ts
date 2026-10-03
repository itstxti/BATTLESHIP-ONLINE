/**
 * WebSocket endpoint of the relay server.
 *
 * Defaults to the same host that served the page (`/ws`), which works with
 * the Vite dev proxy and with `npm start`. Override at build time with
 * `VITE_WS_URL=wss://my-server.example.com/ws` when hosting the relay
 * separately from the static files.
 */
export function getServerUrl(): string {
  const override = import.meta.env?.VITE_WS_URL;

  if (typeof override === 'string' && override !== '') {
    return override;
  }

  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';

  return `${protocol}://${location.host}/ws`;
}
