// ============================================
// TRACKER - Product Tracker Interactive View
// ============================================

import {
    loadChangelogFromServer,
    loadChangelog,
    addEvent,
    replayChangelog,
    getIsSyncing,
    setIsSyncing,
    getMetadata,
    listId,
    addToRecentLists,
    statusOptions,
    getStatusInfo
} from './shared.js';

// If no list ID, redirect to main page
if (!listId) {
    window.location.href = '../index.html';
}

// ============================================
// STATE
// ============================================

let products = [];
let editingProductId = null;
let productToDelete = null;
let currentSort = { field: null, direction: 'asc' };
let lastKnownEventCount = 0;
let pollInterval = null;

// ============================================
// DOM ELEMENTS
// ============================================

const productTableBody = document.getElementById('productTableBody');
const tableWrapper = document.getElementById('tableWrapper');
const addProductBtn = document.getElementById('addProductBtn');
const productModal = document.getElementById('productModal');
const deleteModal = document.getElementById('deleteModal');
const modalTitle = document.getElementById('modalTitle');
const modalClose = document.getElementById('modalClose');
const cancelBtn = document.getElementById('cancelBtn');
const saveBtn = document.getElementById('saveBtn');
const productForm = document.getElementById('productForm');

// Form inputs
const inputName = document.getElementById('inputName');
const inputImageUrl = document.getElementById('inputImageUrl');
const inputSeason = document.getElementById('inputSeason');
const inputLaunchMonth = document.getElementById('inputLaunchMonth');
const inputVendor = document.getElementById('inputVendor');
const inputPoBulk = document.getElementById('inputPoBulk');
const inputPoTop = document.getElementById('inputPoTop');
const inputStatus = document.getElementById('inputStatus');
const inputNotes = document.getElementById('inputNotes');
const imagePreview = document.getElementById('imagePreview');

// Delete modal elements
const deleteModalClose = document.getElementById('deleteModalClose');
const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
const deleteProductName = document.getElementById('deleteProductName');

// ============================================
// INITIALIZATION
// ============================================

async function init() {
    showLoading();
    setupEventListeners();
    
    await loadProducts();
    
    // Set the list title from metadata
    const metadata = getMetadata();
    const listTitleEl = document.getElementById('listTitle');
    if (listTitleEl && metadata.name) {
        listTitleEl.textContent = metadata.name;
        document.title = `${metadata.name} - Product Tracker`;
    }
    
    // Track this list as recently accessed
    addToRecentLists(listId, metadata.name, 'tracker');
    
    renderProducts();
    updateStats();
}

function showLoading() {
    tableWrapper.innerHTML = `
        <div class="loading-state">
            <div class="loading-spinner"></div>
            <p class="loading-text">Loading products...</p>
        </div>
    `;
}

async function loadProducts() {
    const changelog = await loadChangelogFromServer();
    products = replayChangelog(changelog);
    lastKnownEventCount = changelog.length;
}

function setupEventListeners() {
    // Add product button
    addProductBtn.addEventListener('click', () => openProductModal());
    
    // Modal close handlers
    modalClose.addEventListener('click', closeProductModal);
    cancelBtn.addEventListener('click', closeProductModal);
    productModal.addEventListener('click', (e) => {
        if (e.target === productModal) closeProductModal();
    });
    
    // Save button
    saveBtn.addEventListener('click', saveProduct);
    
    // Form submission (Enter key)
    productForm.addEventListener('submit', (e) => {
        e.preventDefault();
        saveProduct();
    });
    
    // Image URL preview
    inputImageUrl.addEventListener('input', updateImagePreview);
    inputImageUrl.addEventListener('blur', updateImagePreview);
    
    // Delete modal handlers
    deleteModalClose.addEventListener('click', closeDeleteModal);
    cancelDeleteBtn.addEventListener('click', closeDeleteModal);
    confirmDeleteBtn.addEventListener('click', confirmDelete);
    deleteModal.addEventListener('click', (e) => {
        if (e.target === deleteModal) closeDeleteModal();
    });
    
    // Sortable columns
    document.querySelectorAll('.sortable').forEach(th => {
        th.addEventListener('click', () => handleSort(th.dataset.sort));
    });
}

// ============================================
// PRODUCT MODAL
// ============================================

function openProductModal(productId = null) {
    editingProductId = productId;
    
    if (productId) {
        const product = products.find(p => p.id === productId);
        if (product) {
            modalTitle.textContent = 'Edit Product';
            inputName.value = product.name || '';
            inputImageUrl.value = product.imageUrl || '';
            inputSeason.value = product.season || '';
            inputLaunchMonth.value = product.launchMonth || '';
            inputVendor.value = product.vendor || '';
            inputPoBulk.value = product.poBulk || '';
            inputPoTop.value = product.poTop || '';
            inputStatus.value = product.status || 'pending';
            inputNotes.value = product.notes || '';
            updateImagePreview();
        }
    } else {
        modalTitle.textContent = 'Add Product';
        productForm.reset();
        inputStatus.value = 'pending';
        updateImagePreview();
    }
    
    productModal.classList.add('active');
    inputName.focus();
}

function closeProductModal() {
    productModal.classList.remove('active');
    editingProductId = null;
    productForm.reset();
    updateImagePreview();
}

function updateImagePreview() {
    const url = inputImageUrl.value.trim();
    if (url) {
        imagePreview.innerHTML = `<img src="${escapeHtml(url)}" alt="Preview" onerror="this.parentElement.innerHTML='<span class=\\'image-preview-placeholder\\'>📷</span>'">`;
    } else {
        imagePreview.innerHTML = '<span class="image-preview-placeholder">📷</span>';
    }
}

// ============================================
// PRODUCT OPERATIONS
// ============================================

async function saveProduct() {
    const name = inputName.value.trim();
    if (!name) {
        inputName.focus();
        return;
    }
    
    const productData = {
        name,
        imageUrl: inputImageUrl.value.trim(),
        season: inputSeason.value,
        launchMonth: inputLaunchMonth.value,
        vendor: inputVendor.value.trim(),
        poBulk: inputPoBulk.value.trim(),
        poTop: inputPoTop.value.trim(),
        status: inputStatus.value,
        notes: inputNotes.value.trim()
    };
    
    if (editingProductId) {
        // Update existing product
        await addEvent('updated', { id: editingProductId, ...productData });
        const productIndex = products.findIndex(p => p.id === editingProductId);
        if (productIndex !== -1) {
            products[productIndex] = { ...products[productIndex], ...productData };
        }
    } else {
        // Add new product
        const id = Date.now();
        await addEvent('added', { id, ...productData });
        products.push({ id, ...productData });
    }
    
    closeProductModal();
    renderProducts();
    updateStats();
}

function openDeleteModal(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    
    productToDelete = productId;
    deleteProductName.textContent = `"${product.name}"?`;
    deleteModal.classList.add('active');
}

function closeDeleteModal() {
    deleteModal.classList.remove('active');
    productToDelete = null;
}

async function confirmDelete() {
    if (!productToDelete) return;
    
    const id = productToDelete;
    closeDeleteModal();
    
    await addEvent('removed', { id });
    products = products.filter(p => p.id !== id);
    
    renderProducts();
    updateStats();
}

// ============================================
// SORTING
// ============================================

function handleSort(field) {
    if (currentSort.field === field) {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.field = field;
        currentSort.direction = 'asc';
    }
    
    // Update column headers
    document.querySelectorAll('.sortable').forEach(th => {
        th.classList.remove('sorted', 'asc', 'desc');
        if (th.dataset.sort === field) {
            th.classList.add('sorted', currentSort.direction);
        }
    });
    
    renderProducts();
}

function getSortedProducts() {
    if (!currentSort.field) return products;
    
    return [...products].sort((a, b) => {
        let aVal = a[currentSort.field] || '';
        let bVal = b[currentSort.field] || '';
        
        // Handle status sorting by order
        if (currentSort.field === 'status') {
            const statusOrder = ['pending', 'ordered', 'in_production', 'shipped', 'received', 'cancelled'];
            aVal = statusOrder.indexOf(aVal);
            bVal = statusOrder.indexOf(bVal);
        }
        
        if (typeof aVal === 'string') {
            aVal = aVal.toLowerCase();
            bVal = bVal.toLowerCase();
        }
        
        if (aVal < bVal) return currentSort.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return currentSort.direction === 'asc' ? 1 : -1;
        return 0;
    });
}

// ============================================
// RENDERING
// ============================================

function renderProducts() {
    const sortedProducts = getSortedProducts();
    
    // Update table count
    document.getElementById('tableCount').textContent = 
        `${products.length} product${products.length !== 1 ? 's' : ''}`;
    
    if (products.length === 0) {
        tableWrapper.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📦</div>
                <h3 class="empty-title">No products yet</h3>
                <p class="empty-text">Add your first product to start tracking</p>
                <button class="btn btn-primary" onclick="document.getElementById('addProductBtn').click()">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
                        <path d="M12 5v14M5 12h14"/>
                    </svg>
                    Add Product
                </button>
            </div>
        `;
        return;
    }
    
    // Restore table structure if needed
    if (!tableWrapper.querySelector('.product-table')) {
        tableWrapper.innerHTML = `
            <table class="product-table">
                <thead>
                    <tr>
                        <th class="product-image-cell">Image</th>
                        <th class="sortable" data-sort="name">Product</th>
                        <th class="sortable" data-sort="season">Season</th>
                        <th class="sortable" data-sort="launchMonth">Launch</th>
                        <th class="sortable" data-sort="vendor">Vendor</th>
                        <th>PO# (Bulk)</th>
                        <th>PO# (TOP)</th>
                        <th class="sortable" data-sort="status">Status</th>
                        <th class="actions-cell">Actions</th>
                    </tr>
                </thead>
                <tbody id="productTableBody"></tbody>
            </table>
        `;
        
        // Re-attach sort handlers
        document.querySelectorAll('.sortable').forEach(th => {
            th.addEventListener('click', () => handleSort(th.dataset.sort));
            if (th.dataset.sort === currentSort.field) {
                th.classList.add('sorted', currentSort.direction);
            }
        });
    }
    
    const tbody = document.getElementById('productTableBody') || tableWrapper.querySelector('tbody');
    
    tbody.innerHTML = sortedProducts.map(product => {
        const statusInfo = getStatusInfo(product.status);
        
        return `
            <tr data-id="${product.id}">
                <td class="product-image-cell">
                    ${product.imageUrl 
                        ? `<img src="${escapeHtml(product.imageUrl)}" alt="${escapeHtml(product.name)}" class="product-image" onerror="this.outerHTML='<div class=\\'product-image-placeholder\\'>📷</div>'">`
                        : '<div class="product-image-placeholder">📷</div>'
                    }
                </td>
                <td>
                    <div class="product-name">${escapeHtml(product.name)}</div>
                    ${product.notes ? `<div class="product-notes">${escapeHtml(truncate(product.notes, 50))}</div>` : ''}
                </td>
                <td>${escapeHtml(product.season) || '<span class="po-empty">—</span>'}</td>
                <td>${escapeHtml(product.launchMonth) || '<span class="po-empty">—</span>'}</td>
                <td>${escapeHtml(product.vendor) || '<span class="po-empty">—</span>'}</td>
                <td>${product.poBulk ? `<span class="po-number">${escapeHtml(product.poBulk)}</span>` : '<span class="po-empty">—</span>'}</td>
                <td>${product.poTop ? `<span class="po-number">${escapeHtml(product.poTop)}</span>` : '<span class="po-empty">—</span>'}</td>
                <td>
                    <span class="status-badge status-${product.status}">
                        <span class="status-dot"></span>
                        ${statusInfo.label}
                    </span>
                </td>
                <td class="actions-cell">
                    <button class="action-btn edit" title="Edit" data-edit-id="${product.id}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                    <button class="action-btn delete" title="Delete" data-delete-id="${product.id}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
    
    // Attach event listeners
    tbody.querySelectorAll('.action-btn.edit').forEach(btn => {
        btn.addEventListener('click', () => openProductModal(parseInt(btn.dataset.editId)));
    });
    
    tbody.querySelectorAll('.action-btn.delete').forEach(btn => {
        btn.addEventListener('click', () => openDeleteModal(parseInt(btn.dataset.deleteId)));
    });
}

function updateStats() {
    const total = products.length;
    const pending = products.filter(p => p.status === 'pending' || p.status === 'ordered').length;
    const inProduction = products.filter(p => p.status === 'in_production' || p.status === 'shipped').length;
    const received = products.filter(p => p.status === 'received').length;
    
    document.getElementById('statTotal').textContent = total;
    document.getElementById('statPending').textContent = pending;
    document.getElementById('statProduction').textContent = inProduction;
    document.getElementById('statReceived').textContent = received;
}

// ============================================
// UTILITIES
// ============================================

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function truncate(text, maxLength) {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

// ============================================
// POLLING
// ============================================

async function pollForChanges() {
    if (getIsSyncing()) return;
    
    try {
        setIsSyncing(true);
        const changelog = await loadChangelogFromServer({ silent: true });
        setIsSyncing(false);
        
        if (changelog.length > lastKnownEventCount) {
            lastKnownEventCount = changelog.length;
            products = replayChangelog(changelog);
            renderProducts();
            updateStats();
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
    
    // Start polling for changes
    pollInterval = setInterval(pollForChanges, 5000);
});

