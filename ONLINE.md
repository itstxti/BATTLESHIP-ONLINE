# Online multiplayer

Two players are paired through a small relay server (`server/index.mjs`,
zero dependencies, Node 22+). The relay only forwards messages; the game
rules still live in `MultiplayerGame` and the defender decides every shot.

## Run it

Development (two terminals):

    npm run server      # relay on :8787 (PORT=xxxx to change)
    npm run dev         # Vite proxies /ws to the relay

Production / playing with a friend on a real server:

    npm start           # builds, then serves dist/ and /ws from one port

Open the game, choose **Online Multiplayer**, create a room and send the
5-character code to your friend. To host the relay separately from the
static files, build with `VITE_WS_URL=wss://your-host/ws`.

Behind a reverse proxy (nginx, Caddy, Cloudflare…) make sure WebSocket
upgrades are forwarded for `/ws`. Use `wss://` when the page is on https.

## Tests

    npm test            # vitest (includes a full game over real WebSockets)
    npm run test:server # raw relay protocol checks (node:test)

## Behaviour

- Random player starts first; both place fleets, press **Ready**, battle
  starts when both are ready.
- Opponent disconnects or forfeits -> the remaining player wins.
- Rooms: 5 chars, expire after 10 min if nobody joins, max 2 players.
- No reconnection: a dropped connection ends the match.
