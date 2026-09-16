// ==========================================
// STORAGE LAYER
// Wraps localStorage with JSON (de)serialization and safe error handling.
//
// Rooms used to live entirely in localStorage, using the browser's native
// `storage` event as a fake "realtime" bus between tabs on the same
// browser. That's gone now — rooms, presence, chat, and the focus timer
// are real, server-backed state synced over Socket.IO (see js/rooms.js
// and server.js), which is what actually makes cross-device camera calls
// possible. localStorage is still used for everything that's genuinely
// personal-and-local: your profile draft, tasks, notes, alarms, Pomodoro
// settings, background choice, favourite rooms (a personal star, not
// shared state), and which room to try rejoining after a refresh.
// ==========================================

const STORAGE_KEYS = {
  PROFILE: 'studyhub_profile',
  FAVOURITES: 'studyhub_favourite_rooms',
  TASKS: 'studyhub_tasks',
  NOTES: 'studyhub_notes',
  ALARMS: 'studyhub_alarms',
  POMODORO_SETTINGS: 'studyhub_pomodoro_settings',
  BACKGROUND: 'studyhub_background',
  LAST_ROOM: 'studyhub_last_room'
};

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    console.warn(`Failed to read "${key}" from storage`, err);
    return fallback;
  }
}

function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.warn(`Failed to save "${key}" to storage`, err);
    showToast('Could not save — your browser storage may be full.', 'error');
    return false;
  }
}

// Fires `callback` whenever another tab changes `key`. Still used by
// purely-local features (e.g. background preference) that benefit from
// staying in sync across tabs on the same browser.
function onExternalStorageChange(key, callback) {
  window.addEventListener('storage', (e) => {
    if (e.key === key) callback(e);
  });
}
