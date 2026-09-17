// ==========================================
// CUSTOMIZABLE POMODORO TIMER
// ==========================================

let pomoInterval = null;
let pomoSecondsLeft = 25 * 60;
let isPomoRunning = false;
let isBreak = false;

let workInput, breakInput, display, startBtn, resetBtn, sessionLabel;

function getWorkMinutes() {
  return Math.max(1, Math.min(120, parseInt(workInput.value) || 25));
}

function getBreakMinutes() {
  return Math.max(1, Math.min(60, parseInt(breakInput.value) || 5));
}

function persistPomoSettings() {
  saveJSON(STORAGE_KEYS.POMODORO_SETTINGS, {
    work: getWorkMinutes(),
    break: getBreakMinutes()
  });
}

function initializePomodoro() {
  const saved = loadJSON(STORAGE_KEYS.POMODORO_SETTINGS, null);
  if (saved) {
    workInput.value = saved.work;
    breakInput.value = saved.break;
  }
  pomoSecondsLeft = getWorkMinutes() * 60;
  isBreak = false;
  updatePomoDisplay();
  updateSessionLabel();
  updateButton();
}

function togglePomodoro() {
  if (isPomoRunning) pausePomodoro();
  else startPomodoro();
}

function startPomodoro() {
  if (pomoInterval !== null) return;
  isPomoRunning = true;
  updateButton();
  workInput.disabled = true;
  breakInput.disabled = true;

  pomoInterval = setInterval(() => {
    pomoSecondsLeft--;
    updatePomoDisplay();
    if (pomoSecondsLeft <= 0) completePomodoro();
  }, 1000);
}

function pausePomodoro() {
  clearInterval(pomoInterval);
  pomoInterval = null;
  isPomoRunning = false;
  updateButton();
  workInput.disabled = false;
  breakInput.disabled = false;
}

function completePomodoro() {
  clearInterval(pomoInterval);
  pomoInterval = null;
  isPomoRunning = false;

  playBeepSound();
  showPomodoroNotification();

  if (!isBreak) {
    isBreak = true;
    pomoSecondsLeft = getBreakMinutes() * 60;
  } else {
    isBreak = false;
    pomoSecondsLeft = getWorkMinutes() * 60;
  }

  updatePomoDisplay();
  updateSessionLabel();
  updateButton();
  workInput.disabled = false;
  breakInput.disabled = false;
}

function resetPomodoro() {
  clearInterval(pomoInterval);
  pomoInterval = null;
  isPomoRunning = false;
  isBreak = false;
  pomoSecondsLeft = getWorkMinutes() * 60;
  workInput.disabled = false;
  breakInput.disabled = false;
  updatePomoDisplay();
  updateSessionLabel();
  updateButton();
}

function updatePomoDisplay() {
  if (!display) return;
  const minutes = Math.floor(pomoSecondsLeft / 60).toString().padStart(2, '0');
  const seconds = (pomoSecondsLeft % 60).toString().padStart(2, '0');
  display.textContent = `${minutes}:${seconds}`;
}

function updateSessionLabel() {
  if (!sessionLabel) return;
  sessionLabel.textContent = isBreak ? 'Break Time' : 'Work Session';
}

function updateButton() {
  if (!startBtn) return;
  startBtn.textContent = isPomoRunning ? 'Pause' : 'Start';
}

// Replaces the previous blocking alert() with a toast + optional system
// notification, so the timer, clock, and other tabs' presence heartbeats
// keep running instead of the whole page freezing on completion.
function showPomodoroNotification() {
  const message = isBreak
    ? 'Break finished! Time to get back to work.'
    : 'Work session finished! Time for a break.';

  if ('Notification' in window) {
    if (Notification.permission === 'granted') {
      new Notification('Pomodoro Timer', { body: message });
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission();
    }
  }
  showToast(message, 'success', 6000);
}

function playBeepSound() {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.frequency.value = 800;
    oscillator.type = 'sine';
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 1);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 1);
  } catch (error) {
    console.log('Audio not supported:', error);
  }
}

function initPomodoroFeature() {
  workInput = document.getElementById('pomoWorkInput');
  breakInput = document.getElementById('pomoBreakInput');
  display = document.getElementById('pomodoroDisplay');
  startBtn = document.getElementById('pomoStartBtn');
  resetBtn = document.getElementById('pomoResetBtn');
  sessionLabel = document.getElementById('pomoSessionLabel');
  if (!workInput || !breakInput || !display || !startBtn || !resetBtn) return;

  initializePomodoro();

  workInput.addEventListener('input', () => {
    if (!isPomoRunning && !isBreak) {
      pomoSecondsLeft = getWorkMinutes() * 60;
      updatePomoDisplay();
    }
    persistPomoSettings();
  });

  breakInput.addEventListener('input', () => {
    if (!isPomoRunning && isBreak) {
      pomoSecondsLeft = getBreakMinutes() * 60;
      updatePomoDisplay();
    }
    persistPomoSettings();
  });

  startBtn.addEventListener('click', togglePomodoro);
  resetBtn.addEventListener('click', resetPomodoro);
}
