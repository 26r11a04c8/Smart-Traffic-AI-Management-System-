const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const results = [];
function check(label, cond, extra) {
  results.push({ label, ok: !!cond, extra });
  const mark = cond ? 'PASS' : 'FAIL';
  console.log(`${mark}  ${label}${extra !== undefined ? '  (' + JSON.stringify(extra) + ')' : ''}`);
}

const PUB = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8')
  .replace(/<script[^>]*src=[^>]*><\/script>\s*/g, ''); // strip all external/real script tags; we eval files manually below in order

const dom = new JSDOM(html, { url: 'http://localhost:3000/', pretendToBeVisual: true, runScripts: 'outside-only' });
const window = dom.window;
const document = window.document;

// ---- mocks ----
window.THREE = {
  Scene: function () { this.add = () => {}; },
  PerspectiveCamera: function () { this.position = { x: 0, y: 0, z: 0 }; },
  WebGLRenderer: function () { return { setSize(){}, setPixelRatio(){}, domElement: document.createElement('canvas'), render(){} }; },
  BufferGeometry: function () { this.setAttribute = () => {}; },
  BufferAttribute: function () {},
  PointsMaterial: function () {},
  Points: function () { this.rotation = { z: 0 }; },
  Color: function () { this.r = 1; this.g = 1; this.b = 1; },
  AdditiveBlending: 1
};
window.navigator.geolocation = { getCurrentPosition: (ok, fail) => fail() };
window.navigator.clipboard = { writeText: () => Promise.resolve() };

window.bootstrap = {
  Modal: {
    getOrCreateInstance: () => ({ show() {}, hide() {} }),
    getInstance: () => ({ show() {}, hide() {} })
  }
};

// Fake MediaStreamTrack / MediaStream for getUserMedia
function makeFakeTrack(kind) {
  return { kind, enabled: true, stop() { this.stopped = true; } };
}
const createdFakeStreams = [];
function makeFakeStream() {
  const tracks = [makeFakeTrack('audio'), makeFakeTrack('video')];
  const stream = {
    _tracks: tracks,
    getTracks: () => tracks,
    getAudioTracks: () => tracks.filter(t => t.kind === 'audio'),
    getVideoTracks: () => tracks.filter(t => t.kind === 'video')
  };
  createdFakeStreams.push(stream);
  return stream;
}
window.navigator.mediaDevices = {
  getUserMedia: () => Promise.resolve(makeFakeStream())
};

// Fake RTCPeerConnection sufficient to exercise webrtc.js's call-setup logic
const createdPeerConnections = [];
window.RTCPeerConnection = function (config) {
  this.config = config;
  this.tracks = [];
  this.connectionState = 'new';
  this.onicecandidate = null;
  this.ontrack = null;
  this.onconnectionstatechange = null;
  this.addTrack = (track, stream) => { this.tracks.push(track); };
  this.createOffer = () => Promise.resolve({ type: 'offer', sdp: 'fake-offer-sdp' });
  this.createAnswer = () => Promise.resolve({ type: 'answer', sdp: 'fake-answer-sdp' });
  this.setLocalDescription = (desc) => { this.localDescription = desc; return Promise.resolve(); };
  this.setRemoteDescription = (desc) => { this.remoteDescription = desc; return Promise.resolve(); };
  this.addIceCandidate = () => Promise.resolve();
  this.close = () => { this.connectionState = 'closed'; };
  createdPeerConnections.push(this);
};

// Fake Socket.IO client: an EventEmitter-ish object matching the subset of
// the API rooms.js/webrtc.js actually use, with ack callbacks captured so
// the test can simulate server responses on demand.
class FakeSocket {
  constructor() {
    this.listeners = {};
    this.emittedLog = [];
    this.lastAcks = {};
    this.connected = false;
  }
  on(event, cb) { (this.listeners[event] = this.listeners[event] || []).push(cb); }
  off(event, cb) { this.listeners[event] = (this.listeners[event] || []).filter(f => f !== cb); }
  emit(event, payload, ack) {
    this.emittedLog.push({ event, payload });
    if (typeof ack === 'function') this.lastAcks[event] = ack;
  }
  trigger(event, payload) {
    (this.listeners[event] || []).forEach(cb => cb(payload));
  }
}
const fakeSocket = new FakeSocket();
window.io = () => fakeSocket;

// ---- error tracking ----
const windowErrors = [];
window.onerror = (msg) => windowErrors.push(msg);

// ---- load every real source file, in the same order index.html does ----
const jsOrder = [
  'utils.js', 'storage.js', 'profile.js', 'background.js', 'navigation.js',
  'header.js', 'tasks.js', 'alarms.js', 'dashboard.js', 'pomodoro.js',
  'notes.js', 'friends.js', 'webrtc.js', 'rooms.js', 'app.js'
];

const combinedSrc = jsOrder.map(file => fs.readFileSync(path.join(PUB, 'js', file), 'utf8')).join('\n;\n');
try {
  window.eval(combinedSrc);
} catch (err) {
  windowErrors.push(`bundle: ${err.stack}`);
}

check('All JS files evaluated without throwing', windowErrors.length === 0, windowErrors);

// JSDOM fires its own native DOMContentLoaded asynchronously once parsing
// completes — which happens-after this synchronous eval, so app.js's
// listener (just attached above) will catch that real event on its own.
// We just need to wait for it rather than dispatching a second one
// ourselves, which would run app.js's whole init a second time.
function waitForDomContentLoaded() {
  return new Promise((resolve) => {
    if (document.readyState !== 'loading') { resolve(); return; }
    document.addEventListener('DOMContentLoaded', resolve, { once: true });
  });
}

async function main() {
  await waitForDomContentLoaded();
  check('App initialized without throwing (post-DOMContentLoaded)', windowErrors.length === 0, windowErrors);

  // Simulate the socket actually connecting.
  fakeSocket.connected = true;
  fakeSocket.trigger('connect');

  const identifyCall = fakeSocket.emittedLog.find(e => e.event === 'identify');
  check('Client identifies itself to the server on connect', !!identifyCall && !!identifyCall.payload.userId, identifyCall && identifyCall.payload);

  const listRequested = fakeSocket.emittedLog.some(e => e.event === 'rooms:requestList');
  check('Client requests the room list on connect', listRequested);

  // ---- Dashboard: empty state ----
  window.switchView('dashboard');
  const dashTasksEmpty = document.getElementById('dashboardTasksList').innerHTML;
  const dashAlarmsEmpty = document.getElementById('dashboardAlarmsList').innerHTML;
  check('Dashboard shows empty-state copy for tasks with none added', dashTasksEmpty.includes('No tasks yet'));
  check('Dashboard shows empty-state copy for alarms with none set', dashAlarmsEmpty.includes('No alarms set'));

  // ---- Tasks -> Dashboard sync ----
  window.switchView('tasks');
  document.getElementById('newTaskInput').value = 'Finish the lab report';
  window.addTask({ preventDefault() {} });
  window.switchView('dashboard');
  const dashTasksHtml = document.getElementById('dashboardTasksList').innerHTML;
  check('Newly added task appears in the dashboard task list', dashTasksHtml.includes('Finish the lab report'));

  const taskIdMatch = dashTasksHtml.match(/data-task-id="([^"]+)"/);
  if (taskIdMatch) {
    const cb = document.querySelector(`#dashboardTasksList [data-task-id="${taskIdMatch[1]}"]`);
    cb.dispatchEvent(new window.Event('click', { bubbles: true }));
    const afterToggleHtml = document.getElementById('dashboardTasksList').innerHTML;
    check('Toggling a task from the dashboard mini-list removes it from the open list', !afterToggleHtml.includes('Finish the lab report'));
  }

  // ---- Alarms -> Dashboard sync ----
  window.switchView('alarm');
  document.getElementById('alarmTimeInput').value = '09:15';
  window.setAlarm();
  window.switchView('dashboard');
  const dashAlarmsHtml = document.getElementById('dashboardAlarmsList').innerHTML;
  check('Newly set alarm appears in the dashboard alarm list', dashAlarmsHtml.includes('09:15'));

  // ---- Stream: room list rendering ----
  window.switchView('stream');
  const roomListReRequested = fakeSocket.emittedLog.filter(e => e.event === 'rooms:requestList').length >= 2;
  check('Switching to Stream re-requests the room list', roomListReRequested);

  const mockRoomsList = [
    { id: 'room-1', name: 'Silent Study Hall', description: 'Quiet room', category: 'Deep Focus', visibility: 'public', hasPassword: false, capacity: 30, count: 2, isSeed: true, createdAt: Date.now() },
    { id: 'room-2', name: 'Secret Club', description: 'Private room', category: 'General', visibility: 'private', hasPassword: true, capacity: 5, count: 1, isSeed: false, createdAt: Date.now() }
  ];
  fakeSocket.trigger('rooms:list', mockRoomsList);
  const roomsContainerHtml = document.getElementById('roomsContainer').innerHTML;
  check('Stream browse pane renders rooms received from the server', roomsContainerHtml.includes('Silent Study Hall') && roomsContainerHtml.includes('Secret Club'));
  check('Private room shows a lock icon', /Secret Club[\s\S]*bi-lock-fill|bi-lock-fill[\s\S]*Secret Club/.test(roomsContainerHtml));

  // ---- Favourites tab ----
  window.toggleFavourite('room-1');
  window.switchStreamTab('favourites');
  const favHtml = document.getElementById('favouriteRoomsContainer').innerHTML;
  check('Favouriting a room makes it appear under the Favourites tab', favHtml.includes('Silent Study Hall'));
  check('Non-favourited room does not appear under Favourites', !favHtml.includes('Secret Club'));
  window.switchStreamTab('browse');

  // ---- Create room -> enter room -> local media ----
  window.createRoom({ name: 'My New Room', description: 'desc', category: 'STEM', visibility: 'public', capacity: 6 });
  const createCall = fakeSocket.emittedLog.find(e => e.event === 'rooms:create');
  check('createRoom() emits rooms:create with the right payload', createCall && createCall.payload.name === 'My New Room', createCall && createCall.payload);

  const mockRoom = {
    id: 'room-new', name: 'My New Room', description: 'desc', category: 'STEM', visibility: 'public',
    capacity: 6, hostId: 'me', isSeed: false, createdAt: Date.now(),
    participants: {
      me: { id: 'me', name: 'Tester', avatarColor: '#8b5cf6', joinedAt: Date.now(), isHost: true, media: { video: true, audio: true } },
      'other-1': { id: 'other-1', name: 'Other Person', avatarColor: '#3b82f6', joinedAt: Date.now(), isHost: false, media: { video: true, audio: true } }
    },
    chat: [{ id: 'm1', system: true, text: 'My New Room created', ts: Date.now() }],
    focusEndsAt: null, focusMinutes: null
  };
  // The real getProfile() id won't be "me" — patch mockRoom to use the
  // actual generated profile id so enterRoom's "everyone but me" filter
  // behaves exactly as it would against a real server response.
  const myRealId = window.getProfile().id;
  mockRoom.hostId = myRealId;
  mockRoom.participants[myRealId] = { ...mockRoom.participants.me, id: myRealId, isHost: true };
  delete mockRoom.participants.me;

  createCall.payload && fakeSocket.lastAcks['rooms:create']({ ok: true, room: mockRoom });
  await new Promise(r => setTimeout(r, 50)); // let enterRoom's initLocalMedia() promise chain resolve

  check('Joining a room switches the view to room-detail', !document.getElementById('view-room-detail').classList.contains('hidden'));
  check('Room name renders in room-detail header', document.getElementById('roomDetailName').textContent === 'My New Room');

  const localTile = document.querySelector(`.video-tile[data-user-id="${myRealId}"]`);
  check('Local video tile is created after joining (getUserMedia mock resolved)', !!localTile);

  const callToOther = fakeSocket.emittedLog.find(e => e.event === 'webrtc:signal' && e.payload.toUserId === 'other-1' && e.payload.data.type === 'offer');
  check('Client auto-calls the existing other participant on join (sends an offer)', !!callToOther, callToOther && callToOther.payload);
  check('A real RTCPeerConnection was created for that call', createdPeerConnections.length >= 1);

  // ---- Incoming call from a second peer (simulates someone else joining) ----
  fakeSocket.trigger('webrtc:signal', { fromUserId: 'newcomer-1', data: { type: 'offer', sdp: 'incoming-fake-sdp' } });
  await new Promise(r => setTimeout(r, 50));
  const answerSent = fakeSocket.emittedLog.find(e => e.event === 'webrtc:signal' && e.payload.toUserId === 'newcomer-1' && e.payload.data.type === 'answer');
  check('Receiving an offer from a new participant results in an answer being sent back', !!answerSent);

  // ---- Chat ----
  fakeSocket.trigger('room:state', mockRoom); // resync so currentRoomState.chat exists
  document.getElementById('roomChatInput').value = 'hello room';
  document.getElementById('roomChatForm').dispatchEvent(new window.Event('submit', { cancelable: true }));
  const chatSendCall = fakeSocket.emittedLog.find(e => e.event === 'chat:send' && e.payload.text === 'hello room');
  check('Sending a chat message emits chat:send with the typed text', !!chatSendCall);

  fakeSocket.trigger('chat:message', { roomId: mockRoom.id, message: { id: 'm2', senderId: 'other-1', senderName: 'Other Person', text: 'hi there', ts: Date.now() } });
  const chatHtml = document.getElementById('roomChatMessages').innerHTML;
  check('Incoming chat message renders in the chat pane', chatHtml.includes('hi there') && chatHtml.includes('Other Person'));

  // ---- Mic/cam toggles ----
  const activeStream = createdFakeStreams[createdFakeStreams.length - 1];
  window.toggleMic();
  const micStateCall = fakeSocket.emittedLog.find(e => e.event === 'webrtc:media-state' && e.payload.audio === false);
  check('Toggling mic off emits the correct media-state to the server', !!micStateCall);
  check('Local audio track disabled after mic toggle', activeStream.getAudioTracks()[0].enabled === false);
  window.toggleMic(); // back on

  window.toggleCam();
  check('Local video track disabled after camera toggle', activeStream.getVideoTracks()[0].enabled === false);
  window.toggleCam();

  // ---- Participant leaving tears down their peer connection ----
  fakeSocket.trigger('room:participantLeft', { roomId: mockRoom.id, userId: 'other-1' });
  const tileAfterLeave = document.querySelector(`.video-tile[data-user-id="other-1"]`);
  check('Departed participant\'s video tile is removed', !tileAfterLeave);

  // ---- Leave room cleanup ----
  window.leaveRoom();
  const leaveCall = fakeSocket.emittedLog.find(e => e.event === 'rooms:leave');
  check('Leaving the room emits rooms:leave', !!leaveCall);
  check('View returns to Stream after leaving', !document.getElementById('view-stream').classList.contains('hidden'));
  check('Video grid is cleared after leaving', document.getElementById('videoGrid').innerHTML === '');
  check('Local media tracks are stopped after leaving', activeStream.getTracks().every(t => t.stopped === true));

  // ---- Friends tab still works ----
  window.switchView('friends');
  check('Friends tab renders without throwing', document.getElementById('friendsListContainer') !== null);

  // ---- Final error check ----
  check('No uncaught errors anywhere during the whole run', windowErrors.length === 0, windowErrors);

  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length) {
    console.log('FAILED:', failed.map(f => f.label));
    process.exitCode = 1;
  }
  process.exit(process.exitCode || 0);
}

main().catch(err => {
  console.error('Test crashed:', err);
  process.exit(1);
});
