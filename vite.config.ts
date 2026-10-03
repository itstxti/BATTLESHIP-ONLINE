import { defineConfig } from 'vite';

/*
 * Dev: `npm run server` (relay on :8787) + `npm run dev`.
 * The browser always talks to `/ws` on the page's own origin and Vite
 * forwards it to the relay, so no URL needs configuring.
 */
const RELAY_PORT = process.env.PORT ?? '8787';

export default defineConfig({
  server: {
    proxy: {
      '/ws': {
        target: `ws://localhost:${RELAY_PORT}`,
        ws: true
      }
    }
  }
});
