// ==========================================
// UTILITIES
// Shared helpers used across every module. No dependencies.
// ==========================================

function generateId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Small, deliberately non-cryptographic hash. Kept around for anything
// that still needs a quick client-side fingerprint. Room passwords are no
// longer hashed here — the server hashes them properly with a per-room
// salt (see server.js) and the plaintext/hash never has to touch the
// client at all now that rooms live on a real backend.
function hashSimple(str) {
  let hash = 5381;
  const s = String(str || '');
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) + hash) + s.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString(36);
}

function debounce(fn, wait) {
  let t = null;
  return function debounced(...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

function timeAgo(ts) {
  const diff = Math.max(0, Date.now() - ts);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ---- Toast notifications ----
function showToast(message, type = 'info', timeoutMs = 4000) {
  const host = document.getElementById('toastHost');
  if (!host) return;

  const icons = {
    info: 'bi-info-circle',
    success: 'bi-check-circle',
    error: 'bi-exclamation-triangle',
    alarm: 'bi-alarm-fill'
  };

  const toast = document.createElement('div');
  toast.className = `app-toast app-toast-${type}`;
  toast.innerHTML = `
    <i class="bi ${icons[type] || icons.info}"></i>
    <span class="app-toast-msg"></span>
    <button class="app-toast-close" aria-label="Dismiss"><i class="bi bi-x"></i></button>
  `;
  toast.querySelector('.app-toast-msg').textContent = message;
  toast.querySelector('.app-toast-close').addEventListener('click', () => toast.remove());

  host.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));

  if (timeoutMs > 0) {
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, timeoutMs);
  }
}
