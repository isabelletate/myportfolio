// ============================================
// GOAL PLANNER - Personal goals with optional due dates
// ============================================

import {
    createEventStore,
    replayChangelogBase,
    getListIdFromUrl,
    addToRecentLists,
    createPoller,
    generateId
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
        completed: false
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
        }
    }

    return order.map(id => itemsMap.get(id)).filter(Boolean);
}

// ============================================
// STATE & DOM
// ============================================

let goals = [];
let draggedGoalId = null;

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

    const goal = { id, text, dueDate, completed: false };
    store.addEvent('added', { id, text, dueDate });
    goals.push(goal);

    addInput.value = '';
    addDueInput.value = '';
    renderGoals();
    updateProgress();
}

function toggleGoal(id) {
    const goal = goals.find(g => g.id == id);
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
            goals = goals.filter(g => g.id != id);
            renderGoals();
            updateProgress();
        }, 300);
    }
}

async function clearCompletedGoals() {
    const completed = goals.filter(g => g.completed);
    if (completed.length === 0) return;

    completed.forEach(goal => {
        const el = document.querySelector(`[data-id="${goal.id}"]`);
        if (el) el.classList.add('removing');
    });

    setTimeout(async () => {
        const ids = completed.map(g => g.id);
        const event = store.addEvent('clear_completed', { ids });
        await event._postPromise;
        goals = goals.filter(g => !g.completed);
        renderGoals();
        updateProgress();
    }, 300);
}

// ============================================
// RENDER
// ============================================

function updateProgress() {
    const total = goals.length;
    const done = goals.filter(g => g.completed).length;
    goalCount.textContent = total === 0 ? '0 goals' : `${total} goal${total === 1 ? '' : 's'}`;
    progressCount.textContent = `${done}/${total}`;
    progressFill.style.width = total ? `${(done / total) * 100}%` : '0%';
}

function createGoalHTML(goal) {
    const dueHtml = goal.dueDate
        ? `<span class="goal-due">${escapeHtml(goal.dueDate)}</span>`
        : '';
    return `
        <div class="goal-item ${goal.completed ? 'completed' : ''}" data-id="${goal.id}">
            <div class="goal-check" aria-label="Toggle complete"></div>
            <div class="goal-content">
                <span class="goal-text">${escapeHtml(goal.text)}</span>
                ${dueHtml}
            </div>
            <button class="goal-delete" aria-label="Delete goal">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 6L6 18M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </button>
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

    const active = goals.filter(g => !g.completed);
    const completed = goals.filter(g => g.completed);

    let html = '';
    if (active.length > 0) {
        html += `<div class="section-header"><span class="section-title">Active</span><span class="section-count">${active.length}</span><div class="section-line"></div></div>`;
        active.forEach(g => { html += createGoalHTML(g); });
    }
    if (completed.length > 0) {
        html += `<div class="section-header"><span class="section-title">Done</span><span class="section-count">${completed.length}</span><div class="section-line"></div></div>`;
        completed.forEach(g => { html += createGoalHTML(g); });
    }

    goalList.innerHTML = html;

    goalList.querySelectorAll('.goal-item').forEach(el => {
        const id = el.dataset.id;
        el.querySelector('.goal-check').addEventListener('click', (e) => {
            e.stopPropagation();
            toggleGoal(id);
        });
        el.addEventListener('click', (e) => {
            if (!e.target.closest('.goal-delete')) toggleGoal(id);
        });
        el.querySelector('.goal-delete').addEventListener('click', (e) => {
            e.stopPropagation();
            deleteGoal(id);
        });
    });
}

// ============================================
// POLLING
// ============================================

let lastGoalsHash = '';

function getGoalsHash() {
    return goals.map(g => `${g.id}:${g.text}:${g.completed}`).join('|');
}

async function pollForChanges() {
    if (store.getIsSyncing()) return;
    try {
        store.setIsSyncing(true);
        const changelog = await store.loadChangelogFromServer({ silent: true });
        store.setIsSyncing(false);
        const newGoals = replayChangelog(changelog);
        const newHash = getGoalsHash();
        const nextHash = newGoals.map(g => `${g.id}:${g.text}:${g.completed}`).join('|');
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
