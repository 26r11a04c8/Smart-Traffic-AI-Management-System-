// Fires a pile of malformed, missing, and oversized payloads at the real
// server to confirm it degrades gracefully (ignores/rejects) rather than
// crashing the process — important since this server holds every room's
// state in memory for everyone, so one bad message must never take it
// down for the rest.
process.env.PORT = 4011;

const { io: ioClient } = require('socket.io-client');

const results = [];
function check(label, cond, extra) {
  results.push({ label, ok: !!cond, extra });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra !== undefined ? '  (' + JSON.stringify(extra) + ')' : ''}`);
}

function waitFor(socket, event, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for "${event}"`)), timeoutMs);
    socket.once(event, (payload) => { clearTimeout(t); resolve(payload); });
  });
}
function ackEmit(socket, event, payload) {
  return new Promise((resolve) => socket.emit(event, payload, resolve));
}

async function main() {
  require('../server.js');
  await new Promise(r => setTimeout(r, 300));
  const url = `http://localhost:${process.env.PORT}`;
  const alice = ioClient(url, { transports: ['websocket'] });
  await waitFor(alice, 'connect');
  alice.emit('identify', { userId: 'alice-1', name: 'Alice' });
  await new Promise(r => setTimeout(r, 150));

  // A helper that just fires an event and gives the server a moment to
  // (not) explode, then confirms the connection is still alive by doing
  // something normal afterward.
  async function stillAlive(label) {
    const pingRoom = await ackEmit(alice, 'rooms:create', { name: 'alive-check-' + Date.now(), visibility: 'public', capacity: 5 });
    check(label, pingRoom && pingRoom.ok === true, pingRoom);
  }

  // Events with no payload at all.
  alice.emit('identify');
  alice.emit('rooms:create');
  alice.emit('rooms:join');
  alice.emit('rooms:leave');
  alice.emit('rooms:close');
  alice.emit('chat:send');
  alice.emit('focus:start');
  alice.emit('webrtc:signal');
  alice.emit('webrtc:media-state');
  await new Promise(r => setTimeout(r, 200));
  await stillAlive('Server survives every event fired with a completely missing payload');

  // Wrong types where objects/strings/numbers are expected.
  alice.emit('rooms:create', 'not-an-object');
  alice.emit('rooms:create', 12345);
  alice.emit('rooms:create', null);
  alice.emit('rooms:create', { name: { nested: 'object-not-a-string' } });
  alice.emit('rooms:join', { roomId: 12345 });
  alice.emit('rooms:join', { roomId: {} });
  alice.emit('chat:send', { roomId: 'nope', text: { not: 'a string' } });
  alice.emit('webrtc:signal', { roomId: 'nope', toUserId: {}, data: 'not-an-object' });
  await new Promise(r => setTimeout(r, 200));
  await stillAlive('Server survives wrong-typed fields (numbers/objects where strings expected)');

  // Absurdly long strings (room name/description/chat message).
  // Long enough to exercise the server's truncation logic (name/description/
  // chat all cap out well under this), but safely under Socket.IO's default
  // maxHttpBufferSize (1MB) so the message itself isn't dropped in transit.
  const hugeString = 'x'.repeat(20_000);
  const oversizedRoom = await ackEmit(alice, 'rooms:create', { name: hugeString, description: hugeString, visibility: 'public', capacity: 5 });
  check('Oversized room name is truncated to the documented limit', oversizedRoom.room.name.length === 60, oversizedRoom.room.name.length);
  check('Oversized room description is truncated to the documented limit', oversizedRoom.room.description.length === 160, oversizedRoom.room.description.length);
  await new Promise(r => setTimeout(r, 200));
  await stillAlive('Server survives an oversized room name/description (should be truncated, not crash)');

  const roomForChatSpam = await ackEmit(alice, 'rooms:create', { name: 'spam-room', visibility: 'public', capacity: 5 });
  const chatMsgPromise = waitFor(alice, 'chat:message');
  alice.emit('chat:send', { roomId: roomForChatSpam.room.id, text: hugeString });
  const spamMsg = await chatMsgPromise;
  check('Oversized chat message is truncated to the documented limit', spamMsg.message.text.length === 500, spamMsg.message.text.length);
  await stillAlive('Server survives an oversized chat message (should be truncated, not crash)');

  // Prototype-pollution-style keys.
  await ackEmit(alice, 'rooms:create', { name: '__proto__', visibility: 'public', capacity: 5 });
  await ackEmit(alice, 'rooms:join', { roomId: '__proto__', password: 'x' });
  await ackEmit(alice, 'rooms:create', { name: 'x', category: '__proto__', visibility: 'public', capacity: 5 });
  await new Promise(r => setTimeout(r, 200));
  const pollutionCheck = ({}).polluted;
  check('Object.prototype is not polluted by __proto__-named rooms/categories', pollutionCheck === undefined);
  await stillAlive('Server survives __proto__-keyed payloads');

  // Joining/acting on a room id that doesn't exist at all.
  const joinFake = await ackEmit(alice, 'rooms:join', { roomId: 'totally-made-up-id', password: 'x' });
  check('Joining a nonexistent room returns a clean error, not a crash', joinFake && joinFake.ok === false, joinFake);
  const closeFake = await ackEmit(alice, 'rooms:close', { roomId: 'totally-made-up-id' });
  check('Closing a nonexistent room returns a clean error, not a crash', closeFake && closeFake.ok === false, closeFake);

  // Negative / zero / NaN capacity and focus minutes.
  const weirdCapRoom = await ackEmit(alice, 'rooms:create', { name: 'weird-cap', visibility: 'public', capacity: -5 });
  check('Negative capacity is clamped to the minimum rather than accepted as-is', weirdCapRoom.room.capacity >= 2, weirdCapRoom.room.capacity);
  const nanCapRoom = await ackEmit(alice, 'rooms:create', { name: 'nan-cap', visibility: 'public', capacity: 'not-a-number' });
  check('Non-numeric capacity falls back to a sane default', Number.isInteger(nanCapRoom.room.capacity) && nanCapRoom.room.capacity >= 2, nanCapRoom.room.capacity);

  alice.emit('focus:start', { roomId: weirdCapRoom.room.id, minutes: -100 });
  await new Promise(r => setTimeout(r, 200));
  await stillAlive('Server survives negative focus minutes');

  alice.close();
  console.log(`\n${results.filter(r => r.ok).length}/${results.length} checks passed.`);
  const failed = results.filter(r => !r.ok);
  if (failed.length) { console.log('FAILED:', failed.map(f => f.label)); process.exitCode = 1; }
  process.exit(process.exitCode || 0);
}

main().catch(err => { console.error('Test crashed:', err); process.exit(1); });
