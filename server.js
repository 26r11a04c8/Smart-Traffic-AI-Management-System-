// ==========================================
// STUDYHUB SERVER
// Serves the static frontend (public/) and owns the real-time state that
// rooms need: who's in which room, chat history, the focus timer, and
// relaying WebRTC offer/answer/ICE-candidate messages so two browsers can
// set up a direct peer-to-peer camera/mic call with each other.
//
// State lives in memory in this single Node process. That's genuinely
// fine for a small deployment (one instance) — it's what makes this
// simple to run and deploy with zero external dependencies (no database,
// no Redis). Running more than one instance behind a load balancer would
// need shared state (e.g. the Socket.IO Redis adapter) since two
// instances wouldn't otherwise see each other's rooms; that's future
// scaling work, not needed to run this for real today.
//
// There's still no real user authentication — a "user" is just an id the
// browser generates for itself and remembers in localStorage (see
// js/profile.js). Room passwords, however, ARE now handled properly:
// hashed server-side with a per-room salt via Node's crypto, and the
// hash never leaves the server, unlike the previous localStorage-only
// version where the "hash" was computed client-side and readable via
// devtools by design (documented there as an intentional, mild
// deterrent). This is a real improvement, though it's still not a
// substitute for real accounts if that's ever needed.
// ==========================================

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const ROOM_DISCONNECT_GRACE_MS = 10 * 1000;  // tolerate brief refreshes/network blips before removing someone
const EMPTY_ROOM_TTL_MS = 60 * 60 * 1000;    // empty user-created rooms are cleared after an hour
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const MAX_CHAT_HISTORY = 100;

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const io = new Server(server);

// ---- helpers ----

function generateId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored) return false;
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const check = crypto.scryptSync(String(password || ''), salt, 64).toString('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(check, 'hex'));
  } catch {
    return false;
  }
}

// ---- in-memory state ----

// Object.create(null) rather than {} — rooms are looked up by an id the
// client controls (room codes, join-by-code input), and a plain {} object
// resolves special keys like "__proto__" or "constructor" through the
// prototype chain instead of treating them as simply absent. A
// null-prototype object has no chain to fall through, so `rooms[anything
// a client sends]` is always either a real room or plain `undefined`.
const rooms = Object.create(null);
const userSockets = new Map();     // userId -> current socket.id
const userProfiles = new Map();    // userId -> { name, avatarColor }
const disconnectTimers = new Map(); // userId -> Timeout

function seedRooms() {
  const seedList = [
    { name: 'Silent Study Hall', category: 'Deep Focus', description: 'Cameras optional. Heads down, mics muted.', capacity: 30 },
    { name: 'Math & Physics Lounge', category: 'STEM', description: 'Work through problem sets together.', capacity: 20 },
    { name: 'Language Exchange', category: 'Languages', description: 'Practice conversation with fellow learners.', capacity: 15 },
    { name: 'Late Night Grind', category: 'Deep Focus', description: 'For the night owls powering through deadlines.', capacity: 25 },
    { name: 'Exam Crunch Room', category: 'Revision', description: 'Quiz each other and share flashcards.', capacity: 20 }
  ];
  seedList.forEach(r => {
    const id = generateId();
    rooms[id] = {
      id,
      name: r.name,
      description: r.description,
      category: r.category,
      visibility: 'public',
      passwordHash: null,
      capacity: r.capacity,
      hostId: null,
      isSeed: true,
      createdAt: Date.now(),
      participants: {},
      chat: [{ id: generateId(), system: true, text: `Welcome to ${r.name}!`, ts: Date.now() }],
      focusEndsAt: null,
      focusMinutes: null,
      emptySince: null
    };
  });
}
seedRooms();

function publicRoomSummary(room) {
  return {
    id: room.id,
    name: room.name,
    description: room.description,
    category: room.category,
    visibility: room.visibility,
    hasPassword: !!room.passwordHash,
    capacity: room.capacity,
    count: Object.keys(room.participants).length,
    isSeed: room.isSeed,
    createdAt: room.createdAt
  };
}

// Never send the password hash (or internal bookkeeping like emptySince)
// to clients.
function fullRoomView(room) {
  const { passwordHash, emptySince, ...rest } = room;
  return rest;
}

function broadcastRoomsList() {
  const list = Object.values(rooms).sort((a, b) => b.createdAt - a.createdAt).map(publicRoomSummary);
  io.emit('rooms:list', list);
}

function broadcastRoomState(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  io.to(`room:${roomId}`).emit('room:state', fullRoomView(room));
}

function reassignHostIfNeeded(room) {
  if (room.hostId && room.participants[room.hostId]) return;
  const remaining = Object.keys(room.participants);
  room.hostId = remaining[0] || null;
  remaining.forEach((pid, i) => { room.participants[pid].isHost = i === 0; });
}

function removeParticipant(roomId, userId) {
  const room = rooms[roomId];
  if (!room || !room.participants[userId]) return;

  const leavingName = room.participants[userId].name;
  delete room.participants[userId];
  reassignHostIfNeeded(room);

  if (Object.keys(room.participants).length === 0 && !room.isSeed) {
    room.emptySince = Date.now();
  }

  room.chat = room.chat || [];
  room.chat.push({ id: generateId(), system: true, text: `${leavingName} left`, ts: Date.now() });
  if (room.chat.length > MAX_CHAT_HISTORY) room.chat = room.chat.slice(-MAX_CHAT_HISTORY);

  io.to(`room:${roomId}`).emit('room:participantLeft', { roomId, userId });
  broadcastRoomState(roomId);
  broadcastRoomsList();
}

function sweepEmptyRooms() {
  try {
    let changed = false;
    Object.keys(rooms).forEach(id => {
      const room = rooms[id];
      if (!room.isSeed && room.emptySince && Date.now() - room.emptySince > EMPTY_ROOM_TTL_MS) {
        delete rooms[id];
        changed = true;
      }
    });
    if (changed) broadcastRoomsList();
  } catch (err) {
    console.error('Error during empty-room sweep:', err);
  }
}
setInterval(sweepEmptyRooms, SWEEP_INTERVAL_MS).unref();

// ---- socket handling ----

// `({ roomId } = {}) => {...}`-style destructuring defaults only cover an
// *omitted* argument — a client that explicitly sends `null` (or a
// string, number, array...) skips the default entirely and crashes the
// destructuring immediately, taking the whole process down since this is
// a single shared server. safeOn() normalizes any non-plain-object
// payload to `{}` before the handler runs, and also catches any other
// unexpected exception inside the handler itself, so one malformed or
// hostile message from one client can never affect anyone else's
// connection or room state.
function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function safeOn(socket, event, handler) {
  socket.on(event, (payload, ack) => {
    const safeAck = typeof ack === 'function' ? ack : undefined;
    try {
      handler(safeObject(payload), safeAck);
    } catch (err) {
      console.error(`Error handling "${event}" from ${socket.id}:`, err);
      if (safeAck) safeAck({ ok: false, error: 'Something went wrong on the server' });
    }
  });
}

io.on('connection', (socket) => {
  safeOn(socket, 'identify', (payload) => {
    const userId = typeof payload.userId === 'string' ? payload.userId : null;
    if (!userId) return;
    socket.data.userId = userId;
    userSockets.set(userId, socket.id);
    userProfiles.set(userId, {
      name: (payload.name || 'Guest').toString().slice(0, 24),
      avatarColor: typeof payload.avatarColor === 'string' ? payload.avatarColor : '#8b5cf6'
    });

    const pending = disconnectTimers.get(userId);
    if (pending) { clearTimeout(pending); disconnectTimers.delete(userId); }

    // If this user is already a participant somewhere (e.g. reconnecting
    // after a refresh), rejoin the Socket.IO room and refresh their
    // displayed name/colour + everyone's view of the room.
    Object.values(rooms).forEach(room => {
      if (room.participants[userId]) {
        room.participants[userId].name = userProfiles.get(userId).name;
        room.participants[userId].avatarColor = userProfiles.get(userId).avatarColor;
        socket.join(`room:${room.id}`);
        broadcastRoomState(room.id);
      }
    });
  });

  socket.on('rooms:requestList', () => {
    socket.emit('rooms:list', Object.values(rooms).sort((a, b) => b.createdAt - a.createdAt).map(publicRoomSummary));
  });

  safeOn(socket, 'rooms:create', (payload, ack) => {
    const userId = socket.data.userId;
    if (!userId) return ack?.({ ok: false, error: 'Not connected yet — try again.' });

    const profile = userProfiles.get(userId) || { name: 'Guest', avatarColor: '#8b5cf6' };
    const name = (typeof payload.name === 'string' ? payload.name : '').trim().slice(0, 60);
    if (!name) return ack?.({ ok: false, error: 'Room needs a name' });

    const id = generateId();
    const visibility = payload.visibility === 'private' ? 'private' : 'public';
    const room = {
      id,
      name,
      description: (typeof payload.description === 'string' ? payload.description : '').trim().slice(0, 160),
      category: typeof payload.category === 'string' && payload.category ? payload.category.slice(0, 40) : 'General',
      visibility,
      passwordHash: visibility === 'private' && payload.password ? hashPassword(payload.password) : null,
      capacity: Math.min(Math.max(parseInt(payload.capacity, 10) || 8, 2), 50),
      hostId: userId,
      isSeed: false,
      createdAt: Date.now(),
      participants: {
        [userId]: { id: userId, name: profile.name, avatarColor: profile.avatarColor, joinedAt: Date.now(), isHost: true, media: { video: true, audio: true } }
      },
      chat: [{ id: generateId(), system: true, text: `${profile.name} created the room`, ts: Date.now() }],
      focusEndsAt: null,
      focusMinutes: null,
      emptySince: null
    };
    rooms[id] = room;
    socket.join(`room:${id}`);
    broadcastRoomsList();
    ack?.({ ok: true, room: fullRoomView(room) });
  });

  safeOn(socket, 'rooms:join', (payload, ack) => {
    const userId = socket.data.userId;
    if (!userId) return ack?.({ ok: false, error: 'Not connected yet — try again.' });

    const roomId = typeof payload.roomId === 'string' ? payload.roomId : '';
    const password = typeof payload.password === 'string' ? payload.password : '';
    const room = rooms[roomId];
    if (!room) return ack?.({ ok: false, error: 'That room no longer exists' });

    const alreadyIn = !!room.participants[userId];
    if (room.visibility === 'private' && room.passwordHash && !alreadyIn && !verifyPassword(password, room.passwordHash)) {
      return ack?.({ ok: false, error: 'Incorrect room password' });
    }
    if (!alreadyIn && Object.keys(room.participants).length >= room.capacity) {
      return ack?.({ ok: false, error: 'That room is full' });
    }

    const profile = userProfiles.get(userId) || { name: 'Guest', avatarColor: '#8b5cf6' };
    room.participants[userId] = {
      id: userId,
      name: profile.name,
      avatarColor: profile.avatarColor,
      joinedAt: room.participants[userId]?.joinedAt || Date.now(),
      isHost: room.hostId === userId,
      media: { video: true, audio: true }
    };
    if (!room.hostId) { room.hostId = userId; room.participants[userId].isHost = true; }
    room.emptySince = null;

    if (!alreadyIn) {
      room.chat = room.chat || [];
      room.chat.push({ id: generateId(), system: true, text: `${profile.name} joined`, ts: Date.now() });
      if (room.chat.length > MAX_CHAT_HISTORY) room.chat = room.chat.slice(-MAX_CHAT_HISTORY);
    }

    socket.join(`room:${roomId}`);
    broadcastRoomState(roomId);
    broadcastRoomsList();
    ack?.({ ok: true, room: fullRoomView(room) });
  });

  safeOn(socket, 'rooms:leave', (payload) => {
    const userId = socket.data.userId;
    const roomId = typeof payload.roomId === 'string' ? payload.roomId : '';
    if (!userId || !rooms[roomId] || !rooms[roomId].participants[userId]) return;
    socket.leave(`room:${roomId}`);
    removeParticipant(roomId, userId);
  });

  safeOn(socket, 'rooms:close', (payload, ack) => {
    const userId = socket.data.userId;
    const roomId = typeof payload.roomId === 'string' ? payload.roomId : '';
    const room = rooms[roomId];
    if (!room) return ack?.({ ok: false, error: 'Room not found' });
    if (room.hostId !== userId) return ack?.({ ok: false, error: 'Only the host can close this room' });

    io.to(`room:${roomId}`).emit('room:closed', { roomId });
    io.in(`room:${roomId}`).socketsLeave(`room:${roomId}`);
    delete rooms[roomId];
    broadcastRoomsList();
    ack?.({ ok: true });
  });

  safeOn(socket, 'chat:send', (payload) => {
    const userId = socket.data.userId;
    const roomId = typeof payload.roomId === 'string' ? payload.roomId : '';
    const room = rooms[roomId];
    const rawText = typeof payload.text === 'string' ? payload.text : '';
    const trimmed = rawText.trim().slice(0, 500);
    if (!userId || !room || !room.participants[userId] || !trimmed) return;

    const profile = userProfiles.get(userId);
    const message = { id: generateId(), senderId: userId, senderName: profile?.name || 'Guest', text: trimmed, ts: Date.now() };
    room.chat = room.chat || [];
    room.chat.push(message);
    if (room.chat.length > MAX_CHAT_HISTORY) room.chat = room.chat.slice(-MAX_CHAT_HISTORY);
    io.to(`room:${roomId}`).emit('chat:message', { roomId, message });
  });

  safeOn(socket, 'focus:start', (payload) => {
    const userId = socket.data.userId;
    const roomId = typeof payload.roomId === 'string' ? payload.roomId : '';
    const room = rooms[roomId];
    if (!userId || !room || room.hostId !== userId) return;
    const mins = Math.min(180, Math.max(1, parseInt(payload.minutes, 10) || 25));
    room.focusMinutes = mins;
    room.focusEndsAt = Date.now() + mins * 60000;
    broadcastRoomState(roomId);
  });

  // WebRTC signaling relay: the server never looks at (or needs to
  // understand) the SDP/ICE payload, it just forwards it to the intended
  // recipient's current socket. The actual audio/video stream never
  // passes through the server.
  safeOn(socket, 'webrtc:signal', (payload) => {
    const fromUserId = socket.data.userId;
    const roomId = typeof payload.roomId === 'string' ? payload.roomId : '';
    const toUserId = typeof payload.toUserId === 'string' ? payload.toUserId : '';
    const room = rooms[roomId];
    if (!fromUserId || !room || !room.participants[toUserId] || !room.participants[fromUserId]) return;
    const targetSocketId = userSockets.get(toUserId);
    if (targetSocketId) io.to(targetSocketId).emit('webrtc:signal', { roomId, fromUserId, data: payload.data });
  });

  safeOn(socket, 'webrtc:media-state', (payload) => {
    const userId = socket.data.userId;
    const roomId = typeof payload.roomId === 'string' ? payload.roomId : '';
    const room = rooms[roomId];
    if (!userId || !room || !room.participants[userId]) return;
    room.participants[userId].media = { video: !!payload.video, audio: !!payload.audio };
    broadcastRoomState(roomId);
  });

  socket.on('disconnect', () => {
    const userId = socket.data.userId;
    if (!userId) return;
    if (userSockets.get(userId) !== socket.id) return; // a newer connection already replaced this one

    userSockets.delete(userId);
    const timer = setTimeout(() => {
      disconnectTimers.delete(userId);
      try {
        Object.keys(rooms).forEach(roomId => {
          if (rooms[roomId]?.participants[userId]) removeParticipant(roomId, userId);
        });
      } catch (err) {
        console.error('Error during disconnect cleanup:', err);
      }
    }, ROOM_DISCONNECT_GRACE_MS);
    timer.unref();
    disconnectTimers.set(userId, timer);
  });
});

server.listen(PORT, () => {
  console.log(`StudyHub server running on http://localhost:${PORT}`);
});
