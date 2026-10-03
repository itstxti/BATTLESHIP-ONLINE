import test from 'node:test';
import assert from 'node:assert/strict';

import { createRelayServer } from './index.mjs';

/* Raw protocol checks against the relay using Node's built-in WebSocket. */

function connect(url) {
  const socket = new WebSocket(url);
  const inbox = [];
  const waiters = [];

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    const waiter = waiters.shift();
    if (waiter) waiter(message);
    else inbox.push(message);
  });

  return {
    socket,
    opened: new Promise((resolve) =>
      socket.addEventListener('open', resolve, { once: true })
    ),
    send: (value) => socket.send(JSON.stringify(value)),
    next: () =>
      inbox.length
        ? Promise.resolve(inbox.shift())
        : new Promise((resolve) => waiters.push(resolve)),
    closed: new Promise((resolve) =>
      socket.addEventListener('close', resolve, { once: true })
    )
  };
}

async function setup(t) {
  const relay = createRelayServer();
  const { port } = await relay.listen(0, '127.0.0.1');
  t.after(() => relay.close());
  return { relay, url: `ws://127.0.0.1:${port}/ws` };
}

test('create + join pairs players and relays messages both ways', async (t) => {
  const { url } = await setup(t);

  const host = connect(url);
  await host.opened;
  host.send({ t: 'create' });
  const created = await host.next();
  assert.equal(created.t, 'created');
  assert.match(created.code, /^[A-Z2-9]{5}$/);

  const guest = connect(url);
  await guest.opened;
  // lowercase and padded codes are accepted
  guest.send({ t: 'join', code: ` ${created.code.toLowerCase()} ` });

  const [a, b] = await Promise.all([host.next(), guest.next()]);
  assert.equal(a.t, 'matched');
  assert.equal(b.t, 'matched');
  assert.notEqual(a.startsFirst, b.startsFirst);

  host.send({ t: 'relay', data: { type: 'ready', protocol: 1 } });
  assert.deepEqual(await guest.next(), {
    t: 'relay',
    data: { type: 'ready', protocol: 1 }
  });

  guest.send({ t: 'relay', data: { type: 'shot', seq: 1, row: 0, column: 0 } });
  assert.deepEqual(await host.next(), {
    t: 'relay',
    data: { type: 'shot', seq: 1, row: 0, column: 0 }
  });
});

test('peer-left is sent and the room is removed', async (t) => {
  const { url, relay } = await setup(t);

  const host = connect(url);
  await host.opened;
  host.send({ t: 'create' });
  const { code } = await host.next();

  const guest = connect(url);
  await guest.opened;
  guest.send({ t: 'join', code });
  await Promise.all([host.next(), guest.next()]);

  guest.socket.close();
  assert.deepEqual(await host.next(), { t: 'peer-left' });
  await host.closed;
  assert.equal(relay.rooms.size, 0);
});

test('closing a waiting host frees the code', async (t) => {
  const { url, relay } = await setup(t);

  const host = connect(url);
  await host.opened;
  host.send({ t: 'create' });
  await host.next();
  assert.equal(relay.rooms.size, 1);

  host.socket.close();
  await host.closed;
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(relay.rooms.size, 0);
});

test('errors: unknown room, full room, malformed input, relay before match', async (t) => {
  const { url } = await setup(t);

  const lost = connect(url);
  await lost.opened;
  lost.send({ t: 'join', code: 'NOPE1' });
  assert.deepEqual(await lost.next(), { t: 'error', reason: 'room-not-found' });

  lost.socket.send('not json');
  assert.deepEqual(await lost.next(), { t: 'error', reason: 'bad-request' });

  lost.send({ t: 'relay', data: { type: 'ready' } });
  assert.deepEqual(await lost.next(), { t: 'error', reason: 'bad-request' });

  const host = connect(url);
  await host.opened;
  host.send({ t: 'create' });
  const { code } = await host.next();

  const guest = connect(url);
  await guest.opened;
  guest.send({ t: 'join', code });
  await Promise.all([host.next(), guest.next()]);

  const third = connect(url);
  await third.opened;
  third.send({ t: 'join', code });
  assert.deepEqual(await third.next(), { t: 'error', reason: 'room-full' });

  // payloads must be objects with a string `type`
  host.send({ t: 'relay', data: 'nope' });
  assert.deepEqual(await host.next(), { t: 'error', reason: 'bad-request' });
});

test('oversized frames are rejected', async (t) => {
  const { url } = await setup(t);

  const client = connect(url);
  await client.opened;
  client.socket.send('x'.repeat(20_000));
  const event = await client.closed;
  assert.equal(event.code, 1009);
});

test('health endpoint answers', async (t) => {
  const { url } = await setup(t);
  const response = await fetch(url.replace('ws://', 'http://').replace('/ws', '/health'));
  assert.equal(await response.text(), 'ok');
});
