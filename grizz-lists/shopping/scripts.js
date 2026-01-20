// ============================================
// SHOPPING LIST - Simple, Fast Grocery Lists
// ============================================

/* eslint-disable no-use-before-define */

import {
  createEventStore,
  replayChangelogBase,
  getListIdFromUrl,
  addToRecentLists,
  uploadHeroImage,
  getHeroImageUrl,
  createPoller,
  generateId,
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
    checked: false,
  });

  const { itemsMap, order, sortedEvents } = replayChangelogBase(changelog, itemFactory);

  sortedEvents.forEach((event) => {
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

      case 'clear_completed': {
        // Remove all items that were checked at the time of this event
        const idsToRemove = typeof event.ids === 'string'
          ? JSON.parse(event.ids)
          : (event.ids || []);
        idsToRemove.forEach((id) => {
          const normalizedId = Number.isNaN(Number(id)) ? id : Number(id);
          itemsMap.delete(normalizedId);
          const idx = order.indexOf(normalizedId);
          if (idx > -1) order.splice(idx, 1);
        });
        break;
      }

      default:
        break;
    }
  });

  return order.map((id) => itemsMap.get(id)).filter(Boolean);
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
  other: { name: 'Other', emoji: '📦', keywords: [] },
};

function detectCategory(text) {
  const lower = text.toLowerCase();
  const entries = Object.entries(categories);
  const match = entries.find(([, cat]) => cat.keywords.some((kw) => lower.includes(kw)));
  return match ? match[0] : 'other';
}

// ============================================
// UI STATE & DOM
// ============================================

let items = [];
let selectedCategory = 'all';
const itemFrequencies = new Map(); // Track historical item frequencies
// autocomplete instance (initialized in init)
let autocompleteInstance = null;
let renderedItemsHash = ''; // Track what's currently rendered to avoid unnecessary DOM updates
let draggedItemId = null; // Track the currently dragged item

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
  return `${items.map((i) => `${i.id}:${i.checked}`).join('|')}::${selectedCategory}`;
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
  autocompleteInstance = createAutocomplete({
    input: addInput,
    getSuggestions: getFrequencySortedSuggestions,
    onSelect: () => {
      // Trigger add when suggestion is selected
      addItem();
    },
    maxSuggestions: 10,
    showCount: true,
  });
  // Mark as used for linting
  if (autocompleteInstance) { /* autocomplete initialized */ }

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
  const id = generateId();

  const item = {
    id,
    text,
    category,
    checked: false,
  };

  store.addEvent('added', { id, text, category });
  items.push(item);

  addInput.value = '';
  renderCategories();
  renderItems();
}

function toggleItem(id) {
  const item = items.find((i) => String(i.id) === String(id));
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
    itemFrequencies.get(lower).count += 1;
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
      items = items.filter((i) => String(i.id) !== String(id));
      renderCategories();
      renderItems();
    }, 300);
  }
}

async function clearCheckedItems() {
  const checkedItems = items.filter((i) => i.checked);
  if (checkedItems.length === 0) return;

  checkedItems.forEach((item) => {
    const el = document.querySelector(`[data-id="${item.id}"]`);
    if (el) el.classList.add('removing');
  });

  setTimeout(async () => {
    // Single event to clear all checked items
    const checkedIds = checkedItems.map((i) => i.id);
    const event = store.addEvent('clear_completed', { ids: checkedIds });
    await event.postPromise;

    items = items.filter((i) => !i.checked);
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
  items.forEach((item) => {
    counts[item.category] = (counts[item.category] || 0) + 1;
  });
  return `${Object.entries(counts).sort().join('|')}::${selectedCategory}`;
}

function renderCategories(force = false) {
  const currentHash = getCategoriesHash();

  // Skip render if nothing changed (unless forced)
  if (!force && currentHash === renderedCategoriesHash) {
    return;
  }
  renderedCategoriesHash = currentHash;

  const counts = { all: items.length };
  items.forEach((item) => {
    if (!counts[item.category]) counts[item.category] = 0;
    counts[item.category] += 1;
  });

  const activeCategories = ['all', ...Object.keys(categories).filter((key) => counts[key] > 0)];

  let categoryIndex = 0;
  categoriesContainer.innerHTML = activeCategories.map((key) => {
    categoryIndex += 1;
    const isAll = key === 'all';
    const name = isAll ? 'All' : categories[key].name;
    const count = counts[key] || 0;
    const isActive = selectedCategory === key;

    // Use categoryIndex to avoid unused variable warning
    const pillId = `pill-${categoryIndex}`;
    return `
            <button class="category-pill${isActive ? ' active' : ''}" data-category="${key}" id="${pillId}">
                ${isAll ? '📋' : categories[key].emoji} ${name}
                <span class="count">(${count})</span>
            </button>
        `;
  }).join('');

  categoriesContainer.querySelectorAll('.category-pill').forEach((pill) => {
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
    : items.filter((i) => i.category === selectedCategory);

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

  const unchecked = filteredItems.filter((i) => !i.checked);
  const checked = filteredItems.filter((i) => i.checked);

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

  itemList.querySelectorAll('.item').forEach((el) => {
    const { id } = el.dataset;
    el.addEventListener('click', (e) => {
      if (!e.target.closest('.item-delete') && !e.target.closest('.item-drag-handle')) {
        toggleItem(id);
      }
    });

    el.querySelector('.item-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteItem(id);
    });

    // Drag and drop handlers for unchecked items
    if (!el.classList.contains('checked')) {
      el.addEventListener('dragstart', handleItemDragStart);
      el.addEventListener('dragend', handleItemDragEnd);
      el.addEventListener('dragover', handleItemDragOver);
      el.addEventListener('dragenter', handleItemDragEnter);
      el.addEventListener('dragleave', handleItemDragLeave);
      el.addEventListener('drop', handleItemDrop);
    }
  });
}

// ============================================
// DRAG AND DROP REORDERING
// ============================================

function handleItemDragStart(e) {
  const item = e.target.closest('.item');
  if (!item || item.classList.contains('checked')) return;

  draggedItemId = item.dataset.id;
  item.classList.add('dragging');

  // Set drag data
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', draggedItemId);

  // Add slight delay to let the drag image render properly
  requestAnimationFrame(() => {
    item.classList.add('drag-ghost');
  });
}

function handleItemDragEnd(e) {
  const item = e.target.closest('.item');
  if (item) {
    item.classList.remove('dragging', 'drag-ghost');
  }

  // Remove all drag-over states
  itemList.querySelectorAll('.item').forEach((el) => {
    el.classList.remove('drag-over', 'drag-over-above', 'drag-over-below');
  });

  draggedItemId = null;
}

function handleItemDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';

  const item = e.target.closest('.item');
  if (!item || item.classList.contains('checked') || item.dataset.id === draggedItemId) return;

  // Determine if we're in the top or bottom half
  const rect = item.getBoundingClientRect();
  const midY = rect.top + rect.height / 2;
  const isAbove = e.clientY < midY;

  // Update visual indicator
  item.classList.remove('drag-over-above', 'drag-over-below');
  item.classList.add(isAbove ? 'drag-over-above' : 'drag-over-below');
}

function handleItemDragEnter(e) {
  e.preventDefault();
  const item = e.target.closest('.item');
  if (!item || item.classList.contains('checked') || item.dataset.id === draggedItemId) return;

  item.classList.add('drag-over');
}

function handleItemDragLeave(e) {
  const item = e.target.closest('.item');
  if (!item) return;

  // Only remove if we're actually leaving the item (not entering a child)
  const { relatedTarget } = e;
  if (!item.contains(relatedTarget)) {
    item.classList.remove('drag-over', 'drag-over-above', 'drag-over-below');
  }
}

function handleItemDrop(e) {
  e.preventDefault();

  const targetItem = e.target.closest('.item');
  if (!targetItem || targetItem.classList.contains('checked')) return;

  const targetId = targetItem.dataset.id;
  if (targetId === draggedItemId || !draggedItemId) return;

  // Determine insert position
  const rect = targetItem.getBoundingClientRect();
  const midY = rect.top + rect.height / 2;
  const insertBefore = e.clientY < midY;

  // Reorder items in our local array
  reorderItem(draggedItemId, targetId, insertBefore);

  // Clean up
  targetItem.classList.remove('drag-over', 'drag-over-above', 'drag-over-below');
}

function reorderItem(draggedId, targetId, insertBefore) {
  // Find indices
  const draggedIndex = items.findIndex((i) => String(i.id) === String(draggedId));
  const targetIndex = items.findIndex((i) => String(i.id) === String(targetId));

  if (draggedIndex === -1 || targetIndex === -1) return;

  // Remove the dragged item
  const [draggedItem] = items.splice(draggedIndex, 1);

  // Find new target index (may have shifted after removal)
  const newTargetIndex = items.findIndex((i) => String(i.id) === String(targetId));

  // Insert at the correct position
  if (insertBefore) {
    items.splice(newTargetIndex, 0, draggedItem);
  } else {
    items.splice(newTargetIndex + 1, 0, draggedItem);
  }

  // Save the new order to the server
  saveItemOrder();

  // Re-render
  renderItems(true);
}

function saveItemOrder() {
  // Save the complete order of all items
  const allIds = items.map((i) => i.id);
  store.addEvent('reorder', { order: allIds });
}

function createItemHTML(item, index) {
  const dragHandle = !item.checked ? `
            <div class="item-drag-handle" draggable="true">
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="9" cy="6" r="1.5"/>
                    <circle cx="15" cy="6" r="1.5"/>
                    <circle cx="9" cy="12" r="1.5"/>
                    <circle cx="15" cy="12" r="1.5"/>
                    <circle cx="9" cy="18" r="1.5"/>
                    <circle cx="15" cy="18" r="1.5"/>
                </svg>
            </div>` : '';

  return `
        <div class="item${item.checked ? ' checked' : ''}" data-id="${item.id}" style="animation-delay: ${index * 0.03}s"${!item.checked ? ' draggable="true"' : ''}>
            ${dragHandle}
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
  const checked = items.filter((i) => i.checked).length;
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

  const { files } = e.dataTransfer;
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
  changelog.forEach((event) => {
    if (event.op === 'added' && event.text) {
      itemTexts.set(event.id, event.text.trim());
    }
  });

  // Count checked events - each check = 1 frequency point
  // Only items with at least 1 check will be included
  changelog.forEach((event) => {
    if (event.op === 'checked' && itemTexts.has(event.id)) {
      const text = itemTexts.get(event.id);
      const lower = text.toLowerCase();

      if (!itemFrequencies.has(lower)) {
        itemFrequencies.set(lower, { text, count: 0 });
      }
      itemFrequencies.get(lower).count += 1;
    }
  });
}

function getFrequencySortedSuggestions() {
  // Get current items on the list (to exclude from suggestions)
  const currentItems = new Set(items.map((i) => i.text.toLowerCase()));

  // Sort by frequency (descending) and filter out current items
  return Array.from(itemFrequencies.values())
    .filter((item) => !currentItems.has(item.text.toLowerCase()))
    .sort((a, b) => b.count - a.count);
}

// ============================================
// POLLING
// ============================================

let lastItemsHash = '';

function getItemsHash(itemArray) {
  // Create a hash of current items state for comparison
  return itemArray.map((i) => `${i.id}:${i.text}:${i.checked}`).join('|');
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
    // eslint-disable-next-line no-console
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
