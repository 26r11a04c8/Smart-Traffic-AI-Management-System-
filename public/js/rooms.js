// ==========================================
// ROOMS
// Public & private study rooms with join codes, live presence, group
// chat, a synced focus timer, and (new) camera/mic calling — all under
// the "Stream" section now (Favourites is a tab inside it, not its own
// sidebar entry).
//
// This used to fake "real time" with localStorage + the browser's native
// `storage` event, which only ever worked between tabs on the same
// browser. It's now backed by a real Socket.IO connection to server.js,
// so two different people on two different devices genuinely share a
// room — which is also what makes the camera/mic feature in js/webrtc.js
// possible at all (WebRTC call setup needs a real channel to exchange
// connection info over; localStorage can't reach another device).
// ==========================================

let socket = null;
let currentRoomId = null;
let currentRoomState = null;       // full room object from the server, only while inside a room
let publicRoomsCache = [];         // list of room summaries for the Stream browse/favourites views
let roomsSearchQuery = '';
let streamActiveTab = 'browse';
let focusTickTimer = null;

// ---- socket bootstrap ----

function initRoomsSocket() {
  if (typeof io !== 'function') {
    // The page was opened directly (file://) or the server isn't
    // running, so the Socket.IO client script never loaded. The rest of
    // the app (tasks, notes, alarms, Pomodoro) still works fine without
    // it — only Stream needs a live server.
    showToast('Live rooms need the app server running (see README: npm start). Everything else still works.', 'error', 8000);
    return null;
  }

  const s = io();

  s.on('connect', () => {
    identifyToServer();
    s.emit('rooms:requestList');
    const lastRoomId = loadJSON(STORAGE_KEYS.LAST_ROOM, null);
    if (lastRoomId && !currentRoomId) attemptAutoRejoin(lastRoomId);
  });

  s.on('rooms:list', (list) => {
    publicRoomsCache = list;
    renderRoomLists();
  });

  s.on('room:state', (room) => {
    if (room.id !== currentRoomId) return;
    currentRoomState = room;
    renderRoomDetail();
  });

  s.on('chat:message', ({ roomId, message }) => {
    if (roomId !== currentRoomId || !currentRoomState) return;
    currentRoomState.chat = currentRoomState.chat || [];
    currentRoomState.chat.push(message);
    renderChatOnly();
  });

  s.on('room:participantLeft', ({ roomId, userId }) => {
    if (roomId !== currentRoomId) return;
    closePeer(userId);
  });

  s.on('room:closed', ({ roomId }) => {
    if (roomId !== currentRoomId) return;
    showToast('This room was closed by its host', 'info');
    exitRoomLocally();
  });

  s.on('webrtc:signal', ({ fromUserId, data }) => {
    handleSignal(fromUserId, data);
  });

  s.on('disconnect', () => {
    if (currentRoomId) showToast('Lost connection to the server — trying to reconnect…', 'error');
  });

  return s;
}

function identifyToServer() {
  if (!socket) return;
  const me = getProfile();
  socket.emit('identify', { userId: me.id, name: me.name, avatarColor: me.avatarColor });
}

function attemptAutoRejoin(roomId) {
  socket.emit('rooms:join', { roomId }, (res) => {
    if (res?.ok) enterRoom(res.room);
    else saveJSON(STORAGE_KEYS.LAST_ROOM, null);
  });
}

// ---- CRUD (all via socket, ack-based) ----

function createRoom({ name, description, category, visibility, password, capacity }) {
  if (!socket) { showToast('Not connected to the server', 'error'); return; }
  if (!name || !name.trim()) { showToast('Give the room a name', 'error'); return; }

  socket.emit('rooms:create', { name, description, category, visibility, password, capacity }, (res) => {
    if (!res?.ok) { showToast(res?.error || 'Could not create room', 'error'); return; }
    showToast(`Room "${res.room.name}" created`, 'success');
    enterRoom(res.room);
  });
}

function joinRoom(roomId, passwordAttempt) {
  if (!socket) { showToast('Not connected to the server', 'error'); return; }
  socket.emit('rooms:join', { roomId, password: passwordAttempt }, (res) => {
    if (!res?.ok) { showToast(res?.error || 'Could not join room', 'error'); return; }
    enterRoom(res.room);
  });
}

function enterRoom(room) {
  currentRoomId = room.id;
  currentRoomState = room;
  saveJSON(STORAGE_KEYS.LAST_ROOM, room.id);
  switchView('room-detail');
  renderRoomDetail();

  const myId = getProfile().id;
  initLocalMedia().then(() => {
    startCallsForExistingParticipants(Object.keys(room.participants).filter(id => id !== myId));
  });
}

function leaveRoom() {
  if (!currentRoomId) return;
  socket?.emit('rooms:leave', { roomId: currentRoomId });
  exitRoomLocally();
  showToast('You left the room');
}

function closeRoom() {
  if (!currentRoomId) return;
  socket?.emit('rooms:close', { roomId: currentRoomId }, (res) => {
    if (!res?.ok) showToast(res?.error || 'Could not close room', 'error');
  });
}

function exitRoomLocally() {
  closeAllPeers();
  currentRoomId = null;
  currentRoomState = null;
  saveJSON(STORAGE_KEYS.LAST_ROOM, null);
  switchView('stream');
}

function sendRoomMessage(text) {
  const trimmed = (text || '').trim();
  if (!trimmed || !currentRoomId) return;
  socket?.emit('chat:send', { roomId: currentRoomId, text: trimmed.slice(0, 500) });
}

function toggleFavourite(roomId) {
  const favs = loadJSON(STORAGE_KEYS.FAVOURITES, []);
  const idx = favs.indexOf(roomId);
  if (idx >= 0) favs.splice(idx, 1);
  else favs.push(roomId);
  saveJSON(STORAGE_KEYS.FAVOURITES, favs);
  renderRoomLists();
}

function startRoomFocus(minutes) {
  socket?.emit('focus:start', { roomId: currentRoomId, minutes });
}

// ---- rendering: room cards (Stream browse + favourites tabs) ----

function renderRoomCard(room, favs) {
  const isFav = favs.includes(room.id);
  const full = room.count >= room.capacity;
  const lockIcon = room.visibility === 'private' ? '<i class="bi bi-lock-fill small text-secondary ms-1"></i>' : '';

  return `
    <div class="col-md-6 col-lg-4">
      <div class="card room-card border-0 h-100 p-3" style="background-color: var(--card-bg);">
        <div class="d-flex justify-content-between align-items-start mb-2">
          <span class="badge bg-secondary-subtle text-light">${escapeHtml(room.category)}</span>
          <button class="btn btn-sm btn-link text-warning p-0" data-action="toggle-fav" data-room-id="${room.id}" aria-label="Toggle favourite">
            <i class="bi ${isFav ? 'bi-star-fill' : 'bi-star'}"></i>
          </button>
        </div>
        <h6 class="fw-bold mb-1">${escapeHtml(room.name)}${lockIcon}</h6>
        <p class="text-secondary small mb-3">${escapeHtml(room.description || '')}</p>
        <div class="d-flex justify-content-between align-items-center mt-auto pt-2">
          <span class="small text-secondary"><i class="bi bi-people-fill me-1"></i>${room.count}/${room.capacity}</span>
          <button class="btn btn-sm ${full ? 'btn-outline-secondary disabled' : 'btn-primary'}" data-action="join-room" data-room-id="${room.id}">
            ${full ? 'Full' : 'Join'}
          </button>
        </div>
      </div>
    </div>
  `;
}

function matchesSearch(room, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  return room.name.toLowerCase().includes(q) || room.category.toLowerCase().includes(q);
}

// The server already pushes 'rooms:list' to everyone whenever anything
// changes, so the cache is normally live on its own. This is a defensive
// refresh for the moment Stream is opened, in case a broadcast was missed
// (e.g. right after a reconnect) — kept separate from renderRoomLists()
// itself, which is also called reactively every time a 'rooms:list'
// broadcast arrives and must never trigger another request itself.
function refreshAndRenderRoomLists() {
  socket?.emit('rooms:requestList');
  renderRoomLists();
}

function renderRoomLists() {
  const favs = loadJSON(STORAGE_KEYS.FAVOURITES, []);
  const rooms = publicRoomsCache;

  const dashboardContainer = document.getElementById('roomsContainer');
  if (dashboardContainer) {
    const visible = rooms.filter(r => matchesSearch(r, roomsSearchQuery));
    dashboardContainer.innerHTML = visible.length
      ? visible.map(r => renderRoomCard(r, favs)).join('')
      : (roomsSearchQuery
        ? `<p class="text-secondary">No rooms match "${escapeHtml(roomsSearchQuery)}".</p>`
        : `<p class="text-secondary">No rooms yet — create one to get started.</p>`);
  }

  const favContainer = document.getElementById('favouriteRoomsContainer');
  if (favContainer) {
    const favRooms = rooms.filter(r => favs.includes(r.id));
    favContainer.innerHTML = favRooms.length
      ? favRooms.map(r => renderRoomCard(r, favs)).join('')
      : `<p class="text-secondary">No favourite rooms yet — tap the star on any room to add it here.</p>`;
  }
}

// ---- rendering: room detail (video, chat, participants, focus timer) ----

function renderRoomDetail() {
  const room = currentRoomState;
  const view = document.getElementById('view-room-detail');
  if (!room || !view) {
    if (currentRoomId) exitRoomLocally();
    return;
  }
  const me = getProfile();
  const isHost = room.hostId === me.id;
  const participantCount = Object.keys(room.participants).length;

  document.getElementById('roomDetailName').textContent = room.name;
  document.getElementById('roomDetailMeta').innerHTML =
    `<span class="badge bg-secondary-subtle text-light me-2">${escapeHtml(room.category)}</span>` +
    `${room.visibility === 'private' ? '<i class="bi bi-lock-fill me-1"></i>Private' : '<i class="bi bi-globe2 me-1"></i>Public'}` +
    ` &middot; ${participantCount}/${room.capacity} here`;
  document.getElementById('roomDetailDescription').textContent = room.description || '';

  document.getElementById('roomInviteWrap').classList.toggle('hidden', room.visibility !== 'private');
  document.getElementById('roomInviteCode').value = room.id;
  document.getElementById('closeRoomBtn').classList.toggle('hidden', !isHost || room.isSeed);

  const participants = Object.values(room.participants).sort((a, b) => (b.isHost ? 1 : 0) - (a.isHost ? 1 : 0));
  document.getElementById('roomParticipantsList').innerHTML = participants.map(p => `
    <div class="d-flex align-items-center gap-2 py-1">
      <span class="participant-dot" style="background:${p.avatarColor}"></span>
      <span class="text-light small">${escapeHtml(p.name)}</span>
      ${p.isHost ? '<i class="bi bi-star-fill text-warning small" title="Host"></i>' : ''}
      ${p.media && p.media.audio === false ? '<i class="bi bi-mic-mute-fill text-secondary small" title="Muted"></i>' : ''}
      ${p.media && p.media.video === false ? '<i class="bi bi-camera-video-off-fill text-secondary small" title="Camera off"></i>' : ''}
    </div>
  `).join('') || '<p class="text-secondary small">No one here yet.</p>';

  renderChatOnly();
  renderFocusTimer(room, isHost);
  syncTileMediaFromRoomState(room);
}

function renderChatOnly() {
  const room = currentRoomState;
  const chatBox = document.getElementById('roomChatMessages');
  if (!room || !chatBox) return;
  const me = getProfile();
  const wasNearBottom = chatBox.scrollTop + chatBox.clientHeight >= chatBox.scrollHeight - 40;
  chatBox.innerHTML = (room.chat || []).map(m => {
    if (m.system) return `<div class="text-secondary small text-center my-1">${escapeHtml(m.text)}</div>`;
    const mine = m.senderId === me.id;
    return `
      <div class="chat-msg ${mine ? 'chat-msg-mine' : ''}">
        <div class="chat-msg-sender">${escapeHtml(m.senderName)}</div>
        <div class="chat-msg-bubble">${escapeHtml(m.text)}</div>
      </div>
    `;
  }).join('');
  if (wasNearBottom) chatBox.scrollTop = chatBox.scrollHeight;
}

function renderFocusTimer(room, isHost) {
  const label = document.getElementById('roomFocusLabel');
  const hostControls = document.getElementById('roomFocusHostControls');
  if (!label || !hostControls) return;
  hostControls.classList.toggle('hidden', !isHost || !!room.focusEndsAt);

  if (room.focusEndsAt) {
    const remaining = Math.max(0, room.focusEndsAt - Date.now());
    if (remaining <= 0) {
      label.textContent = 'Focus session finished';
    } else {
      const m = Math.floor(remaining / 60000).toString().padStart(2, '0');
      const s = Math.floor((remaining % 60000) / 1000).toString().padStart(2, '0');
      label.textContent = `Focus session — ${m}:${s} left`;
    }
  } else {
    label.textContent = isHost ? 'No focus session running' : 'Waiting for the host to start a focus session';
  }
}

// ---- Stream tabs: Browse Rooms / Favourites ----

function switchStreamTab(tab) {
  streamActiveTab = tab;
  document.querySelectorAll('#streamTab .nav-link').forEach(el => el.classList.remove('active'));
  document.querySelector(`#streamTab .nav-link[data-stream-tab="${tab}"]`)?.classList.add('active');
  document.getElementById('streamBrowsePane')?.classList.toggle('hidden', tab !== 'browse');
  document.getElementById('streamFavouritesPane')?.classList.toggle('hidden', tab !== 'favourites');
}

// ---- wiring ----

function initRoomsFeature() {
  socket = initRoomsSocket();

  // Re-identify (and refresh our participant record) whenever the
  // profile name/colour changes.
  document.addEventListener('profile:updated', identifyToServer);

  document.querySelectorAll('#streamTab .nav-link').forEach(link => {
    link.addEventListener('click', () => switchStreamTab(link.dataset.streamTab));
  });

  document.getElementById('roomSearchInput')?.addEventListener('input', (e) => {
    roomsSearchQuery = e.target.value;
    renderRoomLists();
  });

  ['roomsContainer', 'favouriteRoomsContainer'].forEach(containerId => {
    document.getElementById(containerId)?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const roomId = btn.dataset.roomId;
      if (btn.dataset.action === 'toggle-fav') toggleFavourite(roomId);
      if (btn.dataset.action === 'join-room') handleJoinClick(roomId);
    });
  });

  const createForm = document.getElementById('createRoomForm');
  const visibilitySelect = document.getElementById('createRoomVisibility');
  visibilitySelect?.addEventListener('change', () => {
    document.getElementById('createRoomPasswordWrap').classList.toggle('hidden', visibilitySelect.value !== 'private');
  });
  createForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    createRoom({
      name: document.getElementById('createRoomName').value,
      description: document.getElementById('createRoomDescription').value,
      category: document.getElementById('createRoomCategory').value,
      visibility: visibilitySelect.value,
      password: document.getElementById('createRoomPassword').value,
      capacity: document.getElementById('createRoomCapacity').value
    });
    createForm.reset();
    document.getElementById('createRoomPasswordWrap').classList.add('hidden');
    bootstrap.Modal.getInstance(document.getElementById('createRoomModal'))?.hide();
  });

  document.getElementById('joinByCodeForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const code = document.getElementById('joinByCodeInput').value.trim();
    if (code) handleJoinClick(code);
    document.getElementById('joinByCodeInput').value = '';
  });

  let pendingJoinRoomId = null;
  const joinPasswordForm = document.getElementById('joinPasswordForm');
  joinPasswordForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const pwd = document.getElementById('joinPasswordInput').value;
    socket?.emit('rooms:join', { roomId: pendingJoinRoomId, password: pwd }, (res) => {
      if (!res?.ok) { showToast(res?.error || 'Could not join room', 'error'); return; }
      bootstrap.Modal.getInstance(document.getElementById('joinPasswordModal'))?.hide();
      joinPasswordForm.reset();
      enterRoom(res.room);
    });
  });

  function handleJoinClick(roomId) {
    const room = publicRoomsCache.find(r => r.id === roomId);
    if (!room) { showToast('Room not found — check the code and try again', 'error'); return; }
    if (room.visibility === 'private' && room.hasPassword) {
      pendingJoinRoomId = roomId;
      document.getElementById('joinPasswordRoomName').textContent = room.name;
      bootstrap.Modal.getOrCreateInstance(document.getElementById('joinPasswordModal')).show();
    } else {
      joinRoom(roomId);
    }
  }

  document.getElementById('leaveRoomBtn')?.addEventListener('click', leaveRoom);
  document.getElementById('closeRoomBtn')?.addEventListener('click', closeRoom);
  document.getElementById('copyInviteBtn')?.addEventListener('click', () => {
    const inviteInput = document.getElementById('roomInviteCode');
    inviteInput.select();
    navigator.clipboard?.writeText(inviteInput.value).then(
      () => showToast('Invite code copied'),
      () => showToast('Copy this code manually: ' + inviteInput.value)
    );
  });

  const chatForm = document.getElementById('roomChatForm');
  chatForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('roomChatInput');
    sendRoomMessage(input.value);
    input.value = '';
  });

  document.getElementById('startFocusBtn')?.addEventListener('click', () => {
    const minutes = Math.min(180, Math.max(1, parseInt(document.getElementById('focusMinutesInput').value) || 25));
    startRoomFocus(minutes);
  });

  // Live-updating focus countdown label without re-rendering the whole
  // room (chat/participants) every second.
  focusTickTimer = setInterval(() => {
    if (currentRoomId && currentRoomState) {
      renderFocusTimer(currentRoomState, currentRoomState.hostId === getProfile().id);
    }
  }, 1000);
}
