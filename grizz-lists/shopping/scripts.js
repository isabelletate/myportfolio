// ============================================
// SHOPPING LIST - Simple, Fast Grocery Lists
// ============================================

import { 
    createEventStore, 
    replayChangelogBase,
    getListIdFromUrl,
    addToRecentLists
} from '../shared.js';

// ============================================
// LIST CONFIGURATION
// ============================================

const listId = getListIdFromUrl();

// If no list ID, redirect to main page
if (!listId) {
    window.location.href = '../index.html';
}

// ============================================
// SHOPPING EVENT STORE
// ============================================

const store = createEventStore('shopping', listId);

// ============================================
// SHOPPING-SPECIFIC REPLAY
// ============================================

function replayChangelog(changelog) {
    const itemFactory = (event) => ({
        id: event.id,
        text: event.text,
        category: event.category || 'other',
        checked: false
    });
    
    const { itemsMap, order, sortedEvents } = replayChangelogBase(changelog, itemFactory);
    
    for (const event of sortedEvents) {
        switch (event.op) {
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
        }
    }
    
    return order.map(id => itemsMap.get(id)).filter(Boolean);
}

// ============================================
// CATEGORIES
// ============================================

const categories = {
    produce: { name: 'Produce', emoji: '🥬', keywords: ['apple', 'banana', 'orange', 'tomato', 'lettuce', 'spinach', 'carrot', 'onion', 'garlic', 'potato', 'avocado', 'lemon', 'lime', 'grape', 'strawberry', 'blueberry', 'broccoli', 'cucumber', 'pepper', 'mushroom', 'celery', 'fruit', 'vegetable', 'salad', 'citrus'] },
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

function detectCategory(text) {
    const lower = text.toLowerCase();
    for (const [key, cat] of Object.entries(categories)) {
        if (cat.keywords.some(kw => lower.includes(kw))) {
            return key;
        }
    }
    return 'other';
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

// ============================================
// INITIALIZATION
// ============================================

async function init() {
    setupEventListeners();
    
    itemList.innerHTML = `
        <div class="loading-state">
            <div class="loading-spinner"></div>
            <p>Loading your list...</p>
        </div>
    `;
    
    const changelog = await store.loadChangelogFromServer();
    items = replayChangelog(changelog);
    
    // Set the list title from metadata (extracted from changelog)
    const metadata = store.getMetadata();
    const listTitleEl = document.getElementById('listTitle');
    if (listTitleEl && metadata.name) {
        listTitleEl.textContent = metadata.name;
        document.title = `${metadata.name} 🛒 - Grizz Lists`;
    }
    
    // Track this list as recently accessed
    addToRecentLists(listId, metadata.name, 'shopping');
    
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

// ============================================
// ITEM OPERATIONS
// ============================================

function addItem() {
    const text = addInput.value.trim();
    if (!text) return;
    
    const category = detectCategory(text);
    const id = Date.now();
    
    const item = {
        id,
        text,
        category,
        checked: false
    };
    
    store.addEvent('added', { id, text, category });
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
    
    store.addEvent(wasChecked ? 'unchecked' : 'checked', { id });
    
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
            store.addEvent('removed', { id });
            items = items.filter(i => i.id !== id);
            renderCategories();
            renderItems();
        }, 300);
    }
}

async function clearCheckedItems() {
    const checkedItems = items.filter(i => i.checked);
    if (checkedItems.length === 0) return;
    
    checkedItems.forEach(item => {
        const el = document.querySelector(`[data-id="${item.id}"]`);
        if (el) el.classList.add('removing');
    });
    
    setTimeout(async () => {
        for (const item of checkedItems) {
            await store.addEvent('removed', { id: item.id });
        }
        items = items.filter(i => !i.checked);
        renderCategories();
        renderItems();
    }, 300);
}

// ============================================
// RENDERING
// ============================================

function renderCategories() {
    const counts = { all: items.length };
    items.forEach(item => {
        if (!counts[item.category]) counts[item.category] = 0;
        counts[item.category]++;
    });
    
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
    
    if (unchecked.length === 0 && checked.length > 0) {
        html += `
            <div class="all-done">
                <div class="all-done-emoji">🎉🛒🎉</div>
                <div class="all-done-text">All items collected!</div>
            </div>
        `;
    }
    
    itemList.innerHTML = html;
    
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
    return `
        <div class="item${item.checked ? ' checked' : ''}" data-id="${item.id}" style="animation-delay: ${index * 0.03}s">
            <div class="item-checkbox">
                <svg viewBox="0 0 24 24" fill="none">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
            </div>
            <div class="item-content">
                <span class="item-text">${item.text}</span>
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

// ============================================
// POLLING
// ============================================

let lastKnownEventCount = 0;

async function pollForChanges() {
    if (store.getIsSyncing()) return;
    
    try {
        store.setIsSyncing(true);
        const changelog = await store.loadChangelogFromServer();
        store.setIsSyncing(false);
        
        if (changelog.length !== lastKnownEventCount) {
            lastKnownEventCount = changelog.length;
            items = replayChangelog(changelog);
            renderCategories();
            renderItems();
        }
    } catch (error) {
        store.setIsSyncing(false);
        console.error('Poll error:', error);
    }
}

// ============================================
// START
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    await init();
    lastKnownEventCount = store.loadChangelog().length;
    setInterval(pollForChanges, 5000);
});
