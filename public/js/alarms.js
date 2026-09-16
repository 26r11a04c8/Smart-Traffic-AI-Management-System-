// ==========================================
// ALARM SYSTEM
// Persisted to localStorage. Uses toasts + sound instead of alert(), since
// alert() blocks the JS thread and used to freeze the Pomodoro countdown
// and clock while the dialog was open.
// ==========================================

let activeAlarms = [];

function loadAlarms() {
  activeAlarms = loadJSON(STORAGE_KEYS.ALARMS, []);
}

function persistAlarms() {
  saveJSON(STORAGE_KEYS.ALARMS, activeAlarms);
}

function setAlarm() {
  const input = document.getElementById('alarmTimeInput');
  const timeVal = input.value;
  if (!timeVal) return;

  activeAlarms.push({ id: generateId(), time: timeVal, triggered: false });
  input.value = '';
  persistAlarms();
  renderAlarms();
  showToast(`Alarm set for ${timeVal}`, 'success');
}

function renderAlarms() {
  const container = document.getElementById('activeAlarmsList');
  if (!container) return;
  if (activeAlarms.length === 0) {
    container.innerHTML = `<p class="text-secondary">No alarms set.</p>`;
    return;
  }
  container.innerHTML = activeAlarms.map(a => `
    <div class="card border-0 p-3 d-flex flex-row justify-content-between align-items-center" style="background-color: var(--card-bg);">
      <span class="fw-bold fs-5 text-light">${escapeHtml(a.time)}</span>
      <button class="btn btn-outline-danger btn-sm" data-action="remove-alarm" data-alarm-id="${a.id}">Delete</button>
    </div>
  `).join('');
}

function removeAlarm(id) {
  activeAlarms = activeAlarms.filter(a => a.id !== id);
  persistAlarms();
  renderAlarms();
}

// Alarms trigger once per matching minute, then reset at midnight so a
// daily alarm can fire again the next day instead of only ever once.
let lastAlarmCheckDay = new Date().toDateString();

function checkAlarms(now) {
  const today = now.toDateString();
  if (today !== lastAlarmCheckDay) {
    lastAlarmCheckDay = today;
    activeAlarms.forEach(a => { a.triggered = false; });
    persistAlarms();
  }

  const currentFormatted = now.toTimeString().substring(0, 5);
  let changed = false;
  activeAlarms.forEach(a => {
    if (a.time === currentFormatted && !a.triggered) {
      a.triggered = true;
      changed = true;
      playBeepSound();
      showToast(`Alarm: it's ${a.time}`, 'alarm', 8000);
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('StudyHub Alarm', { body: `It's ${a.time}` });
      }
    }
  });
  if (changed) persistAlarms();
}

function initAlarmsFeature() {
  loadAlarms();
  document.getElementById('setAlarmBtn')?.addEventListener('click', setAlarm);
  document.getElementById('activeAlarmsList')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="remove-alarm"]');
    if (btn) removeAlarm(btn.dataset.alarmId);
  });
  renderAlarms();
}
