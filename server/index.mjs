import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Battleship relay server (zero dependencies).
 *
 * It only pairs two players in a room and forwards their game messages.
 * It knows nothing about the game rules: the defender stays the sole
 * authority on every shot (see src/game/MultiplayerGame.ts).
 *
 * Lobby protocol (JSON text frames):
 *   client -> server  { t: 'create' }
 *                     { t: 'join', code }
 *                     { t: 'relay', data }
 *   server -> client  { t: 'created', code }
 *                     { t: 'matched', startsFirst }
 *                     { t: 'relay', data }
 *                     { t: 'peer-left' }
 *                     { t: 'error', reason }
 */

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 5;
const MAX_PAYLOAD = 8 * 1024;
const MAX_ROOMS = 2000;
const WAITING_ROOM_TTL_MS = 10 * 60 * 1000;
const HEARTBEAT_MS = 25_000;
const RATE_WINDOW_MS = 1000;
const RATE_MAX_MESSAGES = 60;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.map': 'application/json'
};

/* ------------------------------------------------------------------ */
/* Minimal RFC 6455 connection                                         */
/* ------------------------------------------------------------------ */

class Connection {
  constructor(socket) {
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.fragments = [];
    this.alive = true;
    this.closed = false;
    this.onText = () => {};
    this.onClose = () => {};

    socket.on('data', (chunk) => this.#read(chunk));
    socket.on('close', () => this.#finish());
    socket.on('error', () => this.#finish());
  }

  sendJson(value) {
    this.#write(0x1, Buffer.from(JSON.stringify(value)));
  }

  ping() {
    this.#write(0x9, Buffer.alloc(0));
  }

  close(code = 1000) {
    if (this.closed) return;
    const payload = Buffer.alloc(2);
    payload.writeUInt16BE(code);
    this.#write(0x8, payload);
    this.socket.end();
    this.#finish();
  }

  #finish() {
    if (this.closed) return;
    this.closed = true;
    this.socket.destroy();
    this.onClose();
  }

  #write(opcode, payload) {
    if (this.closed || !this.socket.writable) return;
    const length = payload.length;
    let header;
    if (length < 126) {
      header = Buffer.from([0x80 | opcode, length]);
    } else if (length < 65536) {
      header = Buffer.alloc(4);
      header[0] = 0x80 | opcode;
      header[1] = 126;
      header.writeUInt16BE(length, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x80 | opcode;
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(length), 2);
    }
    this.socket.write(Buffer.concat([header, payload]));
  }

  #read(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    while (!this.closed) {
      if (this.buffer.length < 2) return;

      const first = this.buffer[0];
      const second = this.buffer[1];
      const fin = (first & 0x80) !== 0;
      const opcode = first & 0x0f;
      const masked = (second & 0x80) !== 0;
      let length = second & 0x7f;
      let offset = 2;

      if (!masked) {
        // Clients MUST mask frames.
        this.close(1002);
        return;
      }

      if (length === 126) {
        if (this.buffer.length < 4) return;
        length = this.buffer.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (this.buffer.length < 10) return;
        const big = this.buffer.readBigUInt64BE(2);
        if (big > BigInt(MAX_PAYLOAD)) {
          this.close(1009);
          return;
        }
        length = Number(big);
        offset = 10;
      }

      if (length > MAX_PAYLOAD) {
        this.close(1009);
        return;
      }

      if (this.buffer.length < offset + 4 + length) return;

      const mask = this.buffer.subarray(offset, offset + 4);
      const payload = Buffer.from(
        this.buffer.subarray(offset + 4, offset + 4 + length)
      );
      this.buffer = this.buffer.subarray(offset + 4 + length);

      for (let i = 0; i < payload.length; i++) {
        payload[i] ^= mask[i % 4];
      }

      this.#frame(fin, opcode, payload);
    }
  }

  #frame(fin, opcode, payload) {
    switch (opcode) {
      case 0x0: // continuation
      case 0x1: // text
      case 0x2: {
        // binary is not part of our protocol
        if (opcode === 0x2) {
          this.close(1003);
          return;
        }
        if (opcode === 0x1) this.fragments = [];
        this.fragments.push(payload);
        if (this.fragments.reduce((n, f) => n + f.length, 0) > MAX_PAYLOAD) {
          this.close(1009);
          return;
        }
        if (fin) {
          const text = Buffer.concat(this.fragments).toString('utf8');
          this.fragments = [];
          this.onText(text);
        }
        return;
      }
      case 0x8:
        this.close(1000);
        return;
      case 0x9:
        this.#write(0xa, payload);
        return;
      case 0xa:
        this.alive = true;
        return;
      default:
        this.close(1002);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Rooms                                                               */
/* ------------------------------------------------------------------ */

function createCode(rooms) {
  for (let attempt = 0; attempt < 50; attempt++) {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++) {
      code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
    }
    if (!rooms.has(code)) return code;
  }
  return null;
}

function isRelayable(data) {
  return (
    typeof data === 'object' &&
    data !== null &&
    !Array.isArray(data) &&
    typeof data.type === 'string'
  );
}

export function createRelayServer({
  staticDir = null,
  rateMaxMessages = RATE_MAX_MESSAGES
} = {}) {
  /** @type {Map<string, {host: Connection, guest: Connection | null, timer: NodeJS.Timeout | null}>} */
  const rooms = new Map();
  /** @type {Set<Connection>} */
  const connections = new Set();

  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('ok');
      return;
    }

    if (!staticDir) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not found');
      return;
    }

    const url = new URL(req.url ?? '/', 'http://localhost');
    let relative = decodeURIComponent(url.pathname);
    if (relative.endsWith('/')) relative += 'index.html';

    const file = path.join(staticDir, path.normalize(relative));

    if (!file.startsWith(staticDir)) {
      res.writeHead(403);
      res.end();
      return;
    }

    fs.readFile(file, (error, content) => {
      if (error) {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('Not found');
        return;
      }
      res.writeHead(200, {
        'content-type': MIME[path.extname(file)] ?? 'application/octet-stream'
      });
      res.end(content);
    });
  });

  server.on('upgrade', (req, socket) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const key = req.headers['sec-websocket-key'];

    if (
      url.pathname !== '/ws' ||
      req.headers.upgrade?.toLowerCase() !== 'websocket' ||
      typeof key !== 'string'
    ) {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
      return;
    }

    const accept = crypto
      .createHash('sha1')
      .update(key + GUID)
      .digest('base64');

    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
    );

    attach(new Connection(socket));
  });

  function removeRoom(code) {
    const room = rooms.get(code);
    if (!room) return;
    if (room.timer) clearTimeout(room.timer);
    rooms.delete(code);
  }

  function attach(connection) {
    connections.add(connection);

    /** @type {{code: string, role: 'host' | 'guest'} | null} */
    let membership = null;
    let windowStart = Date.now();
    let windowCount = 0;

    const opponentOf = () => {
      if (!membership) return null;
      const room = rooms.get(membership.code);
      if (!room) return null;
      return membership.role === 'host' ? room.guest : room.host;
    };

    connection.onText = (text) => {
      const now = Date.now();
      if (now - windowStart > RATE_WINDOW_MS) {
        windowStart = now;
        windowCount = 0;
      }
      if (++windowCount > rateMaxMessages) {
        connection.close(1008);
        return;
      }

      let message;
      try {
        message = JSON.parse(text);
      } catch {
        connection.sendJson({ t: 'error', reason: 'bad-request' });
        return;
      }

      if (typeof message !== 'object' || message === null) {
        connection.sendJson({ t: 'error', reason: 'bad-request' });
        return;
      }

      switch (message.t) {
        case 'create': {
          if (membership) {
            connection.sendJson({ t: 'error', reason: 'bad-request' });
            return;
          }
          if (rooms.size >= MAX_ROOMS) {
            connection.sendJson({ t: 'error', reason: 'server-full' });
            return;
          }
          const code = createCode(rooms);
          if (!code) {
            connection.sendJson({ t: 'error', reason: 'server-full' });
            return;
          }
          const timer = setTimeout(() => {
            const room = rooms.get(code);
            if (room && !room.guest) {
              room.host.sendJson({ t: 'error', reason: 'room-expired' });
              room.host.close(1000);
            }
          }, WAITING_ROOM_TTL_MS);
          timer.unref?.();
          rooms.set(code, { host: connection, guest: null, timer });
          membership = { code, role: 'host' };
          connection.sendJson({ t: 'created', code });
          return;
        }

        case 'join': {
          if (membership || typeof message.code !== 'string') {
            connection.sendJson({ t: 'error', reason: 'bad-request' });
            return;
          }
          const code = message.code.trim().toUpperCase();
          const room = rooms.get(code);
          if (!room) {
            connection.sendJson({ t: 'error', reason: 'room-not-found' });
            return;
          }
          if (room.guest) {
            connection.sendJson({ t: 'error', reason: 'room-full' });
            return;
          }
          if (room.timer) {
            clearTimeout(room.timer);
            room.timer = null;
          }
          room.guest = connection;
          membership = { code, role: 'guest' };

          const hostStarts = crypto.randomInt(2) === 0;
          room.host.sendJson({ t: 'matched', startsFirst: hostStarts });
          room.guest.sendJson({ t: 'matched', startsFirst: !hostStarts });
          return;
        }

        case 'relay': {
          const peer = opponentOf();
          if (!peer || !isRelayable(message.data)) {
            connection.sendJson({ t: 'error', reason: 'bad-request' });
            return;
          }
          peer.sendJson({ t: 'relay', data: message.data });
          return;
        }

        default:
          connection.sendJson({ t: 'error', reason: 'bad-request' });
      }
    };

    connection.onClose = () => {
      connections.delete(connection);
      if (!membership) return;

      const peer = opponentOf();
      const { code } = membership;
      removeRoom(code);
      membership = null;

      if (peer) {
        peer.sendJson({ t: 'peer-left' });
        peer.close(1000);
      }
    };
  }

  const heartbeat = setInterval(() => {
    for (const connection of connections) {
      if (!connection.alive) {
        connection.close(1001);
        continue;
      }
      connection.alive = false;
      connection.ping();
    }
  }, HEARTBEAT_MS);
  heartbeat.unref?.();

  return {
    server,
    rooms,
    listen(port, host) {
      return new Promise((resolve) => {
        server.listen(port, host, () => resolve(server.address()));
      });
    },
    close() {
      clearInterval(heartbeat);
      for (const connection of [...connections]) connection.close(1001);
      for (const code of [...rooms.keys()]) removeRoom(code);
      return new Promise((resolve) => server.close(() => resolve()));
    }
  };
}

/* ------------------------------------------------------------------ */
/* CLI entry                                                           */
/* ------------------------------------------------------------------ */

const entry = process.argv[1] ? path.resolve(process.argv[1]) : '';

if (entry === fileURLToPath(import.meta.url)) {
  const dist = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../dist'
  );
  const port = Number(process.env.PORT ?? 8787);

  const relay = createRelayServer({
    staticDir: fs.existsSync(dist) ? dist : null
  });

  relay.listen(port).then(() => {
    console.log(`Battleship relay listening on :${port} (ws path: /ws)`);
    console.log(
      fs.existsSync(dist)
        ? `Serving ${dist}`
        : 'No dist/ found: run "npm run build" to serve the game from here.'
    );
  });
}
