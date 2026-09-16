// ==========================================
// FRIENDS
// No real friends data source exists anywhere in this app (no backend, no
// accounts), so each tab renders an honest empty state rather than fake
// placeholder people. Wire `friendsData` up to a real API/store when one
// exists — the render/search/tab logic below already supports it.
// ==========================================

let currentFriendsTab = 'recent';
const friendsData = {
  recent: [],
  friends: [],
  requests: [],
  find: [],
  blocked: []
};

function renderFriendsList() {
  const container = document.getElementById('friendsListContainer');
  if (!container) return;

  const list = friendsData[currentFriendsTab] || [];

  if (list.length === 0) {
    const emptyCopy = {
      recent: 'No recent activity yet. Join a room to meet people.',
      friends: "You haven't added any friends yet.",
      requests: 'No pending friend requests.',
      find: 'Search above to find people to add.',
      blocked: "You haven't blocked anyone."
    };
    container.innerHTML = `<p class="text-secondary">${escapeHtml(emptyCopy[currentFriendsTab] || 'Nothing to show yet.')}</p>`;
    return;
  }

  container.innerHTML = list.map(f => `
    <div class="card border-0 p-3 d-flex flex-row align-items-center gap-3" style="background-color: var(--card-bg);">
      <img class="friend-avatar" src="${f.avatar || 'https://via.placeholder.com/48'}" alt="${escapeHtml(f.name)}" />
      <span class="text-light">${escapeHtml(f.name)}</span>
    </div>
  `).join('');
}

function searchFriends() {
  const query = (document.getElementById('friendSearchInput').value || '').toLowerCase();
  const container = document.getElementById('friendsListContainer');
  if (!container) return;

  Array.from(container.children).forEach(child => {
    const matches = child.textContent.toLowerCase().includes(query);
    child.style.display = matches ? '' : 'none';
  });
}

function filterFriendsTab(tabName, element) {
  currentFriendsTab = tabName;
  document.querySelectorAll('#friendsTab .nav-link').forEach(el => el.classList.remove('active'));
  if (element) element.classList.add('active');
  renderFriendsList();
}

function initFriendsFeature() {
  document.querySelectorAll('#friendsTab .nav-link').forEach(link => {
    link.addEventListener('click', () => filterFriendsTab(link.dataset.tab, link));
  });
  document.getElementById('friendSearchInput')?.addEventListener('keyup', searchFriends);
}
