// ==========================================
// CAMERA & MIC (WebRTC)
// Lets everyone in a room see/hear each other, like a small Meet/Zoom
// call, layered on top of the room's Socket.IO connection (see rooms.js
// for `socket`, `currentRoomId`, `currentRoomState`) which is used purely
// to pass along offer/answer/ICE-candidate messages — the actual audio
// and video travel peer-to-peer, not through the server.
//
// Topology: full mesh (every participant connects directly to every
// other). That's simple and fine for a handful of people, but bandwidth
// and CPU cost grow with the square of the participant count, so this
// caps out at MAX_VIDEO_PEERS live video connections — anyone beyond that
// is still fully in the room (chat, focus timer, presence) just without
// an automatic video connection. A production version of this at real
// scale would want an SFU (e.g. mediasoup, LiveKit, Janus) instead of
// mesh. There's also no TURN server configured here, only STUN — most
// networks (including plain home/office wifi) work fine with STUN alone,
// but some restrictive corporate/mobile networks need TURN to connect at
// all; see README for notes on adding one.
// ==========================================

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];
const MAX_VIDEO_PEERS = 8;

let localStream = null;
let micEnabled = true;
let camEnabled = true;
const peerConnections = {}; // remoteUserId -> RTCPeerConnection

function hasMediaSupport() {
  return typeof navigator !== 'undefined' && navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function';
}

async function initLocalMedia() {
  if (!hasMediaSupport()) {
    localStream = null;
    showToast('This browser can\'t access camera/mic here — you can still chat.', 'info');
    renderLocalTile();
    updateMediaButtons();
    return;
  }
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  } catch (err) {
    localStream = null;
    showToast('Camera/mic unavailable (permission denied or none found) — you can still chat.', 'info');
  }
  micEnabled = true;
  camEnabled = true;
  renderLocalTile();
  updateMediaButtons();
}

function stopLocalMedia() {
  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
  }
}

function tileInitials(name) {
  return (name || '?').trim().slice(0, 1).toUpperCase() || '?';
}

function ensureTile(userId, { isLocal = false, name = '', avatarColor = '#8b5cf6' } = {}) {
  const grid = document.getElementById('videoGrid');
  if (!grid) return null;
  let tile = grid.querySelector(`.video-tile[data-user-id="${userId}"]`);
  if (tile) return tile;

  tile = document.createElement('div');
  tile.className = 'video-tile';
  tile.dataset.userId = userId;
  tile.innerHTML = `
    <video ${isLocal ? 'muted' : ''} autoplay playsinline></video>
    <div class="video-tile-placeholder" style="background:${avatarColor}"></div>
    <div class="video-tile-label">
      <i class="bi bi-mic-fill"></i><i class="bi bi-mic-mute-fill"></i>
      <span class="video-tile-name"></span>
    </div>
  `;
  tile.querySelector('.video-tile-placeholder').textContent = tileInitials(name);
  tile.querySelector('.video-tile-name').textContent = isLocal ? `${name || 'You'} (you)` : (name || 'Participant');
  if (isLocal) tile.classList.add('video-tile-local');
  grid.appendChild(tile);
  return tile;
}

function renderLocalTile() {
  const me = getProfile();
  const tile = ensureTile(me.id, { isLocal: true, name: me.name, avatarColor: me.avatarColor });
  if (!tile) return;
  const video = tile.querySelector('video');
  if (localStream) {
    video.srcObject = localStream;
    tile.classList.toggle('video-off', !localStream.getVideoTracks().some(t => t.enabled));
  } else {
    video.srcObject = null;
    tile.classList.add('video-off');
  }
}

function ensureRemoteTile(userId) {
  const participant = currentRoomState?.participants?.[userId];
  return ensureTile(userId, {
    isLocal: false,
    name: participant?.name || 'Participant',
    avatarColor: participant?.avatarColor || '#8b5cf6'
  });
}

function sendSignal(toUserId, data) {
  if (!socket || !currentRoomId) return;
  socket.emit('webrtc:signal', { roomId: currentRoomId, toUserId, data });
}

function createPeerConnection(remoteUserId) {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

  if (localStream) {
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
  }

  pc.onicecandidate = (e) => {
    if (e.candidate) sendSignal(remoteUserId, { type: 'candidate', candidate: e.candidate });
  };

  pc.ontrack = (e) => {
    const tile = ensureRemoteTile(remoteUserId);
    if (!tile) return;
    const video = tile.querySelector('video');
    if (video.srcObject !== e.streams[0]) video.srcObject = e.streams[0];
    tile.classList.remove('video-off');
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed') {
      // A stale/broken connection — drop it and let a future offer (e.g.
      // a manual rejoin) reestablish it, rather than leaving a dead tile.
      closePeer(remoteUserId);
    }
  };

  peerConnections[remoteUserId] = pc;
  return pc;
}

async function callPeer(remoteUserId) {
  if (!remoteUserId || peerConnections[remoteUserId]) return;
  if (Object.keys(peerConnections).length >= MAX_VIDEO_PEERS) return;
  const pc = createPeerConnection(remoteUserId);
  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    sendSignal(remoteUserId, { type: 'offer', sdp: offer.sdp });
  } catch (err) {
    console.warn('Could not start a call with', remoteUserId, err);
    closePeer(remoteUserId);
  }
}

async function handleSignal(fromUserId, data) {
  if (!data || !fromUserId) return;
  let pc = peerConnections[fromUserId];

  try {
    if (data.type === 'offer') {
      if (!pc) {
        if (Object.keys(peerConnections).length >= MAX_VIDEO_PEERS) return;
        pc = createPeerConnection(fromUserId);
      }
      await pc.setRemoteDescription({ type: 'offer', sdp: data.sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendSignal(fromUserId, { type: 'answer', sdp: answer.sdp });
    } else if (data.type === 'answer' && pc) {
      await pc.setRemoteDescription({ type: 'answer', sdp: data.sdp });
    } else if (data.type === 'candidate' && pc && data.candidate) {
      await pc.addIceCandidate(data.candidate).catch(() => {}); // benign races during setup are normal
    }
  } catch (err) {
    console.warn('WebRTC signal handling failed for', fromUserId, err);
  }
}

function closePeer(userId) {
  const pc = peerConnections[userId];
  if (pc) {
    pc.close();
    delete peerConnections[userId];
  }
  document.querySelector(`.video-tile[data-user-id="${userId}"]`)?.remove();
}

function closeAllPeers() {
  Object.keys(peerConnections).forEach(closePeer);
  const grid = document.getElementById('videoGrid');
  if (grid) grid.innerHTML = '';
  stopLocalMedia();
}

function startCallsForExistingParticipants(participantIds) {
  const myId = getProfile().id;
  participantIds.forEach(id => { if (id !== myId) callPeer(id); });
}

function toggleMic() {
  micEnabled = !micEnabled;
  if (localStream) localStream.getAudioTracks().forEach(t => { t.enabled = micEnabled; });
  updateMediaButtons();
  socket?.emit('webrtc:media-state', { roomId: currentRoomId, video: camEnabled, audio: micEnabled });
}

function toggleCam() {
  camEnabled = !camEnabled;
  if (localStream) localStream.getVideoTracks().forEach(t => { t.enabled = camEnabled; });
  const me = getProfile();
  document.querySelector(`.video-tile[data-user-id="${me.id}"]`)?.classList.toggle('video-off', !camEnabled);
  updateMediaButtons();
  socket?.emit('webrtc:media-state', { roomId: currentRoomId, video: camEnabled, audio: micEnabled });
}

function updateMediaButtons() {
  const micBtn = document.getElementById('toggleMicBtn');
  const camBtn = document.getElementById('toggleCamBtn');
  if (micBtn) {
    micBtn.classList.toggle('active-off', !micEnabled);
    micBtn.title = micEnabled ? 'Mute microphone' : 'Unmute microphone';
    micBtn.innerHTML = `<i class="bi ${micEnabled ? 'bi-mic-fill' : 'bi-mic-mute-fill'}"></i>`;
  }
  if (camBtn) {
    camBtn.classList.toggle('active-off', !camEnabled);
    camBtn.title = camEnabled ? 'Turn off camera' : 'Turn on camera';
    camBtn.innerHTML = `<i class="bi ${camEnabled ? 'bi-camera-video-fill' : 'bi-camera-video-off-fill'}"></i>`;
  }
}

// Reflects other participants' mute/camera-off state (received via room
// state updates) onto their video tiles.
function syncTileMediaFromRoomState(room) {
  if (!room) return;
  Object.values(room.participants || {}).forEach(p => {
    const tile = document.querySelector(`.video-tile[data-user-id="${p.id}"]`);
    if (!tile) return;
    tile.classList.toggle('muted', p.media && p.media.audio === false);
    if (p.media && p.media.video === false) tile.classList.add('video-off');
  });
}

function initWebrtcFeature() {
  document.getElementById('toggleMicBtn')?.addEventListener('click', toggleMic);
  document.getElementById('toggleCamBtn')?.addEventListener('click', toggleCam);
  updateMediaButtons();
}
