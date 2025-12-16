// Task colors
const colors = [
    '#ff6b35', // orange
    '#00d9c0', // teal
    '#ff2e63', // pink
    '#ffc93c', // yellow
    '#a855f7', // purple
    '#4ade80', // green
    '#38bdf8', // blue
];

// Encouragement messages
const encouragements = [
    { emoji: '🎉', text: 'Amazing work!' },
    { emoji: '🚀', text: "You're on fire!" },
    { emoji: '💪', text: 'Crushing it!' },
    { emoji: '⭐', text: 'Superstar!' },
    { emoji: '🏆', text: 'Champion!' },
    { emoji: '🌟', text: 'Brilliant!' },
    { emoji: '🔥', text: 'Unstoppable!' },
    { emoji: '✨', text: 'Fantastic!' },
    { emoji: '🎯', text: 'Bullseye!' },
    { emoji: '🙌', text: 'Keep going!' },
    { emoji: '💎', text: 'Pure gold!' },
    { emoji: '🐻', text: 'Bear-y good!' },
];

// Enjoyment scale (0-4, with 2 being neutral)
const enjoymentEmojis = ['🤮', '😕', '😐', '🙂', '😍'];

// Scoring system: short+loved=100, long+hated=10000
const timePoints = {
    '15m': 100,
    '30m': 200,
    '45m': 300,
    '1h': 400,
    '1.5h': 600,
    '2h': 800,
    '3h': 1200,
    '4h+': 1600
};

const enjoymentMultipliers = {
    0: 6,    // 🤮 hated - 6x points
    1: 4,    // 😕 dislike - 4x points
    2: 2.5,  // 😐 neutral - 2.5x points
    3: 1.5,  // 🙂 like - 1.5x points
    4: 1     // 😍 loved - 1x points
};

function calculateTaskScore(task) {
    const basePoints = timePoints[task.time] || 400;
    const enjoyment = task.enjoyment !== undefined ? task.enjoyment : 2;
    const multiplier = enjoymentMultipliers[enjoyment];
    return Math.round(basePoints * multiplier);
}

// Default tasks for office environment
const defaultTasks = [
    { text: 'Check emails', time: '15m' },
    { text: 'Process incoming shipments', time: '45m' },
    { text: 'Update tracking spreadsheet', time: '30m' },
    { text: 'Schedule outbound pickups', time: '20m' },
    { text: 'Verify package labels', time: '30m' },
    { text: 'Follow up on delayed deliveries', time: '30m' },
];

// ============================================
// EVENT SOURCING - Changelog Management
// ============================================

const STORAGE_KEY = 'grizzChangelog';
const DATE_KEY = 'grizzChangelogDate';

// Get current UTC timestamp as ISO8601
function timestamp() {
    return new Date().toISOString();
}

// Load changelog from localStorage
function loadChangelog() {
    const saved = localStorage.getItem(STORAGE_KEY);
    const savedDate = localStorage.getItem(DATE_KEY);
    const today = new Date().toDateString();
    
    if (saved && savedDate === today) {
        return JSON.parse(saved);
    }
    return [];
}

// Save changelog to localStorage
function saveChangelog(changelog) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(changelog));
    localStorage.setItem(DATE_KEY, new Date().toDateString());
}

// Add an event to the changelog
function addEvent(op, data) {
    const changelog = loadChangelog();
    const event = {
        ts: timestamp(),
        op,
        ...data
    };
    changelog.push(event);
    saveChangelog(changelog);
    return event;
}

// Merge changelogs from multiple sources (dedupes by timestamp)
function mergeChangelogs(local, remote) {
    const seen = new Set();
    const merged = [];
    
    [...local, ...remote].forEach(event => {
        if (!seen.has(event.ts)) {
            seen.add(event.ts);
            merged.push(event);
        }
    });
    
    // Sort by timestamp
    merged.sort((a, b) => a.ts.localeCompare(b.ts));
    return merged;
}

// Replay changelog to build current task state
function replayChangelog(changelog) {
    const tasksMap = new Map(); // id -> task
    const order = []; // maintains order of task ids
    
    // Sort events by timestamp to ensure correct chronological order
    const sortedEvents = [...changelog].sort((a, b) => a.ts.localeCompare(b.ts));
    
    for (const event of sortedEvents) {
        switch (event.op) {
            case 'added':
                tasksMap.set(event.id, {
                    id: event.id,
                    text: event.text,
                    time: event.time,
                    color: event.color,
                    completed: false,
                    enjoyment: event.enjoyment !== undefined ? event.enjoyment : 2
                });
                order.push(event.id);
                break;
                
            case 'removed':
                tasksMap.delete(event.id);
                const removeIdx = order.indexOf(event.id);
                if (removeIdx > -1) order.splice(removeIdx, 1);
                break;
                
            case 'completed':
                if (tasksMap.has(event.id)) {
                    tasksMap.get(event.id).completed = true;
                }
                break;
                
            case 'uncompleted':
                if (tasksMap.has(event.id)) {
                    tasksMap.get(event.id).completed = false;
                }
                break;
                
            case 'moved':
                // Remove from current position
                const moveIdx = order.indexOf(event.id);
                if (moveIdx > -1) order.splice(moveIdx, 1);
                
                // Insert at new position
                if (event.toIndex !== undefined) {
                    order.splice(event.toIndex, 0, event.id);
                } else if (event.afterId !== undefined) {
                    const afterIdx = order.indexOf(event.afterId);
                    order.splice(afterIdx + 1, 0, event.id);
                } else {
                    order.push(event.id);
                }
                break;
                
            case 'reorder':
                // Full reorder - replace order array
                order.length = 0;
                order.push(...event.order.filter(id => tasksMap.has(id)));
                break;
                
            case 'enjoyment':
                if (tasksMap.has(event.id)) {
                    tasksMap.get(event.id).enjoyment = event.value;
                }
                break;
        }
    }
    
    // Build final task array in order
    return order.map(id => tasksMap.get(id)).filter(Boolean);
}

// Initialize default tasks as events
function initializeDefaultTasks() {
    const changelog = [];
    defaultTasks.forEach((t, i) => {
        changelog.push({
            ts: new Date(Date.now() + i).toISOString(), // Ensure unique timestamps
            op: 'added',
            id: Date.now() + i,
            text: t.text,
            time: t.time,
            color: colors[i % colors.length]
        });
    });
    saveChangelog(changelog);
    return changelog;
}

// ============================================
// END EVENT SOURCING
// ============================================

// State
let tasks = [];
let selectedTime = '1h';
let selectedEnjoyment = 2; // Default to neutral
let draggedItem = null;
let displayedScore = 0; // Current displayed score for animation

// DOM elements
const taskList = document.getElementById('taskList');
const modal = document.getElementById('modal');
const addBtn = document.getElementById('addBtn');
const taskInput = document.getElementById('taskInput');
const submitBtn = document.getElementById('submitBtn');
const progressFill = document.getElementById('progressFill');
const progressCount = document.getElementById('progressCount');
const encouragement = document.getElementById('encouragement');
const confettiContainer = document.getElementById('confetti');
const scoreValue = document.getElementById('scoreValue');

// Touch drag state
let touchStartY = 0;
let touchElement = null;
let touchClone = null;
let touchPlaceholder = null;

// Initialize
function init() {
    updateDate();
    loadTasks();
    setupEventListeners();
    renderTasks();
}

function updateDate() {
    const now = new Date();
    const options = { weekday: 'long', month: 'long', day: 'numeric' };
    document.getElementById('dateDisplay').textContent = now.toLocaleDateString('en-US', options);
}

function loadTasks() {
    let changelog = loadChangelog();
    
    if (changelog.length === 0) {
        // New day or first run - initialize with default tasks
        changelog = initializeDefaultTasks();
    }
    
    tasks = replayChangelog(changelog);
}

function saveTasks() {
    // This is now a no-op - events are saved individually
    // Kept for compatibility with existing code patterns
}

function setupEventListeners() {
    addBtn.addEventListener('click', openModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    document.querySelectorAll('.time-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            selectedTime = btn.dataset.time;
        });
    });
    
    document.querySelectorAll('.enjoyment-option').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.enjoyment-option').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            selectedEnjoyment = parseInt(btn.dataset.value);
        });
    });

    submitBtn.addEventListener('click', addTask);
    taskInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addTask();
    });
}

function openModal() {
    modal.classList.add('active');
    taskInput.value = '';
    taskInput.focus();
    
    // Reset enjoyment to neutral
    selectedEnjoyment = 2;
    document.querySelectorAll('.enjoyment-option').forEach(b => b.classList.remove('selected'));
    document.querySelector('.enjoyment-option[data-value="2"]').classList.add('selected');
}

function closeModal() {
    modal.classList.remove('active');
}

// Create a task element without appending it
function createTaskElement(task, index = 0) {
    const el = document.createElement('div');
    el.className = `task-item${task.completed ? ' completed' : ''}`;
    el.dataset.id = task.id;
    el.style.setProperty('--task-color', task.color);
    el.style.animationDelay = `${index * 0.05}s`;
    el.draggable = true;
    
    const enjoyment = task.enjoyment !== undefined ? task.enjoyment : 2;
    const enjoymentEmoji = enjoymentEmojis[enjoyment];

    el.innerHTML = `
        <div class="drag-handle">
            <span></span>
            <span></span>
            <span></span>
        </div>
        <div class="checkbox-wrapper">
            <span class="enjoyment-badge">${enjoymentEmoji}</span>
            <div class="checkbox ${task.completed ? 'checked' : ''}" data-task-id="${task.id}">
                <svg viewBox="0 0 24 24">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
            </div>
        </div>
        <div class="task-content">
            <div class="task-text">${task.text}</div>
            <span class="task-time">${task.time}</span>
        </div>
        <button class="delete-btn" data-delete-id="${task.id}">
            <svg viewBox="0 0 24 24" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        </button>
    `;

    // Checkbox click handler
    el.querySelector('.checkbox').addEventListener('click', () => toggleTask(task.id));
    
    // Delete button handler
    el.querySelector('.delete-btn').addEventListener('click', () => deleteTask(task.id));

    // Drag events
    el.addEventListener('dragstart', handleDragStart);
    el.addEventListener('dragend', handleDragEnd);
    el.addEventListener('dragover', handleDragOver);
    el.addEventListener('drop', handleDrop);

    // Touch events for mobile
    el.addEventListener('touchstart', handleTouchStart, { passive: false });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd);

    return el;
}

// Create a time divider element
function createTimeDivider(time) {
    const el = document.createElement('div');
    el.className = 'time-divider';
    el.innerHTML = `
        <div class="time-divider-line"></div>
        <span class="time-divider-time">${time}</span>
        <div class="time-divider-line"></div>
    `;
    return el;
}

// Append a single task element to the list
function appendTaskElement(task) {
    // Remove empty state if present
    const emptyState = taskList.querySelector('.empty-state');
    if (emptyState) emptyState.remove();
    
    // Remove "all done" state if present
    const allDone = taskList.querySelector('.all-done');
    if (allDone) allDone.remove();
    
    // Calculate start time for this task
    const startTime = calculateStartTime(tasks.length - 1);
    
    // Add time divider before the task
    taskList.appendChild(createTimeDivider(startTime));
    
    const el = createTaskElement(task, tasks.length - 1);
    taskList.appendChild(el);
}

// Calculate start time for a task at given index
function calculateStartTime(index) {
    let currentMinutes = 9 * 60; // Start at 9am
    for (let i = 0; i < index; i++) {
        currentMinutes += parseTimeToMinutes(tasks[i].time);
    }
    return formatTime(currentMinutes);
}

// Update time dividers to reflect current task order
function updateStartTimes() {
    // Remove all existing time dividers
    taskList.querySelectorAll('.time-divider').forEach(el => el.remove());
    
    if (tasks.length === 0) return;
    
    let currentMinutes = 9 * 60; // Start at 9am
    
    // Insert dividers before each task
    tasks.forEach(task => {
        const taskEl = document.querySelector(`[data-id="${task.id}"]`);
        if (taskEl) {
            const divider = createTimeDivider(formatTime(currentMinutes));
            taskEl.parentNode.insertBefore(divider, taskEl);
        }
        currentMinutes += parseTimeToMinutes(task.time);
    });
    
    // Add final divider at the end (before all-done if present, or at end)
    const allDoneEl = taskList.querySelector('.all-done');
    const endDivider = createTimeDivider(formatTime(currentMinutes));
    if (allDoneEl) {
        taskList.insertBefore(endDivider, allDoneEl);
    } else {
        taskList.appendChild(endDivider);
    }
}

function addTask() {
    const text = taskInput.value.trim();
    if (!text) return;

    const id = Date.now();
    const color = colors[Math.floor(Math.random() * colors.length)];
    const time = selectedTime;
    const enjoyment = selectedEnjoyment;
    
    // Create task object
    const task = { id, text, time, color, completed: false, enjoyment };
    
    // Emit added event
    addEvent('added', { id, text, time, color, enjoyment });
    
    // Update local state
    tasks.push(task);
    
    // Append new task element (no full re-render)
    appendTaskElement(task);
    updateStartTimes();
    updateProgress();
    
    closeModal();
}

function deleteTask(id) {
    const taskEl = document.querySelector(`[data-id="${id}"]`);
    
    taskEl.style.transform = 'translateX(100%)';
    taskEl.style.opacity = '0';
    
    setTimeout(() => {
        // Emit removed event
        addEvent('removed', { id });
        
        // Update local state
        tasks = tasks.filter(t => t.id !== id);
        
        // Remove element from DOM
        taskEl.remove();
        
        // Update start times and progress
        updateStartTimes();
        updateProgress();
    }, 300);
}

function toggleTask(id) {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    const wasCompleted = task.completed;
    const taskEl = document.querySelector(`[data-id="${id}"]`);
    const checkbox = taskEl.querySelector('.checkbox');
    
    // Emit completed or uncompleted event
    addEvent(wasCompleted ? 'uncompleted' : 'completed', { id });
    
    // Update local state
    task.completed = !wasCompleted;
    
    // Update DOM directly (no full re-render)
    taskEl.classList.toggle('completed', task.completed);
    checkbox.classList.toggle('checked', task.completed);

    if (!wasCompleted) {
        // Task just completed - show score popup and animate
        const points = calculateTaskScore(task);
        showScorePopup(taskEl, points);
        
        setTimeout(() => {
            const newTotal = calculateTotalScore();
            animateScore(newTotal);
        }, 150);
        
        showEncouragement();
        createConfetti();
    } else {
        // Task uncompleted - update score without popup
        const newTotal = calculateTotalScore();
        animateScore(newTotal, 300);
    }

    updateProgress();
}


function showEncouragement() {
    const msg = encouragements[Math.floor(Math.random() * encouragements.length)];
    document.getElementById('encourageEmoji').textContent = msg.emoji;
    document.getElementById('encourageText').textContent = msg.text;
    encouragement.classList.add('show');

    setTimeout(() => {
        encouragement.classList.remove('show');
    }, 1500);
}

function createConfetti() {
    const confettiColors = ['#ff6b35', '#00d9c0', '#ff2e63', '#ffc93c', '#a855f7', '#4ade80'];
    
    for (let i = 0; i < 30; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti';
        confetti.style.left = Math.random() * 100 + '%';
        confetti.style.background = confettiColors[Math.floor(Math.random() * confettiColors.length)];
        confetti.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
        confetti.style.width = (Math.random() * 8 + 5) + 'px';
        confetti.style.height = (Math.random() * 8 + 5) + 'px';
        confetti.style.animationDuration = (Math.random() * 2 + 2) + 's';
        confetti.style.animationDelay = Math.random() * 0.5 + 's';
        
        confettiContainer.appendChild(confetti);
        
        setTimeout(() => confetti.remove(), 3500);
    }
}

// Calculate total score from completed tasks
function calculateTotalScore() {
    return tasks
        .filter(t => t.completed)
        .reduce((sum, task) => sum + calculateTaskScore(task), 0);
}

// Animate score counter from current to target
function animateScore(targetScore, duration = 600) {
    const startScore = displayedScore;
    const diff = targetScore - startScore;
    const startTime = performance.now();
    
    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Ease out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        const currentScore = Math.round(startScore + diff * eased);
        
        scoreValue.textContent = currentScore.toLocaleString();
        displayedScore = currentScore;
        
        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            scoreValue.classList.remove('bump');
        }
    }
    
    if (diff > 0) {
        scoreValue.classList.add('bump');
    }
    requestAnimationFrame(update);
}

// Show floating score popup at element position
function showScorePopup(element, points) {
    const rect = element.getBoundingClientRect();
    const popup = document.createElement('div');
    popup.className = 'score-popup';
    popup.textContent = `+${points.toLocaleString()}`;
    popup.style.left = `${rect.left + rect.width / 2}px`;
    popup.style.top = `${rect.top}px`;
    document.body.appendChild(popup);
    
    popup.addEventListener('animationend', () => popup.remove());
}

// Update score display (without animation, for initial load)
function updateScoreDisplay() {
    const totalScore = calculateTotalScore();
    displayedScore = totalScore;
    scoreValue.textContent = totalScore.toLocaleString();
}

function updateProgress() {
    const total = tasks.length;
    const completed = tasks.filter(t => t.completed).length;
    const percent = total > 0 ? (completed / total) * 100 : 0;
    
    progressFill.style.width = percent + '%';
    progressCount.textContent = `${completed}/${total}`;

    // All done celebration
    if (total > 0 && completed === total) {
        setTimeout(() => {
            for (let i = 0; i < 3; i++) {
                setTimeout(() => createConfetti(), i * 200);
            }
        }, 300);
    }
}

// Parse time string to minutes
function parseTimeToMinutes(timeStr) {
    const str = timeStr.toLowerCase().trim();
    let minutes = 0;
    
    // Match hours (e.g., "2h", "1.5h")
    const hourMatch = str.match(/([\d.]+)\s*h/);
    if (hourMatch) {
        minutes += parseFloat(hourMatch[1]) * 60;
    }
    
    // Match minutes (e.g., "30m", "15m")
    const minMatch = str.match(/(\d+)\s*m/);
    if (minMatch) {
        minutes += parseInt(minMatch[1]);
    }
    
    // If just a number, assume minutes
    if (!hourMatch && !minMatch) {
        const numMatch = str.match(/(\d+)/);
        if (numMatch) minutes = parseInt(numMatch[1]);
    }
    
    return minutes || 30; // Default to 30 min
}

// Format minutes from start of day to time string
function formatTime(totalMinutes) {
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    const hour12 = hours > 12 ? hours - 12 : hours;
    const ampm = hours >= 12 ? 'p' : 'a';
    return `${hour12}:${mins.toString().padStart(2, '0')}${ampm}`;
}

function renderTasks() {
    taskList.innerHTML = '';
    
    if (tasks.length === 0) {
        taskList.innerHTML = `
            <div class="empty-state">
                <div class="empty-emoji">🐻</div>
                <p class="empty-text">No tasks yet! Add one below.</p>
            </div>
        `;
        updateProgress();
        updateScoreDisplay();
        return;
    }

    // Calculate start times and render all task elements with dividers
    let currentMinutes = 9 * 60; // Start at 9am
    tasks.forEach((task, index) => {
        // Add time divider before each task
        const startTime = formatTime(currentMinutes);
        taskList.appendChild(createTimeDivider(startTime));
        
        // Add task element
        const el = createTaskElement(task, index);
        taskList.appendChild(el);
        
        currentMinutes += parseTimeToMinutes(task.time);
    });
    
    // Add final time divider showing end time
    taskList.appendChild(createTimeDivider(formatTime(currentMinutes)));

    // Check if all done
    const allDone = tasks.every(t => t.completed);
    if (allDone) {
        const doneEl = document.createElement('div');
        doneEl.className = 'all-done';
        doneEl.innerHTML = `
            <div class="all-done-emoji">🎊🐻🎊</div>
            <div class="all-done-text">All done! You're amazing!</div>
        `;
        taskList.appendChild(doneEl);
    }

    updateProgress();
    updateScoreDisplay();
}

// Drag and drop handlers
function handleDragStart(e) {
    draggedItem = this;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd() {
    this.classList.remove('dragging');
    draggedItem = null;
    document.querySelectorAll('.drag-placeholder').forEach(p => p.remove());
}

function handleDragOver(e) {
    e.preventDefault();
    if (this === draggedItem) return;

    const rect = this.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    
    if (e.clientY < midY) {
        this.parentNode.insertBefore(draggedItem, this);
    } else {
        this.parentNode.insertBefore(draggedItem, this.nextSibling);
    }

    // Update task order
    updateTaskOrder();
}

function handleDrop(e) {
    e.preventDefault();
}

// Touch handlers for mobile drag
function handleTouchStart(e) {
    if (!e.target.closest('.drag-handle')) return;
    
    touchElement = this;
    touchStartY = e.touches[0].clientY;
    
    // Create a visual clone that follows the finger
    const rect = this.getBoundingClientRect();
    touchClone = this.cloneNode(true);
    touchClone.classList.add('touch-clone');
    touchClone.style.position = 'fixed';
    touchClone.style.left = rect.left + 'px';
    touchClone.style.top = rect.top + 'px';
    touchClone.style.width = rect.width + 'px';
    touchClone.style.zIndex = '1000';
    touchClone.style.opacity = '0.9';
    touchClone.style.pointerEvents = 'none';
    touchClone.style.boxShadow = '0 10px 30px rgba(0,0,0,0.3)';
    touchClone.style.transform = 'scale(1.02)';
    document.body.appendChild(touchClone);
    
    // Create placeholder in original position
    touchPlaceholder = document.createElement('div');
    touchPlaceholder.className = 'touch-placeholder';
    touchPlaceholder.style.height = rect.height + 'px';
    touchPlaceholder.style.background = 'rgba(255,255,255,0.1)';
    touchPlaceholder.style.borderRadius = '16px';
    touchPlaceholder.style.border = '2px dashed rgba(255,255,255,0.3)';
    touchPlaceholder.style.margin = '8px 0';
    
    this.style.opacity = '0';
    this.style.height = '0';
    this.style.margin = '0';
    this.style.padding = '0';
    this.style.overflow = 'hidden';
    this.parentNode.insertBefore(touchPlaceholder, this);
}

function handleTouchMove(e) {
    if (!touchElement || !touchClone) return;
    e.preventDefault();
    
    const touchY = e.touches[0].clientY;
    const deltaY = touchY - touchStartY;
    
    // Move the clone
    const originalRect = touchPlaceholder.getBoundingClientRect();
    touchClone.style.top = (originalRect.top + deltaY) + 'px';
    
    // Find the element we're hovering over
    const items = [...document.querySelectorAll('.task-item:not([style*="opacity: 0"])')];
    
    for (const item of items) {
        if (item === touchElement) continue;
        
        const rect = item.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        
        // Check if we should move the placeholder
        if (touchY < midY && touchPlaceholder.nextElementSibling !== item) {
            // Move placeholder before this item
            if (item.previousElementSibling !== touchPlaceholder) {
                taskList.insertBefore(touchPlaceholder, item);
                taskList.insertBefore(touchElement, touchPlaceholder.nextElementSibling);
            }
            break;
        } else if (touchY > midY && touchY < rect.bottom) {
            // Move placeholder after this item
            if (item.nextElementSibling !== touchPlaceholder) {
                if (item.nextElementSibling) {
                    taskList.insertBefore(touchPlaceholder, item.nextElementSibling);
                } else {
                    taskList.appendChild(touchPlaceholder);
                }
                taskList.insertBefore(touchElement, touchPlaceholder.nextElementSibling);
            }
            break;
        }
    }
}

function handleTouchEnd() {
    if (!touchElement) return;
    
    // Clean up clone
    if (touchClone) {
        touchClone.remove();
        touchClone = null;
    }
    
    // Clean up placeholder
    if (touchPlaceholder) {
        touchPlaceholder.remove();
        touchPlaceholder = null;
    }
    
    // Restore original element
    touchElement.style.opacity = '';
    touchElement.style.height = '';
    touchElement.style.margin = '';
    touchElement.style.padding = '';
    touchElement.style.overflow = '';
    
    updateTaskOrder();
    touchElement = null;
}

function updateTaskOrder() {
    const newOrder = [...document.querySelectorAll('.task-item')].map(el => 
        parseInt(el.dataset.id)
    ).filter(Boolean);
    
    // Emit reorder event with new order
    addEvent('reorder', { order: newOrder });
    
    // Update local tasks array to match new order
    tasks = newOrder.map(id => tasks.find(t => t.id === id)).filter(Boolean);
    
    // Update timeline to reflect new order
    updateStartTimes();
}

// Poll localStorage for external changes every 2 seconds
let lastKnownEventCount = 0;

function pollForChanges() {
    const changelog = loadChangelog();
    
    // If there are new events from external sources, re-render
    if (changelog.length > lastKnownEventCount) {
        const newEvents = changelog.slice(lastKnownEventCount);
        lastKnownEventCount = changelog.length;
        
        // Rebuild state and re-render only if needed
        const oldTaskIds = tasks.map(t => t.id).join(',');
        tasks = replayChangelog(changelog);
        const newTaskIds = tasks.map(t => t.id).join(',');
        
        // Only full re-render if structure changed significantly
        if (oldTaskIds !== newTaskIds) {
            renderTasks();
        } else {
            // Just update completion states and timeline
            tasks.forEach(task => {
                const el = document.querySelector(`[data-id="${task.id}"]`);
                if (el) {
                    el.classList.toggle('completed', task.completed);
                    el.querySelector('.checkbox').classList.toggle('checked', task.completed);
                }
            });
            updateStartTimes();
            updateProgress();
        }
    }
}

// Start the app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    init();
    
    // Initialize polling with current event count
    lastKnownEventCount = loadChangelog().length;
    setInterval(pollForChanges, 2000);
    
    // Signal JS is loaded and check if ready to show
    if (window.__loadState) {
        window.__loadState.js = true;
        if (window.checkReady) window.checkReady();
    }
});

