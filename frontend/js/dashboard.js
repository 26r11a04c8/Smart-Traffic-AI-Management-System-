// ==========================================
// DASHBOARD SUMMARY
// The dashboard used to only show a "0 of 0 tasks completed" line and a
// grid of rooms. Rooms moved to the Stream section (see rooms.js), and in
// their place the dashboard now surfaces what actually needs your
// attention: your open tasks and your upcoming alarms, at a glance,
// without having to visit either section.
// ==========================================

function renderDashboardSummary() {
  renderDashboardTasks();
  renderDashboardAlarms();
}

function renderDashboardTasks() {
  const list = document.getElementById('dashboardTasksList');
  const summaryEl = document.getElementById('taskProgressSummary');
  if (!list) return;

  // `tasks` is the shared array from tasks.js — every module in this app
  // talks to each other's state directly rather than through a framework.
  const openTasks = tasks.filter(t => !t.completed);

  if (tasks.length === 0) {
    list.innerHTML = `<p class="text-secondary small mb-0">No tasks yet — add one to see it here.</p>`;
  } else if (openTasks.length === 0) {
    list.innerHTML = `<p class="text-secondary small mb-0">All caught up on tasks! 🎉</p>`;
  } else {
    list.innerHTML = openTasks.slice(0, 5).map(t => `
      <div class="d-flex align-items-center gap-2">
        <input type="checkbox" class="form-check-input" data-action="toggle-task" data-task-id="${t.id}" />
        <span class="text-light small">${escapeHtml(t.text)}</span>
      </div>
    `).join('');
    if (openTasks.length > 5) {
      list.insertAdjacentHTML('beforeend', `<p class="text-secondary small mb-0 mt-2">+${openTasks.length - 5} more open</p>`);
    }
  }

  const doneCount = tasks.filter(t => t.completed).length;
  if (summaryEl) summaryEl.innerText = `${doneCount} of ${tasks.length} tasks completed`;
}

function renderDashboardAlarms() {
  const list = document.getElementById('dashboardAlarmsList');
  const summaryLine = document.getElementById('alarmSummaryLine');
  if (!list) return;

  // `activeAlarms` is the shared array from alarms.js.
  if (activeAlarms.length === 0) {
    list.innerHTML = `<p class="text-secondary small mb-0">No alarms set — set one to see it here.</p>`;
    if (summaryLine) summaryLine.textContent = 'No alarms set';
    return;
  }

  const nowStr = new Date().toTimeString().substring(0, 5);
  const sorted = [...activeAlarms].sort((a, b) => a.time.localeCompare(b.time));
  const next = sorted.find(a => a.time >= nowStr) || sorted[0];

  list.innerHTML = sorted.slice(0, 5).map(a => `
    <div class="d-flex align-items-center justify-content-between">
      <span class="text-light small"><i class="bi bi-alarm me-2 text-secondary"></i>${escapeHtml(a.time)}</span>
      ${next && a.id === next.id ? '<span class="badge bg-purple">Next</span>' : ''}
    </div>
  `).join('');
  if (sorted.length > 5) {
    list.insertAdjacentHTML('beforeend', `<p class="text-secondary small mb-0 mt-2">+${sorted.length - 5} more</p>`);
  }

  if (summaryLine) {
    const plural = activeAlarms.length === 1 ? '' : 's';
    summaryLine.textContent = `${activeAlarms.length} alarm${plural} set` + (next ? ` — next at ${next.time}` : '');
  }
}

function initDashboardFeature() {
  // Let you check off a task straight from the dashboard, not just from
  // the full Tasks view.
  document.getElementById('dashboardTasksList')?.addEventListener('click', (e) => {
    const cb = e.target.closest('[data-action="toggle-task"]');
    if (!cb) return;
    toggleTask(cb.dataset.taskId);
    renderDashboardTasks();
  });

  renderDashboardSummary();
}
