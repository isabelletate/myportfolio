// ============================================
// PLANNER - Main Interactive Task View
// ============================================

import {
    loadChangelogFromServer,
    loadChangelog,
    addEvent,
    postEvent,
    replayChangelog,
    saveChangelogLocal,
    initializeDefaultTasks,
    parseTimeToMinutes,
    formatTimeShort as formatTime,
    colors,
    getIsSyncing,
    setIsSyncing,
    getChangelogCache
} from './shared.js';

// ============================================
// CONSTANTS
// ============================================

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

const enjoymentEmojis = ['🤮', '😕', '😐', '🙂', '😍'];

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

// ============================================
// SCORING
// ============================================

function calculateTaskScore(task) {
    const basePoints = timePoints[task.time] || 400;
    const enjoyment = task.enjoyment !== undefined ? task.enjoyment : 2;
    const multiplier = enjoymentMultipliers[enjoyment];
    return Math.round(basePoints * multiplier);
}

function calculateTotalScore() {
    return tasks
        .filter(t => t.completed)
        .reduce((sum, task) => sum + calculateTaskScore(task), 0);
}

// ============================================
// STATE
// ============================================

let tasks = [];
let selectedTime = '1h';
let selectedEnjoyment = 2;
let draggedItem = null;
let displayedScore = 0;
let isDragging = false;
let lastKnownEventCount = 0;
let pollInterval = null;

// Touch drag state
let touchStartY = 0;
let touchElement = null;
let touchClone = null;
let touchPlaceholder = null;

// ============================================
// DOM ELEMENTS
// ============================================

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

// ============================================
// INITIALIZATION
// ============================================

async function init() {
    updateDate();
    setupEventListeners();
    
    taskList.innerHTML = `
        <div class="loading-state">
            <div class="loading-spinner"></div>
            <p>Loading tasks...</p>
        </div>
    `;
    
    await loadTasks();
    renderTasks();
}

function updateDate() {
    const now = new Date();
    const options = { weekday: 'long', month: 'long', day: 'numeric' };
    document.getElementById('dateDisplay').textContent = now.toLocaleDateString('en-US', options);
}

async function loadTasks() {
    let changelog = await loadChangelogFromServer();
    
    if (changelog.length === 0) {
        changelog = await initializeDefaultTasks();
    }
    
    tasks = replayChangelog(changelog);
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

// ============================================
// MODAL
// ============================================

function openModal() {
    modal.classList.add('active');
    taskInput.value = '';
    taskInput.focus();
    
    selectedEnjoyment = 2;
    document.querySelectorAll('.enjoyment-option').forEach(b => b.classList.remove('selected'));
    document.querySelector('.enjoyment-option[data-value="2"]').classList.add('selected');
}

function closeModal() {
    modal.classList.remove('active');
}

// ============================================
// TASK OPERATIONS
// ============================================

function addTask() {
    const text = taskInput.value.trim();
    if (!text) return;

    const id = Date.now();
    const color = colors[Math.floor(Math.random() * colors.length)];
    const time = selectedTime;
    const enjoyment = selectedEnjoyment;
    
    const task = { id, text, time, color, completed: false, enjoyment };
    
    addEvent('added', { id, text, time, color, enjoyment });
    tasks.push(task);
    
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
        addEvent('removed', { id });
        tasks = tasks.filter(t => t.id !== id);
        taskEl.remove();
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
    
    addEvent(wasCompleted ? 'uncompleted' : 'completed', { id });
    task.completed = !wasCompleted;
    
    taskEl.classList.toggle('completed', task.completed);
    checkbox.classList.toggle('checked', task.completed);

    if (!wasCompleted) {
        const points = calculateTaskScore(task);
        showScorePopup(taskEl, points);
        
        setTimeout(() => {
            const newTotal = calculateTotalScore();
            animateScore(newTotal);
        }, 150);
        
        showEncouragement();
        createConfetti();
    } else {
        const newTotal = calculateTotalScore();
        animateScore(newTotal, 300);
    }

    updateProgress();
}

// ============================================
// TASK ELEMENT CREATION
// ============================================

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

    el.querySelector('.checkbox').addEventListener('click', () => toggleTask(task.id));
    el.querySelector('.delete-btn').addEventListener('click', () => deleteTask(task.id));

    el.addEventListener('dragstart', handleDragStart);
    el.addEventListener('dragend', handleDragEnd);
    el.addEventListener('dragover', handleDragOver);
    el.addEventListener('drop', handleDrop);

    el.addEventListener('touchstart', handleTouchStart, { passive: false });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd);

    return el;
}

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

function appendTaskElement(task) {
    const emptyState = taskList.querySelector('.empty-state');
    if (emptyState) emptyState.remove();
    
    const allDone = taskList.querySelector('.all-done');
    if (allDone) allDone.remove();
    
    const startTime = calculateStartTime(tasks.length - 1);
    taskList.appendChild(createTimeDivider(startTime));
    
    const el = createTaskElement(task, tasks.length - 1);
    taskList.appendChild(el);
}

// ============================================
// TIME CALCULATIONS
// ============================================

function calculateStartTime(index) {
    let currentMinutes = 9 * 60;
    for (let i = 0; i < index; i++) {
        currentMinutes += parseTimeToMinutes(tasks[i].time);
    }
    return formatTime(currentMinutes);
}

function updateStartTimes() {
    taskList.querySelectorAll('.time-divider').forEach(el => el.remove());
    
    if (tasks.length === 0) return;
    
    let currentMinutes = 9 * 60;
    
    tasks.forEach(task => {
        const taskEl = document.querySelector(`[data-id="${task.id}"]`);
        if (taskEl) {
            const divider = createTimeDivider(formatTime(currentMinutes));
            taskEl.parentNode.insertBefore(divider, taskEl);
        }
        currentMinutes += parseTimeToMinutes(task.time);
    });
    
    const allDoneEl = taskList.querySelector('.all-done');
    const endDivider = createTimeDivider(formatTime(currentMinutes));
    if (allDoneEl) {
        taskList.insertBefore(endDivider, allDoneEl);
    } else {
        taskList.appendChild(endDivider);
    }
}

// ============================================
// UI FEEDBACK
// ============================================

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

function animateScore(targetScore, duration = 600) {
    const startScore = displayedScore;
    const diff = targetScore - startScore;
    const startTime = performance.now();
    
    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
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

    if (total > 0 && completed === total) {
        setTimeout(() => {
            for (let i = 0; i < 3; i++) {
                setTimeout(() => createConfetti(), i * 200);
            }
        }, 300);
    }
}

// ============================================
// RENDERING
// ============================================

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

    let currentMinutes = 9 * 60;
    tasks.forEach((task, index) => {
        const startTime = formatTime(currentMinutes);
        taskList.appendChild(createTimeDivider(startTime));
        
        const el = createTaskElement(task, index);
        taskList.appendChild(el);
        
        currentMinutes += parseTimeToMinutes(task.time);
    });
    
    taskList.appendChild(createTimeDivider(formatTime(currentMinutes)));

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

// ============================================
// DRAG AND DROP - DESKTOP
// ============================================

function handleDragStart(e) {
    draggedItem = this;
    isDragging = true;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd() {
    this.classList.remove('dragging');
    
    if (isDragging && draggedItem) {
        updateTaskOrder();
    }
    
    draggedItem = null;
    isDragging = false;
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
}

function handleDrop(e) {
    e.preventDefault();
    if (isDragging) {
        isDragging = false;
        updateTaskOrder();
    }
}

// ============================================
// DRAG AND DROP - TOUCH
// ============================================

function handleTouchStart(e) {
    if (!e.target.closest('.drag-handle')) return;
    
    touchElement = this;
    isDragging = true;
    touchStartY = e.touches[0].clientY;
    
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
    
    const originalRect = touchPlaceholder.getBoundingClientRect();
    touchClone.style.top = (originalRect.top + deltaY) + 'px';
    
    const items = [...document.querySelectorAll('.task-item:not([style*="opacity: 0"])')];
    
    for (const item of items) {
        if (item === touchElement) continue;
        
        const rect = item.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        
        if (touchY < midY && touchPlaceholder.nextElementSibling !== item) {
            if (item.previousElementSibling !== touchPlaceholder) {
                taskList.insertBefore(touchPlaceholder, item);
                taskList.insertBefore(touchElement, touchPlaceholder.nextElementSibling);
            }
            break;
        } else if (touchY > midY && touchY < rect.bottom) {
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
    
    if (touchClone) {
        touchClone.remove();
        touchClone = null;
    }
    
    if (touchPlaceholder) {
        touchPlaceholder.remove();
        touchPlaceholder = null;
    }
    
    touchElement.style.opacity = '';
    touchElement.style.height = '';
    touchElement.style.margin = '';
    touchElement.style.padding = '';
    touchElement.style.overflow = '';
    
    if (isDragging) {
        isDragging = false;
        updateTaskOrder();
    }
    touchElement = null;
}

// ============================================
// TASK ORDER
// ============================================

async function updateTaskOrder() {
    const newOrder = [...document.querySelectorAll('.task-item')].map(el => 
        parseInt(el.dataset.id)
    ).filter(Boolean);
    
    tasks = newOrder.map(id => tasks.find(t => t.id === id)).filter(Boolean);
    updateStartTimes();
    
    await addEvent('reorder', { order: newOrder });
    lastKnownEventCount = loadChangelog().length;
}

// ============================================
// POLLING
// ============================================

async function pollForChanges() {
    if (getIsSyncing() || isDragging) return;
    
    try {
        setIsSyncing(true);
        const changelog = await loadChangelogFromServer();
        setIsSyncing(false);
        
        if (changelog.length > lastKnownEventCount) {
            lastKnownEventCount = changelog.length;
            
            const oldTaskIds = tasks.map(t => t.id).join(',');
            const oldCompletedIds = tasks.filter(t => t.completed).map(t => t.id).join(',');
            
            tasks = replayChangelog(changelog);
            
            const newTaskIds = tasks.map(t => t.id).join(',');
            const newCompletedIds = tasks.filter(t => t.completed).map(t => t.id).join(',');
            
            if (oldTaskIds !== newTaskIds) {
                renderTasks();
            } else if (oldCompletedIds !== newCompletedIds) {
                tasks.forEach(task => {
                    const el = document.querySelector(`[data-id="${task.id}"]`);
                    if (el) {
                        el.classList.toggle('completed', task.completed);
                        el.querySelector('.checkbox').classList.toggle('checked', task.completed);
                    }
                });
                updateStartTimes();
                updateProgress();
                updateScoreDisplay();
            }
        }
    } catch (error) {
        setIsSyncing(false);
        console.error('Poll error:', error);
    }
}

// ============================================
// START
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    await init();
    
    lastKnownEventCount = loadChangelog().length;
    pollInterval = setInterval(pollForChanges, 5000);
    
    if (window.__loadState) {
        window.__loadState.js = true;
        if (window.checkReady) window.checkReady();
    }
});
