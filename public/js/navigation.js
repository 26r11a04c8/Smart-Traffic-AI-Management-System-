// ==========================================
// NAVIGATION & VIEW SWITCHER
// ==========================================

function switchView(viewName) {
  document.querySelectorAll('.app-view').forEach(v => v.classList.add('hidden'));
  document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));

  const target = document.getElementById(`view-${viewName}`);
  if (target) target.classList.remove('hidden');

  // Rooms live entirely under "Stream" now, including the room-detail
  // screen you land on after joining one — so keep the Stream sidebar
  // link highlighted while you're inside a room, even though there's no
  // separate sidebar entry for "room-detail" itself.
  const navKey = viewName === 'room-detail' ? 'stream' : viewName;
  const activeLink = document.querySelector(`.sidebar-link[data-view="${navKey}"]`);
  if (activeLink) activeLink.classList.add('active');

  if (viewName === 'friends') renderFriendsList();
  if (viewName === 'tasks') renderTasks();
  if (viewName === 'dashboard') renderDashboardSummary();
  if (viewName === 'stream') refreshAndRenderRoomLists();
}

function initNavigation() {
  document.querySelectorAll('[data-view]').forEach(link => {
    link.addEventListener('click', () => switchView(link.dataset.view));
  });

  // Requirement: clicking the StudyHub brand always returns to the dashboard.
  document.getElementById('brandLogo')?.addEventListener('click', () => switchView('dashboard'));
}
