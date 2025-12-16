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

// Default tasks for office environment
const defaultTasks = [
    { text: 'Check emails', time: '15m' },
    { text: 'Process incoming shipments', time: '45m' },
    { text: 'Update tracking spreadsheet', time: '30m' },
    { text: 'Schedule outbound pickups', time: '20m' },
    { text: 'Verify package labels', time: '30m' },
    { text: 'Follow up on delayed deliveries', time: '30m' },
];

// State
let tasks = [];
let selectedTime = '1h';
let draggedItem = null;

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
    const saved = localStorage.getItem('grizzTasks');
    const savedDate = localStorage.getItem('grizzTasksDate');
    const today = new Date().toDateString();

    if (saved && savedDate === today) {
        tasks = JSON.parse(saved);
    } else {
        // New day - reset with default tasks
        tasks = defaultTasks.map((t, i) => ({
            id: Date.now() + i,
            text: t.text,
            time: t.time,
            completed: false,
            color: colors[i % colors.length]
        }));
        saveTasks();
    }
}

function saveTasks() {
    localStorage.setItem('grizzTasks', JSON.stringify(tasks));
    localStorage.setItem('grizzTasksDate', new Date().toDateString());
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

    submitBtn.addEventListener('click', addTask);
    taskInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addTask();
    });
}

function openModal() {
    modal.classList.add('active');
    taskInput.value = '';
    taskInput.focus();
}

function closeModal() {
    modal.classList.remove('active');
}

function addTask() {
    const text = taskInput.value.trim();
    if (!text) return;

    const task = {
        id: Date.now(),
        text,
        time: selectedTime,
        completed: false,
        color: colors[Math.floor(Math.random() * colors.length)]
    };

    tasks.unshift(task);
    saveTasks();
    renderTasks();
    closeModal();
}

function deleteTask(id) {
    const taskEl = document.querySelector(`[data-id="${id}"]`);
    taskEl.style.transform = 'translateX(100%)';
    taskEl.style.opacity = '0';
    
    setTimeout(() => {
        tasks = tasks.filter(t => t.id !== id);
        saveTasks();
        renderTasks();
    }, 300);
}

function toggleTask(id) {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    task.completed = !task.completed;
    saveTasks();
    renderTasks();

    if (task.completed) {
        showEncouragement();
        createConfetti();
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
    const timeline = document.getElementById('timeline');
    taskList.innerHTML = '';
    timeline.innerHTML = '';
    
    if (tasks.length === 0) {
        taskList.innerHTML = `
            <div class="empty-state">
                <div class="empty-emoji">🐻</div>
                <p class="empty-text">No tasks yet! Add one below.</p>
            </div>
        `;
        updateProgress();
        return;
    }

    // Keep tasks in their original order
    const sortedTasks = [...tasks];

    // Start at 9am (9 * 60 = 540 minutes from midnight)
    let currentMinutes = 9 * 60;

    sortedTasks.forEach((task, index) => {
        const el = document.createElement('div');
        el.className = `task-item${task.completed ? ' completed' : ''}`;
        el.dataset.id = task.id;
        el.style.setProperty('--task-color', task.color);
        el.style.animationDelay = `${index * 0.05}s`;
        el.draggable = true;

        el.innerHTML = `
            <div class="drag-handle">
                <span></span>
                <span></span>
                <span></span>
            </div>
            <div class="checkbox ${task.completed ? 'checked' : ''}" data-task-id="${task.id}">
                <svg viewBox="0 0 24 24">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
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

        taskList.appendChild(el);

        // Add timeline marker for all tasks
        const marker = document.createElement('div');
        marker.className = 'timeline-marker' + (task.completed ? ' completed' : '');
        marker.innerHTML = `
            <div class="timeline-time">${formatTime(currentMinutes)}</div>
            <div class="timeline-dot"></div>
        `;
        timeline.appendChild(marker);

        // Add duration to current time
        currentMinutes += parseTimeToMinutes(task.time);
    });

    // Add end time marker
    const endMarker = document.createElement('div');
    endMarker.className = 'timeline-marker timeline-end';
    endMarker.innerHTML = `
        <div class="timeline-time">${formatTime(currentMinutes)}</div>
    `;
    timeline.appendChild(endMarker);

    // Check if all done
    const allDone = tasks.length > 0 && tasks.every(t => t.completed);
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
        tasks.find(t => t.id === parseInt(el.dataset.id))
    ).filter(Boolean);
    
    tasks = newOrder;
    saveTasks();
}

// Poll localStorage for external changes every 2 seconds
let lastKnownData = null;

function pollForChanges() {
    const currentData = localStorage.getItem('grizzTasks');
    
    if (lastKnownData !== null && currentData !== lastKnownData) {
        // Data changed externally, reload tasks
        const savedDate = localStorage.getItem('grizzTasksDate');
        const today = new Date().toDateString();
        
        if (savedDate === today && currentData) {
            tasks = JSON.parse(currentData);
            renderTasks();
        }
    }
    
    lastKnownData = currentData;
}

// Start the app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    init();
    
    // Initialize polling
    lastKnownData = localStorage.getItem('grizzTasks');
    setInterval(pollForChanges, 2000);
    
    // Signal JS is loaded and check if ready to show
    if (window.__loadState) {
        window.__loadState.js = true;
        if (window.checkReady) window.checkReady();
    }
});

