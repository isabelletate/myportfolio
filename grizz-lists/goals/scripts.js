/* eslint-disable */
// ============================================
// GOAL PLANNER - Personal goals with optional due dates
// ============================================

import {
  createEventStore,
  replayChangelogBase,
  getListIdFromUrl,
  addToRecentLists,
  createPoller,
  generateId,
} from '../shared.js';

// ============================================
// LIST CONFIGURATION
// ============================================

const listId = getListIdFromUrl();

if (!listId) {
  window.location.href = '../index.html';
}

// ============================================
// EVENT STORE
// ============================================

const store = createEventStore('goals', listId);

// ============================================
// REPLAY
// ============================================

function replayChangelog(changelog) {
  const itemFactory = (event) => ({
    id: event.id,
    text: event.text,
    dueDate: event.dueDate || null,
    completed: false,
    tasks: [],
  });

  const { itemsMap, order, sortedEvents } = replayChangelogBase(changelog, itemFactory);

  for (const event of sortedEvents) {
    switch (event.op) {
      case 'checked':
        if (itemsMap.has(event.id)) {
          itemsMap.get(event.id).completed = true;
        }
        break;
      case 'unchecked':
        if (itemsMap.has(event.id)) {
          itemsMap.get(event.id).completed = false;
        }
        break;
      case 'clear_completed':
        const idsToRemove = typeof event.ids === 'string'
          ? JSON.parse(event.ids)
          : (event.ids || []);
        for (const id of idsToRemove) {
          const normalizedId = isNaN(Number(id)) ? id : Number(id);
          itemsMap.delete(normalizedId);
          const idx = order.indexOf(normalizedId);
          if (idx > -1) order.splice(idx, 1);
        }
        break;
      case 'sub_added':
        {
          const goal = Array.from(itemsMap.values()).find((g) => String(g.id) === String(event.goalId));
          if (goal && goal.tasks) {
            goal.tasks.push({ id: event.id, text: event.text || '', completed: false });
          }
        }
        break;
      case 'sub_checked':
        {
          const goal = Array.from(itemsMap.values()).find((g) => String(g.id) === String(event.goalId));
          const task = goal?.tasks?.find((t) => String(t.id) === String(event.id));
          if (task) task.completed = true;
        }
        break;
      case 'sub_unchecked':
        {
          const goal = Array.from(itemsMap.values()).find((g) => String(g.id) === String(event.goalId));
          const task = goal?.tasks?.find((t) => String(t.id) === String(event.id));
          if (task) task.completed = false;
        }
        break;
      case 'sub_removed':
        {
          const goal = Array.from(itemsMap.values()).find((g) => String(g.id) === String(event.goalId));
          if (goal?.tasks) {
            goal.tasks = goal.tasks.filter((t) => String(t.id) !== String(event.id));
          }
        }
        break;
    }
  }

  return order.map((id) => itemsMap.get(id)).filter(Boolean);
}

// ============================================
// STATE & DOM
// ============================================

let goals = [];
const expandedGoalIds = new Set();

const goalList = document.getElementById('goalList');
const addInput = document.getElementById('addInput');
const addDueInput = document.getElementById('addDueInput');
const addSubmitBtn = document.getElementById('addSubmitBtn');
const clearDoneBtn = document.getElementById('clearDoneBtn');
const goalCount = document.getElementById('goalCount');
const progressCount = document.getElementById('progressCount');
const progressFill = document.getElementById('progressFill');

// ============================================
// INIT
// ============================================

async function init() {
  setupEventListeners();

  goalList.innerHTML = `
        <div class="loading-state">
            <div class="loading-spinner"></div>
            <p>Loading goals...</p>
        </div>
    `;

  const changelog = await store.loadChangelogFromServer();
  goals = replayChangelog(changelog);

  const metadata = store.getMetadata();
  const listTitleEl = document.getElementById('listTitle');
  if (listTitleEl && metadata.name) {
    listTitleEl.textContent = metadata.name;
    document.title = `${metadata.name} 🎯 - Grizz Lists`;
  }

  addToRecentLists(listId, metadata.name, 'goals');
  renderGoals();
  updateProgress();
}

function setupEventListeners() {
  addSubmitBtn.addEventListener('click', addGoal);
  addInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addGoal();
  });
  addDueInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addGoal();
  });
  clearDoneBtn.addEventListener('click', clearCompletedGoals);
}

// ============================================
// OPERATIONS
// ============================================

function addGoal() {
  const text = addInput.value.trim();
  if (!text) return;

  const dueDate = addDueInput.value.trim() || null;
  const id = generateId();

  const goal = {
    id, text, dueDate, completed: false, tasks: [],
  };
  store.addEvent('added', { id, text, dueDate });
  goals.push(goal);

  addInput.value = '';
  addDueInput.value = '';
  renderGoals();
  updateProgress();
}

function toggleGoal(id) {
  const goal = goals.find((g) => g.id === id);
  if (!goal) return;

  const wasCompleted = goal.completed;
  goal.completed = !wasCompleted;
  store.addEvent(wasCompleted ? 'unchecked' : 'checked', { id });

  const el = document.querySelector(`[data-id="${id}"]`);
  if (el) el.classList.toggle('completed', goal.completed);
  updateProgress();
}

function deleteGoal(id) {
  const el = document.querySelector(`[data-id="${id}"]`);
  if (el) {
    el.classList.add('removing');
    setTimeout(() => {
      store.addEvent('removed', { id });
      goals = goals.filter((g) => g.id !== id);
      renderGoals();
      updateProgress();
    }, 300);
  }
}

function toggleExpand(goalId) {
  if (expandedGoalIds.has(goalId)) {
    expandedGoalIds.delete(goalId);
  } else {
    expandedGoalIds.add(goalId);
  }
  renderGoals();
}

function addSubTask(goalId, text) {
  const goal = goals.find((g) => g.id === goalId);
  if (!goal || !text?.trim()) return;
  if (!goal.tasks) goal.tasks = [];
  const id = generateId();
  goal.tasks.push({ id, text: text.trim(), completed: false });
  store.addEvent('sub_added', { goalId, id, text: text.trim() });
  expandedGoalIds.add(String(goalId));
  renderGoals();
  updateProgress();
}

function toggleSubTask(goalId, taskId) {
  const goal = goals.find((g) => g.id === goalId);
  const task = goal?.tasks?.find((t) => t.id === taskId);
  if (!task) return;
  const wasCompleted = task.completed;
  task.completed = !wasCompleted;
  store.addEvent(wasCompleted ? 'sub_unchecked' : 'sub_checked', { goalId, id: taskId });
  const el = document.querySelector(`[data-goal-id="${goalId}"][data-task-id="${taskId}"]`);
  if (el) el.classList.toggle('completed', task.completed);
  updateProgress();
}

function deleteSubTask(goalId, taskId) {
  const goal = goals.find((g) => g.id === goalId);
  if (!goal?.tasks) return;
  const el = document.querySelector(`[data-goal-id="${goalId}"][data-task-id="${taskId}"]`);
  if (el) {
    el.classList.add('removing');
    setTimeout(() => {
      goal.tasks = goal.tasks.filter((t) => t.id !== taskId);
      store.addEvent('sub_removed', { goalId, id: taskId });
      renderGoals();
      updateProgress();
    }, 200);
  }
}

async function clearCompletedGoals() {
  const completed = goals.filter((g) => g.completed);
  if (completed.length === 0) return;

  completed.forEach((goal) => {
    const el = document.querySelector(`[data-id="${goal.id}"]`);
    if (el) el.classList.add('removing');
  });

  setTimeout(async () => {
    const ids = completed.map((g) => g.id);
    const event = store.addEvent('clear_completed', { ids });
    await event._postPromise;
    goals = goals.filter((g) => !g.completed);
    renderGoals();
    updateProgress();
  }, 300);
}

// ============================================
// RENDER
// ============================================

function updateProgress() {
  const total = goals.length;
  const done = goals.filter((g) => g.completed).length;
  goalCount.textContent = total === 0 ? '0 goals' : `${total} goal${total === 1 ? '' : 's'}`;
  progressCount.textContent = `${done}/${total}`;
  progressFill.style.width = total ? `${(done / total) * 100}%` : '0%';
}

function createGoalHTML(goal) {
  const tasks = goal.tasks || [];
  const isExpanded = expandedGoalIds.has(String(goal.id));
  const taskCount = tasks.length;
  const taskCountHtml = taskCount > 0
    ? `<span class="goal-task-count">${tasks.filter((t) => t.completed).length}/${taskCount}</span>`
    : '';
  const dueHtml = goal.dueDate
    ? `<span class="goal-due">${escapeHtml(goal.dueDate)}</span>`
    : '';
  let subHtml = '';
  if (isExpanded) {
    const taskItems = tasks.map((t) => `
            <div class="subtask-item ${t.completed ? 'completed' : ''}" data-goal-id="${goal.id}" data-task-id="${t.id}">
                <div class="subtask-check" aria-label="Toggle"></div>
                <span class="subtask-text">${escapeHtml(t.text)}</span>
                <button class="subtask-delete" aria-label="Delete">×</button>
            </div>
        `).join('');
    subHtml = `
            <div class="goal-subtasks">
                <div class="subtask-list">${taskItems}</div>
                <div class="subtask-add">
                    <input type="text" class="subtask-input" placeholder="Add sub-task..." data-goal-id="${goal.id}">
                    <button class="subtask-add-btn" data-goal-id="${goal.id}">Add</button>
                </div>
            </div>
        `;
  }
  return `
        <div class="goal-item ${goal.completed ? 'completed' : ''} ${isExpanded ? 'expanded' : ''}" data-id="${goal.id}">
            <div class="goal-row">
                <div class="goal-check" aria-label="Toggle complete"></div>
                <div class="goal-content">
                    <span class="goal-text">${escapeHtml(goal.text)}</span>
                    ${dueHtml}
                    ${taskCountHtml}
                </div>
                <button class="goal-expand" aria-label="Expand sub-tasks" data-goal-id="${goal.id}" title="Sub-tasks">
                    <svg class="expand-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M9 18l6-6-6-6" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    ${taskCount > 0 ? `<span class="expand-badge">${taskCount}</span>` : ''}
                </button>
                <button class="goal-delete" aria-label="Delete goal">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 6L6 18M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </button>
            </div>
            ${subHtml}
        </div>
    `;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function renderGoals() {
  updateProgress();

  if (goals.length === 0) {
    goalList.innerHTML = `
            <div class="empty-state">
                <div class="empty-emoji">🎯</div>
                <p class="empty-text">No goals yet</p>
                <p class="empty-hint">Add a goal below to get started</p>
            </div>
        `;
    return;
  }

  const active = goals.filter((g) => !g.completed);
  const completed = goals.filter((g) => g.completed);

  let html = '';
  if (active.length > 0) {
    html += `<div class="section-header"><span class="section-title">Active</span><span class="section-count">${active.length}</span><div class="section-line"></div></div>`;
    active.forEach((g) => { html += createGoalHTML(g); });
  }
  if (completed.length > 0) {
    html += `<div class="section-header"><span class="section-title">Done</span><span class="section-count">${completed.length}</span><div class="section-line"></div></div>`;
    completed.forEach((g) => { html += createGoalHTML(g); });
  }

  goalList.innerHTML = html;

  goalList.querySelectorAll('.goal-item').forEach((el) => {
    const { id } = el.dataset;
    el.querySelector('.goal-check').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleGoal(id);
    });
    el.querySelector('.goal-content').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleGoal(id);
    });
    const expandBtn = el.querySelector('.goal-expand');
    if (expandBtn) {
      expandBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleExpand(id);
      });
    }
    el.querySelector('.goal-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteGoal(id);
    });

    el.querySelectorAll('.subtask-item').forEach((sub) => {
      const { goalId } = sub.dataset;
      const { taskId } = sub.dataset;
      sub.querySelector('.subtask-check').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleSubTask(goalId, taskId);
      });
      sub.addEventListener('click', (e) => {
        if (!e.target.closest('.subtask-delete')) toggleSubTask(goalId, taskId);
      });
      sub.querySelector('.subtask-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteSubTask(goalId, taskId);
      });
    });

    el.querySelectorAll('.subtask-add').forEach((addRow) => {
      const goalId = addRow.querySelector('.subtask-input')?.dataset.goalId;
      const input = addRow.querySelector('.subtask-input');
      const addBtn = addRow.querySelector('.subtask-add-btn');
      if (!input || !goalId) return;
      const doAdd = () => {
        addSubTask(goalId, input.value);
        input.value = '';
      };
      input.addEventListener('keypress', (e) => { if (e.key === 'Enter') doAdd(); });
      addBtn?.addEventListener('click', doAdd);
    });
  });
}

// ============================================
// POLLING
// ============================================

let lastGoalsHash = '';

function getGoalsHash() {
  return goals.map((g) => {
    const tasksStr = (g.tasks || []).map((t) => `${t.id}:${t.completed}`).join(',');
    return `${g.id}:${g.text}:${g.completed}:${tasksStr}`;
  }).join('|');
}

async function pollForChanges() {
  if (store.getIsSyncing()) return;
  try {
    store.setIsSyncing(true);
    const changelog = await store.loadChangelogFromServer({ silent: true });
    store.setIsSyncing(false);
    const newGoals = replayChangelog(changelog);
    const nextHash = newGoals.map((g) => {
      const tasksStr = (g.tasks || []).map((t) => `${t.id}:${t.completed}`).join(',');
      return `${g.id}:${g.text}:${g.completed}:${tasksStr}`;
    }).join('|');
    if (nextHash !== lastGoalsHash) {
      lastGoalsHash = nextHash;
      goals = newGoals;
      renderGoals();
      updateProgress();
    }
  } catch (err) {
    store.setIsSyncing(false);
    console.error('Poll error:', err);
  }
}

// ============================================
// START
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
  await init();
  lastGoalsHash = getGoalsHash();
  createPoller(pollForChanges, 5000);
});
