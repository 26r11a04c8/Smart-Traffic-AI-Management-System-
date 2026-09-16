const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const results = [];
function check(label, cond, extra) {
  results.push({ label, ok: !!cond, extra });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra !== undefined ? '  (' + JSON.stringify(extra) + ')' : ''}`);
}

const PUB = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8')
  .replace(/<script[^>]*src=[^>]*><\/script>\s*/g, '');

const dom = new JSDOM(html, { url: 'http://localhost:3000/', pretendToBeVisual: true, runScripts: 'outside-only' });
const window = dom.window;
const document = window.document;

window.THREE = {
  Scene: function () { this.add = () => {}; },
  PerspectiveCamera: function () { this.position = { x: 0, y: 0, z: 0 }; },
  WebGLRenderer: function () { return { setSize(){}, setPixelRatio(){}, domElement: document.createElement('canvas'), render(){} }; },
  BufferGeometry: function () { this.setAttribute = () => {}; },
  BufferAttribute: function () {}, PointsMaterial: function () {},
  Points: function () { this.rotation = { z: 0 }; },
  Color: function () { this.r = 1; this.g = 1; this.b = 1; },
  AdditiveBlending: 1
};
window.navigator.geolocation = { getCurrentPosition: (ok, fail) => fail() };
window.navigator.clipboard = { writeText: () => Promise.resolve() };
window.bootstrap = { Modal: { getOrCreateInstance: () => ({ show(){}, hide(){} }), getInstance: () => ({ show(){}, hide(){} }) } };
window.navigator.mediaDevices = { getUserMedia: () => Promise.reject(new Error('no camera in test env')) };
window.RTCPeerConnection = function () { this.addTrack = () => {}; this.close = () => {}; };
class FakeSocket {
  constructor() { this.listeners = {}; this.emittedLog = []; this.lastAcks = {}; }
  on(e, cb) { (this.listeners[e] = this.listeners[e] || []).push(cb); }
  emit(e, p, ack) { this.emittedLog.push({ event: e, payload: p }); if (typeof ack === 'function') this.lastAcks[e] = ack; }
  trigger(e, p) { (this.listeners[e] || []).forEach(cb => cb(p)); }
}
const fakeSocket = new FakeSocket();
window.io = () => fakeSocket;

const windowErrors = [];
window.onerror = (msg) => windowErrors.push(msg);

const jsOrder = [
  'utils.js', 'storage.js', 'profile.js', 'background.js', 'navigation.js',
  'header.js', 'tasks.js', 'alarms.js', 'dashboard.js', 'pomodoro.js',
  'notes.js', 'friends.js', 'webrtc.js', 'rooms.js', 'app.js'
];
const combinedSrc = jsOrder.map(f => fs.readFileSync(path.join(PUB, 'js', f), 'utf8')).join('\n;\n');
window.eval(combinedSrc);
check('Combined bundle has no duplicate-declaration SyntaxError or other load-time throw', windowErrors.length === 0, windowErrors);

function waitForDomContentLoaded() {
  return new Promise((resolve) => {
    if (document.readyState !== 'loading') { resolve(); return; }
    document.addEventListener('DOMContentLoaded', resolve, { once: true });
  });
}

async function main() {
  await waitForDomContentLoaded();
  fakeSocket.trigger('connect');

  // ---- getUserMedia rejection is handled gracefully (no camera in CI, permission denied, etc.) ----
  window.createRoom({ name: 'No Camera Room', visibility: 'public', capacity: 4 });
  const createCall = fakeSocket.emittedLog.find(e => e.event === 'rooms:create');
  const myId = window.getProfile().id;
  const mockRoom = {
    id: 'room-nocam', name: 'No Camera Room', description: '', category: 'General', visibility: 'public',
    capacity: 4, hostId: myId, isSeed: false, createdAt: Date.now(),
    participants: { [myId]: { id: myId, name: 'Tester', avatarColor: '#111', joinedAt: Date.now(), isHost: true, media: { video: true, audio: true } } },
    chat: [], focusEndsAt: null, focusMinutes: null
  };
  fakeSocket.lastAcks['rooms:create']({ ok: true, room: mockRoom });
  await new Promise(r => setTimeout(r, 80));
  check('Room join still succeeds when getUserMedia rejects (no camera/permission denied)',
    !document.getElementById('view-room-detail').classList.contains('hidden'));
  check('No uncaught error surfaces from the rejected getUserMedia', windowErrors.length === 0, windowErrors);
  window.leaveRoom();

  // ---- Notes: persists and debounces ----
  window.switchView('notes');
  const notesArea = document.getElementById('notesTextarea');
  notesArea.value = 'Remember to review chapter 4';
  notesArea.dispatchEvent(new window.Event('input'));
  await new Promise(r => setTimeout(r, 700)); // past the 500ms debounce
  const savedNotes = JSON.parse(window.localStorage.getItem('studyhub_notes'));
  check('Notes autosave to localStorage after the debounce window', savedNotes === 'Remember to review chapter 4', savedNotes);
  const statusText = document.getElementById('notesStatus').textContent;
  check('Notes status shows a "Saved" confirmation', /Saved/.test(statusText), statusText);

  // ---- XSS escaping: task text ----
  window.switchView('tasks');
  document.getElementById('newTaskInput').value = '<img src=x onerror=alert(1)>';
  window.addTask({ preventDefault() {} });
  const taskHtml = document.getElementById('taskListContainer').innerHTML;
  check('Task text with HTML is escaped, not rendered as a live tag', !taskHtml.includes('<img src=x') && taskHtml.includes('&lt;img'));

  // ---- XSS escaping: room chat message ----
  window.switchView('stream');
  window.createRoom({ name: '<b>Bold Room</b>', visibility: 'public', capacity: 4 });
  const secondCreateCall = fakeSocket.emittedLog.filter(e => e.event === 'rooms:create').pop();
  const xssRoom = {
    id: 'room-xss', name: '<b>Bold Room</b>', description: '<i>desc</i>', category: 'General', visibility: 'public',
    capacity: 4, hostId: myId, isSeed: false, createdAt: Date.now(),
    participants: { [myId]: { id: myId, name: 'Tester', avatarColor: '#111', joinedAt: Date.now(), isHost: true, media: { video: true, audio: true } } },
    chat: [], focusEndsAt: null, focusMinutes: null
  };
  fakeSocket.lastAcks['rooms:create']({ ok: true, room: xssRoom });
  await new Promise(r => setTimeout(r, 80));
  const nameHeaderHtml = document.getElementById('roomDetailName').innerHTML;
  // roomDetailName uses .textContent in rooms.js (not innerHTML), which is
  // inherently XSS-safe regardless of escaping — confirm that's really how
  // it's set rather than relying on escapeHtml for this particular field.
  check('Room name in the detail header is set via textContent (inherently safe) or properly escaped',
    document.getElementById('roomDetailName').textContent === '<b>Bold Room</b>');

  fakeSocket.trigger('chat:message', {
    roomId: 'room-xss',
    message: { id: 'x1', senderId: 'other-1', senderName: '<script>evil</script>', text: '<script>alert(1)</script>', ts: Date.now() }
  });
  const chatHtml = document.getElementById('roomChatMessages').innerHTML;
  check('Chat sender name with HTML is escaped', !chatHtml.includes('<script>evil'));
  check('Chat message text with HTML is escaped', !chatHtml.includes('<script>alert(1)</script>') && chatHtml.includes('&lt;script&gt;'));

  // ---- Room card rendering also escapes room name/description ----
  fakeSocket.trigger('rooms:list', [
    { id: 'room-xss2', name: '<svg onload=alert(1)>', description: 'x', category: 'General', visibility: 'public', hasPassword: false, capacity: 5, count: 0, isSeed: false, createdAt: Date.now() }
  ]);
  const roomsHtml = document.getElementById('roomsContainer').innerHTML;
  check('Room card name is escaped in the Stream browse list', !roomsHtml.includes('<svg onload'));

  console.log(`\n${results.filter(r => r.ok).length}/${results.length} checks passed.`);
  const failed = results.filter(r => !r.ok);
  if (failed.length) { console.log('FAILED:', failed.map(f => f.label)); process.exitCode = 1; }
  process.exit(process.exitCode || 0);
}

main().catch(err => { console.error('Test crashed:', err); process.exit(1); });
