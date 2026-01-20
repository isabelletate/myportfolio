// ============================================
// REPORT - Daily Task Report View
// ============================================

import {
  loadChangelogFromServer,
  loadChangelog,
  addEvent,
  replayChangelog,
  parseTimeToMinutes,
  formatTimeLong,
  formatDuration,
} from './shared.js';

// ============================================
// STATE
// ============================================

let lastKnownEventCount = 0;
let isPolling = false;

// ============================================
// RENDERING
// ============================================

function renderStats(tasks) {
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.completed).length;
  const completionRate = Math.round((completedTasks / totalTasks) * 100);

  const totalMinutes = tasks.reduce((sum, t) => sum + parseTimeToMinutes(t.time), 0);
  const completedMinutes = tasks
    .filter((t) => t.completed)
    .reduce((sum, t) => sum + parseTimeToMinutes(t.time), 0);
  const remainingMinutes = totalMinutes - completedMinutes;

  const statsGrid = document.getElementById('statsGrid');
  const stats = [
    {
      label: 'Tasks Completed',
      value: `${completedTasks}/${totalTasks}`,
      highlight: completedTasks === totalTasks,
    },
    {
      label: 'Completion Rate',
      value: `${completionRate}%`,
      subtext: (() => {
        if (completionRate >= 80) return 'Excellent progress';
        if (completionRate >= 50) return 'Good progress';
        return 'In progress';
      })(),
      highlight: completionRate >= 80,
    },
    {
      label: 'Time Invested',
      value: formatDuration(completedMinutes),
      subtext: `of ${formatDuration(totalMinutes)} planned`,
    },
    {
      label: 'Time Remaining',
      value: formatDuration(remainingMinutes),
      subtext: remainingMinutes === 0 ? 'All tasks complete' : 'Estimated',
    },
  ];

  statsGrid.innerHTML = stats.map((stat) => `
        <div class="stat-card${stat.highlight ? ' highlight' : ''}">
            <div class="stat-label">${stat.label}</div>
            <div class="stat-value">${stat.value}</div>
            ${stat.subtext ? `<div class="stat-subtext">${stat.subtext}</div>` : ''}
        </div>
    `).join('');

  // Update progress bar
  document.getElementById('progressPercent').textContent = `${completionRate}%`;
  document.getElementById('progressFill').style.width = `${completionRate}%`;
}

// Forward declaration for renderTasks (called by setupDragAndDrop)
let renderTasks;

function setupDragAndDrop(tasks) {
  const taskList = document.getElementById('taskList');
  let draggedEl = null;

  taskList.querySelectorAll('.task-row').forEach((row) => {
    row.addEventListener('dragstart', (e) => {
      draggedEl = row;
      row.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });

    row.addEventListener('dragend', () => {
      row.classList.remove('dragging');
      draggedEl = null;
    });

    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!draggedEl || draggedEl === row) return;

      const rect = row.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;

      if (e.clientY < midY) {
        row.parentNode.insertBefore(draggedEl, row);
      } else {
        row.parentNode.insertBefore(draggedEl, row.nextSibling);
      }
    });

    row.addEventListener('drop', async (e) => {
      e.preventDefault();
      // Get new order of task IDs
      const newOrderIds = [...taskList.querySelectorAll('.task-row')]
        .map((el) => tasks[parseInt(el.dataset.index, 10)].id);

      // Emit reorder event
      await addEvent('reorder', { order: newOrderIds });

      // Update event count to prevent self-reload
      lastKnownEventCount = loadChangelog().length;

      // Reload from changelog and re-render
      const updatedTasks = replayChangelog(loadChangelog());
      renderTasks(updatedTasks);

      // Update the tasks array reference for future drags
      tasks.length = 0;
      tasks.push(...updatedTasks);
    });
  });
}

renderTasks = function renderTasksFn(tasks) {
  let currentMinutes = 9 * 60; // Start at 9 AM
  const taskList = document.getElementById('taskList');

  taskList.innerHTML = tasks.map((task, index) => {
    const startTime = formatTimeLong(currentMinutes);
    const duration = parseTimeToMinutes(task.time);
    currentMinutes += duration;

    return `
            <div class="task-row${task.completed ? ' completed' : ''}" draggable="true" data-index="${index}">
                <div class="drag-handle">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
                <div class="task-status${task.completed ? ' completed' : ''}"></div>
                <div class="task-content">
                    <div class="task-text">${task.text}</div>
                </div>
                <span class="task-time">${task.time}</span>
                <span class="task-schedule">${startTime}</span>
            </div>
        `;
  }).join('');

  setupDragAndDrop(tasks);
};

// ============================================
// INITIALIZATION
// ============================================

async function init() {
  // Set date
  const now = new Date();
  const options = {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  };
  document.getElementById('reportDate').textContent = now.toLocaleDateString('en-US', options);

  // Show loading state
  document.getElementById('taskList').innerHTML = '<div class="empty-state">Loading tasks...</div>';

  // Load tasks from server
  const changelog = await loadChangelogFromServer();
  const tasks = replayChangelog(changelog);

  if (tasks.length === 0) {
    document.getElementById('taskList').innerHTML = '<div class="empty-state">No tasks scheduled for today</div>';
    document.getElementById('statsGrid').innerHTML = '';
    return;
  }

  renderStats(tasks);
  renderTasks(tasks);
}

// ============================================
// POLLING
// ============================================

async function pollForChanges() {
  if (isPolling) return;

  try {
    isPolling = true;
    const changelog = await loadChangelogFromServer();
    isPolling = false;

    // If there are new events, reload the page to recalculate stats
    if (changelog.length !== lastKnownEventCount) {
      lastKnownEventCount = changelog.length;
      window.location.reload();
    }
  } catch (error) {
    isPolling = false;
    // eslint-disable-next-line no-console
    console.error('Poll error:', error);
  }
}

// ============================================
// START
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
  await init();

  // Initialize polling with current event count
  lastKnownEventCount = loadChangelog().length;
  setInterval(pollForChanges, 5000);
});
