// ============================================
// SHOPPING LIST - Simple, Fast Grocery Lists
// ============================================

import { 
    createEventStore, 
    replayChangelogBase,
    getListIdFromUrl,
    addToRecentLists,
    uploadHeroImage,
    getHeroImageUrl,
    createPoller
} from '../shared.js';
import { createAutocomplete } from '../autocomplete.js';

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
                
            case 'clear_completed':
                // Remove all items that were checked at the time of this event
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
let itemFrequencies = new Map(); // Track historical item frequencies
let autocomplete = null;
let renderedItemsHash = ''; // Track what's currently rendered to avoid unnecessary DOM updates

const itemList = document.getElementById('itemList');
const addInput = document.getElementById('addInput');
const addSubmitBtn = document.getElementById('addSubmitBtn');
const clearDoneBtn = document.getElementById('clearDoneBtn');
const categoriesContainer = document.getElementById('categoriesContainer');
const itemCount = document.getElementById('itemCount');

// Hero image elements
const heroImageSection = document.getElementById('heroImageSection');
const heroImageContainer = document.getElementById('heroImageContainer');
const heroImagePlaceholder = document.getElementById('heroImagePlaceholder');
const heroImage = document.getElementById('heroImage');
const heroImageChange = document.getElementById('heroImageChange');
const heroImageInput = document.getElementById('heroImageInput');

// Create a hash representing the current render state
function getRenderHash() {
    return items.map(i => `${i.id}:${i.checked}`).join('|') + '::' + selectedCategory;
}

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
    
    // Build item frequency suggestions from historical data
    buildItemFrequencies(changelog);
    
    // Initialize autocomplete
    autocomplete = createAutocomplete({
        input: addInput,
        getSuggestions: getFrequencySortedSuggestions,
        onSelect: (item) => {
            // Trigger add when suggestion is selected
            addItem();
        },
        maxSuggestions: 10,
        showCount: true
    });
    
    // Set the list title from metadata (extracted from changelog)
    const metadata = store.getMetadata();
    const listTitleEl = document.getElementById('listTitle');
    if (listTitleEl && metadata.name) {
        listTitleEl.textContent = metadata.name;
        document.title = `${metadata.name} 🛒 - Grizz Lists`;
    }
    
    // Display hero image if available
    displayHeroImage(metadata.heroImage);
    
    // Track this list as recently accessed (include hero image)
    addToRecentLists(listId, metadata.name, 'shopping', metadata.heroImage);
    
    renderCategories(true); // Force initial render
    renderItems(true);
}

function setupEventListeners() {
    addSubmitBtn.addEventListener('click', addItem);
    addInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addItem();
    });
    
    clearDoneBtn.addEventListener('click', clearCheckedItems);
    
    // Hero image upload listeners
    heroImagePlaceholder.addEventListener('click', () => heroImageInput.click());
    heroImageChange.addEventListener('click', (e) => {
        e.stopPropagation();
        heroImageInput.click();
    });
    heroImageInput.addEventListener('change', handleHeroImageUpload);
    
    // Drag and drop support for hero image
    heroImageContainer.addEventListener('dragover', handleDragOver);
    heroImageContainer.addEventListener('dragleave', handleDragLeave);
    heroImageContainer.addEventListener('drop', handleDrop);
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
    items.push(item);
    
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
    
    // Each check = 1 frequency point for suggestions
    if (!wasChecked) {
        const lower = item.text.toLowerCase();
        if (!itemFrequencies.has(lower)) {
            itemFrequencies.set(lower, { text: item.text, count: 0 });
        }
        itemFrequencies.get(lower).count++;
    }
    
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
        // Single event to clear all checked items
        const checkedIds = checkedItems.map(i => i.id);
        const event = store.addEvent('clear_completed', { ids: checkedIds });
        await event._postPromise;
        
        items = items.filter(i => !i.checked);
        renderCategories();
        renderItems();
    }, 300);
}

// ============================================
// RENDERING
// ============================================

let renderedCategoriesHash = '';

function getCategoriesHash() {
    const counts = {};
    items.forEach(item => {
        counts[item.category] = (counts[item.category] || 0) + 1;
    });
    return Object.entries(counts).sort().join('|') + '::' + selectedCategory;
}

function renderCategories(force = false) {
    const currentHash = getCategoriesHash();
    
    // Skip render if nothing changed (unless forced)
    if (!force && currentHash === renderedCategoriesHash) {
        return;
    }
    renderedCategoriesHash = currentHash;
    
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

function renderItems(force = false) {
    const currentHash = getRenderHash();
    
    // Skip render if nothing changed (unless forced)
    if (!force && currentHash === renderedItemsHash) {
        return;
    }
    renderedItemsHash = currentHash;
    
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
// HERO IMAGE
// ============================================

function displayHeroImage(imagePath) {
    if (!imagePath) {
        // Show placeholder
        heroImagePlaceholder.style.display = 'flex';
        heroImage.style.display = 'none';
        heroImageChange.style.display = 'none';
        heroImageSection.classList.remove('has-image');
        return;
    }
    
    const imageUrl = getHeroImageUrl(listId, imagePath);
    heroImage.src = imageUrl;
    heroImage.style.display = 'block';
    heroImagePlaceholder.style.display = 'none';
    heroImageChange.style.display = 'flex';
    heroImageSection.classList.add('has-image');
}

function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    heroImageContainer.classList.add('drag-over');
}

function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    heroImageContainer.classList.remove('drag-over');
}

function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    heroImageContainer.classList.remove('drag-over');
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        const file = files[0];
        // Check if it's an image
        if (file.type.startsWith('image/')) {
            processHeroImageFile(file);
        }
    }
}

async function handleHeroImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    processHeroImageFile(file);
}

async function processHeroImageFile(file) {
    if (!file) return;
    
    // Show loading state
    heroImagePlaceholder.innerHTML = `
        <div class="loading-spinner" style="width: 24px; height: 24px; margin: 0;"></div>
        <span>Uploading...</span>
    `;
    
    const result = await uploadHeroImage(listId, file);
    
    if (result) {
        const imagePath = result.path || result.url;
        displayHeroImage(imagePath);
        
        // Update recent lists cache so hero image shows on overview
        const metadata = store.getMetadata();
        addToRecentLists(listId, metadata.name, 'shopping', imagePath);
    } else {
        // Restore placeholder on error
        heroImagePlaceholder.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
            </svg>
            <span>Add cover photo</span>
        `;
    }
    
    // Clear input so same file can be selected again
    heroImageInput.value = '';
}

// ============================================
// ITEM SUGGESTIONS (AUTOCOMPLETE)
// ============================================

function buildItemFrequencies(changelog) {
    itemFrequencies.clear();
    
    // Build id -> text map from added events
    const itemTexts = new Map();
    for (const event of changelog) {
        if (event.op === 'added' && event.text) {
            itemTexts.set(event.id, event.text.trim());
        }
    }
    
    // Count checked events - each check = 1 frequency point
    // Only items with at least 1 check will be included
    for (const event of changelog) {
        if (event.op === 'checked' && itemTexts.has(event.id)) {
            const text = itemTexts.get(event.id);
            const lower = text.toLowerCase();
            
            if (!itemFrequencies.has(lower)) {
                itemFrequencies.set(lower, { text, count: 0 });
            }
            itemFrequencies.get(lower).count++;
        }
    }
}

function getFrequencySortedSuggestions() {
    // Get current items on the list (to exclude from suggestions)
    const currentItems = new Set(items.map(i => i.text.toLowerCase()));
    
    // Sort by frequency (descending) and filter out current items
    return Array.from(itemFrequencies.values())
        .filter(item => !currentItems.has(item.text.toLowerCase()))
        .sort((a, b) => b.count - a.count);
}

// ============================================
// POLLING
// ============================================

let lastItemsHash = '';

function getItemsHash(itemList) {
    // Create a hash of current items state for comparison
    return itemList.map(i => `${i.id}:${i.text}:${i.checked}`).join('|');
}

async function pollForChanges() {
    if (store.getIsSyncing()) return;
    
    try {
        store.setIsSyncing(true);
        const changelog = await store.loadChangelogFromServer({ silent: true });
        store.setIsSyncing(false);
        
        const newItems = replayChangelog(changelog);
        const newHash = getItemsHash(newItems);
        
        // Only re-render if items actually changed
        if (newHash !== lastItemsHash) {
            lastItemsHash = newHash;
            items = newItems;
            buildItemFrequencies(changelog);
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
    lastItemsHash = getItemsHash(items);
    createPoller(pollForChanges, 5000);
});
