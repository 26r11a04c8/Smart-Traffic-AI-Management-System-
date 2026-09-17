// ==========================================
// PROFILE
// A minimal identity so room participants and chat messages can show a
// name. Created once on first visit and reused after.
// ==========================================

const AVATAR_COLORS = ['#8b5cf6', '#3b82f6', '#ec4899', '#22c55e', '#f59e0b', '#06b6d4', '#ef4444'];

function getProfile() {
  return loadJSON(STORAGE_KEYS.PROFILE, null);
}

function saveProfile(profile) {
  saveJSON(STORAGE_KEYS.PROFILE, profile);
}

function ensureProfile() {
  let profile = getProfile();
  if (profile && profile.name) return profile;

  profile = {
    id: generateId(),
    name: '',
    avatarColor: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]
  };
  saveProfile(profile);
  return profile;
}

function initProfileFeature() {
  const profile = ensureProfile();
  const modalEl = document.getElementById('profileSetupModal');
  const form = document.getElementById('profileSetupForm');
  const input = document.getElementById('profileNameInput');
  const editBtn = document.getElementById('editProfileBtn');
  const nameLabel = document.getElementById('currentProfileName');

  function refreshLabel() {
    const p = getProfile();
    if (nameLabel) nameLabel.textContent = p?.name || 'Set your name';
  }

  function openModal() {
    input.value = getProfile()?.name || '';
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl, { backdrop: 'static', keyboard: !!profile.name });
    modal.show();
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = input.value.trim();
    if (!name) return;
    const p = getProfile();
    p.name = name.slice(0, 24);
    saveProfile(p);
    refreshLabel();
    bootstrap.Modal.getInstance(modalEl)?.hide();
    showToast(`Welcome, ${p.name}!`, 'success');
    document.dispatchEvent(new CustomEvent('profile:updated'));
  });

  editBtn?.addEventListener('click', openModal);

  refreshLabel();
  if (!profile.name) openModal();
}
