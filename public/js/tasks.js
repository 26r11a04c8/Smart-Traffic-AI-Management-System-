// ==========================================
// TASKS MANAGEMENT
// Persisted to localStorage so the list survives a refresh (previously it
// reset to empty every time the page reloaded).
// ==========================================

let tasks = [];
let editingTaskId = null;

function loadTasks() {
  tasks = loadJSON(STORAGE_KEYS.TASKS, []);
}

function persistTasks() {
  saveJSON(STORAGE_KEYS.TASKS, tasks);
}

function addTask(e) {
  e.preventDefault();
  const input = document.getElementById('newTaskInput');
  if (!input.value.trim()) return;

  tasks.push({ id: generateId(), text: input.value.trim(), completed: false });
  input.value = '';
  persistTasks();
  renderTasks();
}

function toggleTask(id) {
  tasks = tasks.map(t => t.id === id ? { ...t, completed: !t.completed } : t);
  persistTasks();
  renderTasks();
}

function deleteTask(id) {
  tasks = tasks.filter(t => t.id !== id);
  if (editingTaskId === id) editingTaskId = null;
  persistTasks();
  renderTasks();
}

function startEditTask(id) {
  editingTaskId = id;
  renderTasks();
}

function cancelEditTask() {
  editingTaskId = null;
  renderTasks();
}

function saveEditTask(id, newText) {
  const trimmed = (newText || '').trim();
  if (trimmed) {
    tasks = tasks.map(t => t.id === id ? { ...t, text: trimmed } : t);
    persistTasks();
  }
  editingTaskId = null;
  renderTasks();
}

function renderTasks() {
  const container = document.getElementById('taskListContainer');
  if (!container) return;

  if (tasks.length === 0) {
    container.innerHTML = `<p class="text-secondary">No tasks created yet.</p>`;
    document.getElementById('taskProgressSummary').innerText = `0 of 0 tasks completed`;
    return;
  }

  container.innerHTML = tasks.map(t => {
    if (t.id === editingTaskId) {
      return `
        <div class="card border-0 p-3 d-flex flex-row justify-content-between align-items-center" style="background-color: var(--card-bg);">
          <div class="d-flex align-items-center gap-3 flex-grow-1">
            <input type="checkbox" class="form-check-input" disabled ${t.completed ? 'checked' : ''} />
            <input type="text" class="form-control form-control-sm bg-dark text-light border-secondary task-edit-input"
              data-task-id="${t.id}" value="${escapeHtml(t.text)}" />
          </div>
          <div class="d-flex gap-1">
            <button class="btn btn-outline-success btn-sm border-0" data-action="save-edit" data-task-id="${t.id}"><i class="bi bi-check-lg"></i></button>
            <button class="btn btn-outline-secondary btn-sm border-0" data-action="cancel-edit"><i class="bi bi-x-lg"></i></button>
          </div>
        </div>
      `;
    }
    return `
      <div class="card border-0 p-3 d-flex flex-row justify-content-between align-items-center" style="background-color: var(--card-bg);">
        <div class="d-flex align-items-center gap-3">
          <input type="checkbox" class="form-check-input" ${t.completed ? 'checked' : ''} data-action="toggle-task" data-task-id="${t.id}" />
          <span class="${t.completed ? 'completed-task' : 'text-light'}">${escapeHtml(t.text)}</span>
        </div>
        <div class="d-flex gap-1">
          <button class="btn btn-outline-light btn-sm border-0" data-action="start-edit" data-task-id="${t.id}"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-outline-danger btn-sm border-0" data-action="delete-task" data-task-id="${t.id}"><i class="bi bi-trash"></i></button>
        </div>
      </div>
    `;
  }).join('');

  if (editingTaskId !== null) {
    const input = container.querySelector(`.task-edit-input[data-task-id="${editingTaskId}"]`);
    if (input) { input.focus(); input.select(); }
  }

  const doneCount = tasks.filter(t => t.completed).length;
  document.getElementById('taskProgressSummary').innerText = `${doneCount} of ${tasks.length} tasks completed`;
}

function initTasksFeature() {
  loadTasks();

  document.getElementById('taskForm')?.addEventListener('submit', addTask);

  const container = document.getElementById('taskListContainer');
  container?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = btn.dataset.taskId;
    switch (btn.dataset.action) {
      case 'toggle-task': toggleTask(id); break;
      case 'start-edit': startEditTask(id); break;
      case 'delete-task': deleteTask(id); break;
      case 'cancel-edit': cancelEditTask(); break;
      case 'save-edit': {
        const input = container.querySelector(`.task-edit-input[data-task-id="${id}"]`);
        saveEditTask(id, input?.value);
        break;
      }
    }
  });
  container?.addEventListener('keydown', (e) => {
    const input = e.target.closest('.task-edit-input');
    if (!input) return;
    if (e.key === 'Enter') saveEditTask(input.dataset.taskId, input.value);
    else if (e.key === 'Escape') cancelEditTask();
  });

  renderTasks();
}
