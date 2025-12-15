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
let touchCurrentY = 0;
let touchElement = null;

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
        return;
    }

    // Sort: uncompleted first, then completed
    const sortedTasks = [...tasks].sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        return tasks.indexOf(a) - tasks.indexOf(b);
    });

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
    });

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
    this.classList.add('dragging');
}

function handleTouchMove(e) {
    if (!touchElement) return;
    e.preventDefault();
    
    touchCurrentY = e.touches[0].clientY;
    const deltaY = touchCurrentY - touchStartY;
    
    touchElement.style.transform = `translateY(${deltaY}px)`;
    
    // Find element to swap with
    const items = [...document.querySelectorAll('.task-item:not(.dragging)')];
    for (const item of items) {
        const rect = item.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        
        if (touchCurrentY < midY && item.previousElementSibling === touchElement) {
            taskList.insertBefore(touchElement, item);
            touchStartY = touchCurrentY;
            touchElement.style.transform = '';
            break;
        } else if (touchCurrentY > midY && item.nextElementSibling === touchElement) {
            taskList.insertBefore(touchElement, item.nextSibling);
            touchStartY = touchCurrentY;
            touchElement.style.transform = '';
            break;
        }
    }
}

function handleTouchEnd() {
    if (!touchElement) return;
    
    touchElement.classList.remove('dragging');
    touchElement.style.transform = '';
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

// Start the app when DOM is ready
document.addEventListener('DOMContentLoaded', init);

