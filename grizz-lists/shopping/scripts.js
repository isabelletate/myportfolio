// ============================================
// SHOPPING LIST - Simple, Fast Grocery Lists
// ============================================

// Categories for organizing items
const categories = {
    produce: { name: 'Produce', emoji: '🥬', keywords: ['apple', 'banana', 'orange', 'tomato', 'lettuce', 'spinach', 'carrot', 'onion', 'garlic', 'potato', 'avocado', 'lemon', 'lime', 'grape', 'strawberry', 'blueberry', 'broccoli', 'cucumber', 'pepper', 'mushroom', 'celery', 'fruit', 'vegetable', 'salad'] },
    dairy: { name: 'Dairy', emoji: '🥛', keywords: ['milk', 'cheese', 'yogurt', 'butter', 'cream', 'egg', 'eggs'] },
    meat: { name: 'Meat & Seafood', emoji: '🥩', keywords: ['chicken', 'beef', 'pork', 'fish', 'salmon', 'shrimp', 'bacon', 'sausage', 'steak', 'turkey', 'ham'] },
    bakery: { name: 'Bakery', emoji: '🍞', keywords: ['bread', 'bagel', 'muffin', 'croissant', 'roll', 'bun', 'cake', 'pie', 'donut', 'pastry'] },
    frozen: { name: 'Frozen', emoji: '🧊', keywords: ['ice cream', 'frozen', 'pizza', 'popsicle'] },
    pantry: { name: 'Pantry', emoji: '🥫', keywords: ['rice', 'pasta', 'cereal', 'oatmeal', 'flour', 'sugar', 'oil', 'sauce', 'soup', 'beans', 'can', 'canned', 'nuts', 'peanut butter'] },
    beverages: { name: 'Beverages', emoji: '🥤', keywords: ['water', 'juice', 'soda', 'coffee', 'tea', 'beer', 'wine', 'drink'] },
    snacks: { name: 'Snacks', emoji: '🍿', keywords: ['chips', 'crackers', 'cookies', 'candy', 'chocolate', 'popcorn', 'pretzel', 'granola'] },
    household: { name: 'Household', emoji: '🧹', keywords: ['soap', 'detergent', 'paper', 'towel', 'tissue', 'trash', 'bag', 'cleaner', 'sponge'] },
    other: { name: 'Other', emoji: '📦', keywords: [] }
};

// Try to detect category from item text
function detectCategory(text) {
    const lower = text.toLowerCase();
    for (const [key, cat] of Object.entries(categories)) {
        if (cat.keywords.some(kw => lower.includes(kw))) {
            return key;
        }
    }
    return 'other';
}

// Parse quantity from item text (e.g., "2 apples", "1lb chicken")
function parseQuantity(text) {
    const match = text.match(/^(\d+(?:\.\d+)?)\s*(lb|lbs|oz|kg|g|pcs?|x)?\s+/i);
    if (match) {
        const qty = match[1] + (match[2] ? match[2] : '');
        const name = text.slice(match[0].length).trim();
        return { quantity: qty, name };
    }
    return { quantity: null, name: text };
}

// ============================================
// EVENT SOURCING - Server-Backed Storage
// ============================================

const API_BASE = 'https://sheet-logger.david8603.workers.dev/grizz.biz/grizz-lists';
const USER_EMAIL = 'test@testing.com';
const LIST_TYPE = 'shopping';

function getTodayDateKey() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getApiUrl() {
    return `${API_BASE}/${USER_EMAIL}/${LIST_TYPE}/${getTodayDateKey()}`;
}

let changelogCache = [];
let isSyncing = false;

function updateSyncStatus(status) {
    const indicator = document.getElementById('syncIndicator');
    if (!indicator) return;
    
    indicator.className = 'sync-indicator';
    switch (status) {
        case 'syncing':
            indicator.classList.add('syncing');
            indicator.title = 'Syncing...';
            break;
        case 'synced':
            indicator.classList.add('synced');
            indicator.title = 'Synced';
            break;
        case 'error':
            indicator.classList.add('error');
            indicator.title = 'Sync error';
            break;
    }
}

async function loadChangelogFromServer() {
    try {
        updateSyncStatus('syncing');
        const response = await fetch(getApiUrl());
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        changelogCache = (data || []).map(event => ({
            ...event,
            ts: event.timeStamp || event.ts,
            id: event.id ? (isNaN(Number(event.id)) ? event.id : Number(event.id)) : event.id
        }));
        
        updateSyncStatus('synced');
        return changelogCache;
    } catch (error) {
        console.error('Failed to load from server:', error);
        updateSyncStatus('error');
        
        const saved = localStorage.getItem('grizzChangelog_shopping_fallback');
        if (saved) changelogCache = JSON.parse(saved);
        return changelogCache;
    }
}

function loadChangelog() {
    return changelogCache;
}

function saveChangelogLocal(changelog) {
    localStorage.setItem('grizzChangelog_shopping_fallback', JSON.stringify(changelog));
}

async function postEvent(event) {
    try {
        updateSyncStatus('syncing');
        
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(event)) {
            params.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
        }
        
        const url = `${getApiUrl()}?${params.toString()}`;
        const response = await fetch(url, { method: 'POST' });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        updateSyncStatus('synced');
        return true;
    } catch (error) {
        console.error('Failed to post event:', error);
        updateSyncStatus('error');
        return false;
    }
}

async function addEvent(op, data) {
    const event = { op, ...data };
    const tempTs = new Date().toISOString();
    const localEvent = { ...event, ts: tempTs };
    changelogCache.push(localEvent);
    saveChangelogLocal(changelogCache);
    postEvent(event);
    return localEvent;
}

function replayChangelog(changelog) {
    const itemsMap = new Map();
    const order = [];
    
    const sortedEvents = [...changelog].sort((a, b) => (a.ts || '').localeCompare(b.ts || ''));
    
    for (const event of sortedEvents) {
        switch (event.op) {
            case 'added':
                itemsMap.set(event.id, {
                    id: event.id,
                    text: event.text,
                    quantity: event.quantity || null,
                    category: event.category || 'other',
                    checked: false
                });
                order.push(event.id);
                break;
            case 'removed':
                itemsMap.delete(event.id);
                const idx = order.indexOf(event.id);
                if (idx > -1) order.splice(idx, 1);
                break;
            case 'checked':
                if (itemsMap.has(event.id)) {
                    itemsMap.get(event.id).checked = true;
                }
                break;
            case 'unchecked':
                if (itemsMap.has(event.id)) {
                    itemsMap.get(event.id).checked = false;
                }
                break;
            case 'reorder':
                order.length = 0;
                if (event.order) {
                    const orderArray = typeof event.order === 'string' ? JSON.parse(event.order) : event.order;
                    const normalizedOrder = orderArray.map(id => isNaN(Number(id)) ? id : Number(id));
                    order.push(...normalizedOrder.filter(id => itemsMap.has(id)));
                }
                break;
        }
    }
    
    return order.map(id => itemsMap.get(id)).filter(Boolean);
}

// ============================================
// UI STATE & DOM
// ============================================

let items = [];
let selectedCategory = 'all';

const itemList = document.getElementById('itemList');
const addInput = document.getElementById('addInput');
const addSubmitBtn = document.getElementById('addSubmitBtn');
const clearDoneBtn = document.getElementById('clearDoneBtn');
const categoriesContainer = document.getElementById('categoriesContainer');
const itemCount = document.getElementById('itemCount');

async function init() {
    setupEventListeners();
    
    itemList.innerHTML = `
        <div class="loading-state">
            <div class="loading-spinner"></div>
            <p>Loading your list...</p>
        </div>
    `;
    
    const changelog = await loadChangelogFromServer();
    items = replayChangelog(changelog);
    
    renderCategories();
    renderItems();
}

function setupEventListeners() {
    addSubmitBtn.addEventListener('click', addItem);
    addInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addItem();
    });
    
    clearDoneBtn.addEventListener('click', clearCheckedItems);
}

function addItem() {
    const rawText = addInput.value.trim();
    if (!rawText) return;
    
    const { quantity, name } = parseQuantity(rawText);
    const category = detectCategory(name);
    const id = Date.now();
    
    const item = {
        id,
        text: name,
        quantity,
        category,
        checked: false
    };
    
    addEvent('added', { id, text: name, quantity, category });
    items.unshift(item);
    
    addInput.value = '';
    renderCategories();
    renderItems();
}

function toggleItem(id) {
    const item = items.find(i => i.id === id);
    if (!item) return;
    
    const wasChecked = item.checked;
    item.checked = !wasChecked;
    
    addEvent(wasChecked ? 'unchecked' : 'checked', { id });
    
    // Update DOM directly
    const el = document.querySelector(`[data-id="${id}"]`);
    if (el) {
        el.classList.toggle('checked', item.checked);
    }
    
    updateItemCount();
}

function deleteItem(id) {
    const el = document.querySelector(`[data-id="${id}"]`);
    if (el) {
        el.classList.add('removing');
        setTimeout(() => {
            addEvent('removed', { id });
            items = items.filter(i => i.id !== id);
            renderCategories();
            renderItems();
        }, 300);
    }
}

async function clearCheckedItems() {
    const checkedItems = items.filter(i => i.checked);
    if (checkedItems.length === 0) return;
    
    // Animate removal
    checkedItems.forEach(item => {
        const el = document.querySelector(`[data-id="${item.id}"]`);
        if (el) el.classList.add('removing');
    });
    
    setTimeout(async () => {
        for (const item of checkedItems) {
            await addEvent('removed', { id: item.id });
        }
        items = items.filter(i => !i.checked);
        renderCategories();
        renderItems();
    }, 300);
}

function renderCategories() {
    const counts = { all: items.length };
    items.forEach(item => {
        if (!counts[item.category]) counts[item.category] = 0;
        counts[item.category]++;
    });
    
    // Only show categories that have items, plus "All"
    const activeCategories = ['all', ...Object.keys(categories).filter(key => counts[key] > 0)];
    
    categoriesContainer.innerHTML = activeCategories.map(key => {
        const isAll = key === 'all';
        const name = isAll ? 'All' : categories[key].name;
        const count = counts[key] || 0;
        const isActive = selectedCategory === key;
        
        return `
            <button class="category-pill${isActive ? ' active' : ''}" data-category="${key}">
                ${isAll ? '📋' : categories[key].emoji} ${name}
                <span class="count">(${count})</span>
            </button>
        `;
    }).join('');
    
    // Add click handlers
    categoriesContainer.querySelectorAll('.category-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            selectedCategory = pill.dataset.category;
            renderCategories();
            renderItems();
        });
    });
}

function renderItems() {
    const filteredItems = selectedCategory === 'all' 
        ? items 
        : items.filter(i => i.category === selectedCategory);
    
    updateItemCount();
    
    if (filteredItems.length === 0) {
        itemList.innerHTML = `
            <div class="empty-state">
                <div class="empty-emoji">🛒</div>
                <p class="empty-text">Your list is empty!</p>
                <p class="empty-hint">Type an item below to add it</p>
            </div>
        `;
        return;
    }
    
    // Group by checked status
    const unchecked = filteredItems.filter(i => !i.checked);
    const checked = filteredItems.filter(i => i.checked);
    
    let html = '';
    
    if (unchecked.length > 0) {
        html += `
            <div class="section-header">
                <span class="section-title">To Get</span>
                <span class="section-count">${unchecked.length}</span>
                <div class="section-line"></div>
            </div>
        `;
        unchecked.forEach((item, idx) => {
            html += createItemHTML(item, idx);
        });
    }
    
    if (checked.length > 0) {
        html += `
            <div class="section-header">
                <span class="section-title">In Cart</span>
                <span class="section-count">${checked.length}</span>
                <div class="section-line"></div>
            </div>
        `;
        checked.forEach((item, idx) => {
            html += createItemHTML(item, idx + unchecked.length);
        });
    }
    
    // All done?
    if (unchecked.length === 0 && checked.length > 0) {
        html += `
            <div class="all-done">
                <div class="all-done-emoji">🎉🛒🎉</div>
                <div class="all-done-text">All items collected!</div>
            </div>
        `;
    }
    
    itemList.innerHTML = html;
    
    // Add event listeners
    itemList.querySelectorAll('.item').forEach(el => {
        const id = parseInt(el.dataset.id);
        el.addEventListener('click', (e) => {
            if (!e.target.closest('.item-delete')) {
                toggleItem(id);
            }
        });
        
        el.querySelector('.item-delete').addEventListener('click', (e) => {
            e.stopPropagation();
            deleteItem(id);
        });
    });
}

function createItemHTML(item, index) {
    const cat = categories[item.category] || categories.other;
    return `
        <div class="item${item.checked ? ' checked' : ''}" data-id="${item.id}" style="animation-delay: ${index * 0.03}s">
            <div class="item-checkbox">
                <svg viewBox="0 0 24 24" fill="none">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
            </div>
            <div class="item-content">
                <span class="item-text">${item.text}</span>
                ${item.quantity ? `<span class="item-quantity">${item.quantity}</span>` : ''}
            </div>
            <button class="item-delete">
                <svg viewBox="0 0 24 24" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        </div>
    `;
}

function updateItemCount() {
    const total = items.length;
    const checked = items.filter(i => i.checked).length;
    const remaining = total - checked;
    
    if (total === 0) {
        itemCount.textContent = '0 items';
    } else if (remaining === 0) {
        itemCount.textContent = `All ${total} items collected! 🎉`;
    } else {
        itemCount.textContent = `${remaining} of ${total} items remaining`;
    }
}

// Polling for external changes
let lastKnownEventCount = 0;

async function pollForChanges() {
    if (isSyncing) return;
    
    try {
        isSyncing = true;
        const changelog = await loadChangelogFromServer();
        isSyncing = false;
        
        if (changelog.length !== lastKnownEventCount) {
            lastKnownEventCount = changelog.length;
            items = replayChangelog(changelog);
            renderCategories();
            renderItems();
        }
    } catch (error) {
        isSyncing = false;
        console.error('Poll error:', error);
    }
}

// Start the app
document.addEventListener('DOMContentLoaded', async () => {
    await init();
    lastKnownEventCount = loadChangelog().length;
    setInterval(pollForChanges, 5000);
});

