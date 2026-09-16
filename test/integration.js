// Integration test for server.js. Starts the ACTUAL server (not a mock)
// on a fixed test port and drives it with two real socket.io-client
// connections through: identify -> list rooms -> create room -> second
// client joins -> chat relay -> WebRTC signal relay -> media-state ->
// focus timer -> host leaves (host reassignment) -> disconnect cleanup.
//
// Run with: node test/integration.js
process.env.PORT = 4010;

const { io: ioClient } = require('socket.io-client');

const results = [];
function check(label, cond, extra) {
  results.push({ label, ok: !!cond, extra });
  const mark = cond ? 'PASS' : 'FAIL';
  console.log(`${mark}  ${label}${extra !== undefined ? '  (' + JSON.stringify(extra) + ')' : ''}`);
}

function waitFor(socket, event, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for "${event}"`)), timeoutMs);
    socket.once(event, (payload) => {
      clearTimeout(t);
      resolve(payload);
    });
  });
}

function ackEmit(socket, event, payload) {
  return new Promise((resolve) => socket.emit(event, payload, resolve));
}

async function main() {
  require('../server.js'); // starts listening on process.env.PORT
  await new Promise(r => setTimeout(r, 300)); // let it bind

  const url = `http://localhost:${process.env.PORT}`;
  const alice = ioClient(url, { transports: ['websocket'] });
  const bob = ioClient(url, { transports: ['websocket'] });

  await Promise.all([waitFor(alice, 'connect'), waitFor(bob, 'connect')]);
  check('Both clients connected', alice.connected && bob.connected);

  alice.emit('identify', { userId: 'alice-1', name: 'Alice', avatarColor: '#3b82f6' });
  bob.emit('identify', { userId: 'bob-1', name: 'Bob', avatarColor: '#ec4899' });
  await new Promise(r => setTimeout(r, 200));

  // ---- seed rooms present on connect ----
  const list1Promise = waitFor(alice, 'rooms:list');
  alice.emit('rooms:requestList');
  const list1 = await list1Promise;
  check('Seed rooms exist on boot', Array.isArray(list1) && list1.length === 5, list1.length);
  check('Seed room summaries omit password hash field', list1.every(r => !('passwordHash' in r)));

  // ---- create a public room ----
  const createRes = await ackEmit(alice, 'rooms:create', {
    name: 'Test Room', description: 'desc', category: 'STEM', visibility: 'public', capacity: 5
  });
  check('Room creation acked ok', createRes && createRes.ok === true, createRes);
  const roomId = createRes.room.id;
  check('Creator is host', createRes.room.hostId === 'alice-1');
  check('Creator auto-added as participant', !!createRes.room.participants['alice-1']);

  // ---- private room + password ----
  const privRes = await ackEmit(alice, 'rooms:create', {
    name: 'Secret Room', visibility: 'private', password: 'hunter2', capacity: 5
  });
  check('Private room created', privRes.ok === true);
  const privRoomId = privRes.room.id;

  const wrongPwJoin = await ackEmit(bob, 'rooms:join', { roomId: privRoomId, password: 'nope' });
  check('Wrong password rejected', wrongPwJoin.ok === false, wrongPwJoin.error);

  const rightPwJoin = await ackEmit(bob, 'rooms:join', { roomId: privRoomId, password: 'hunter2' });
  check('Correct password accepted', rightPwJoin.ok === true, rightPwJoin.error);
  const privLeaveStatePromise = waitFor(alice, 'room:state'); // alice (still in the room) sees bob leave
  bob.emit('rooms:leave', { roomId: privRoomId });
  await privLeaveStatePromise;

  // ---- bob joins the public test room ----
  const statePromise = waitFor(alice, 'room:state'); // alice should get notified bob joined
  const joinRes = await ackEmit(bob, 'rooms:join', { roomId, password: undefined });
  check('Second user joins ok', joinRes.ok === true, joinRes.error);
  const stateAfterJoin = await statePromise;
  check('Host sees updated participant count via room:state', Object.keys(stateAfterJoin.participants).length === 2);

  // ---- capacity enforcement ----
  // Capacity is clamped server-side to a minimum of 2 (a 1-person "room"
  // doesn't make sense), so exercise the real limit with a 3rd client.
  const fullRes = await ackEmit(alice, 'rooms:create', { name: 'Tiny Room', visibility: 'public', capacity: 2 });
  const tinyId = fullRes.room.id;
  const secondJoinOk = await ackEmit(bob, 'rooms:join', { roomId: tinyId, password: undefined });
  check('Room accepts participants up to capacity', secondJoinOk.ok === true, secondJoinOk.error);

  const dave = ioClient(url, { transports: ['websocket'] });
  await waitFor(dave, 'connect');
  dave.emit('identify', { userId: 'dave-1', name: 'Dave', avatarColor: '#f59e0b' });
  await new Promise(r => setTimeout(r, 150));
  const overCapacity = await ackEmit(dave, 'rooms:join', { roomId: tinyId, password: undefined });
  check('Room-full rejected once capacity is actually exceeded', overCapacity.ok === false, overCapacity.error);
  dave.close();

  // ---- chat relay ----
  const chatPromise = waitFor(bob, 'chat:message');
  alice.emit('chat:send', { roomId, text: 'hey bob' });
  const chatMsg = await chatPromise;
  check('Chat message relayed to other participant', chatMsg.message.text === 'hey bob' && chatMsg.message.senderName === 'Alice', chatMsg);

  // ---- WebRTC signaling relay (offer/answer/candidate) ----
  const offerPromise = waitFor(bob, 'webrtc:signal');
  alice.emit('webrtc:signal', { roomId, toUserId: 'bob-1', data: { type: 'offer', sdp: 'fake-sdp-offer' } });
  const offerRelayed = await offerPromise;
  check('WebRTC offer relayed to correct target with correct sender', offerRelayed.fromUserId === 'alice-1' && offerRelayed.data.type === 'offer', offerRelayed);

  const answerPromise = waitFor(alice, 'webrtc:signal');
  bob.emit('webrtc:signal', { roomId, toUserId: 'alice-1', data: { type: 'answer', sdp: 'fake-sdp-answer' } });
  const answerRelayed = await answerPromise;
  check('WebRTC answer relayed back', answerRelayed.fromUserId === 'bob-1' && answerRelayed.data.type === 'answer');

  const candidatePromise = waitFor(bob, 'webrtc:signal');
  alice.emit('webrtc:signal', { roomId, toUserId: 'bob-1', data: { type: 'candidate', candidate: { candidate: 'fake' } } });
  const candidateRelayed = await candidatePromise;
  check('ICE candidate relayed', candidateRelayed.data.type === 'candidate');

  // signaling to someone NOT in the room should be silently dropped, not crash
  let strayReceived = false;
  bob.once('webrtc:signal', () => { strayReceived = true; });
  alice.emit('webrtc:signal', { roomId, toUserId: 'not-a-real-user', data: { type: 'offer' } });
  await new Promise(r => setTimeout(r, 200));
  check('Signal to unknown participant is dropped (no crash, no misroute)', strayReceived === false);

  // ---- media-state broadcast ----
  const mediaStatePromise = waitFor(alice, 'room:state');
  bob.emit('webrtc:media-state', { roomId, video: false, audio: false });
  const mediaState = await mediaStatePromise;
  check('media-state reflected in room:state', mediaState.participants['bob-1'].media.video === false && mediaState.participants['bob-1'].media.audio === false, mediaState.participants['bob-1'].media);

  // ---- focus timer (host-only) ----
  // Let any in-flight events from the previous media-state broadcast
  // fully settle first, so the listener below can't be fooled by a
  // late-arriving unrelated room:state.
  await new Promise(r => setTimeout(r, 400));
  const focusFromNonHost = await new Promise((resolve) => {
    let gotState = false;
    const handler = () => { gotState = true; };
    bob.once('room:state', handler);
    bob.emit('focus:start', { roomId, minutes: 25 }); // bob is not host
    setTimeout(() => { bob.off('room:state', handler); resolve(gotState); }, 400);
  });
  check('Non-host focus:start is ignored (no state broadcast triggered by it)', focusFromNonHost === false);

  const focusStatePromise = waitFor(bob, 'room:state');
  alice.emit('focus:start', { roomId, minutes: 25 });
  const focusState = await focusStatePromise;
  check('Host focus:start sets focusEndsAt for everyone', typeof focusState.focusEndsAt === 'number' && focusState.focusMinutes === 25);

  // ---- host leaves -> reassignment ----
  const reassignPromise = waitFor(bob, 'room:state');
  alice.emit('rooms:leave', { roomId });
  const reassignedState = await reassignPromise;
  check('Host reassigned to remaining participant after host leaves', reassignedState.hostId === 'bob-1' && reassignedState.participants['bob-1'].isHost === true, reassignedState.hostId);
  check('Leaving participant removed from state', !reassignedState.participants['alice-1']);

  // ---- room close (host-only) ----
  const closeFail = await ackEmit(alice, 'rooms:close', { roomId }); // alice no longer host
  check('Non-host cannot close room', closeFail.ok === false, closeFail.error);

  const closedPromise = waitFor(bob, 'room:closed');
  const closeOk = await ackEmit(bob, 'rooms:close', { roomId });
  check('Host can close room', closeOk.ok === true);
  const closedEvent = await closedPromise;
  check('room:closed broadcast received', closedEvent.roomId === roomId);

  // ---- disconnect cleanup with grace period ----
  const carol = ioClient(url, { transports: ['websocket'] });
  await waitFor(carol, 'connect');
  carol.emit('identify', { userId: 'carol-1', name: 'Carol', avatarColor: '#22c55e' });
  await new Promise(r => setTimeout(r, 150));
  const carolRoomRes = await ackEmit(carol, 'rooms:create', { name: 'Carol Room', visibility: 'public', capacity: 5 });
  const carolRoomId = carolRoomRes.room.id;

  carol.disconnect();
  await new Promise(r => setTimeout(r, 1500));
  // Within the grace period, the participant should still be present.
  const listDuringGrace = await new Promise((resolve) => {
    alice.emit('rooms:requestList');
    alice.once('rooms:list', resolve);
  });
  const carolRoomDuringGrace = listDuringGrace.find(r => r.id === carolRoomId);
  check('Room still shows participant during disconnect grace period', carolRoomDuringGrace && carolRoomDuringGrace.count === 1, carolRoomDuringGrace);

  await new Promise(r => setTimeout(r, 9500)); // past the 10s grace window
  const listAfterGrace = await new Promise((resolve) => {
    alice.emit('rooms:requestList');
    alice.once('rooms:list', resolve);
  });
  const carolRoomAfterGrace = listAfterGrace.find(r => r.id === carolRoomId);
  check('Empty non-seed room cleaned up (or shows 0) after disconnect grace period elapses', !carolRoomAfterGrace || carolRoomAfterGrace.count === 0, carolRoomAfterGrace);

  alice.close();
  bob.close();
  carol.close();

  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length) {
    console.log('FAILED:', failed.map(f => f.label));
    process.exitCode = 1;
  }
  process.exit(process.exitCode || 0);
}

main().catch((err) => {
  console.error('Test crashed:', err);
  process.exit(1);
});
