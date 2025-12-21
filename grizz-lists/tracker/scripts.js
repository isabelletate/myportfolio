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
    getStatusInfo,
    protoStatusTypes,
    getProtoStatusInfo
} from './shared.js';

import { API_BASE } from '../shared.js';

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
let pendingImageFile = null;
let editingProtoProductId = null;
let editingProtos = [];

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
const inputStyleNumber = document.getElementById('inputStyleNumber');
const inputStyleName = document.getElementById('inputStyleName');
const inputDescription = document.getElementById('inputDescription');
const inputColor = document.getElementById('inputColor');
const inputSizeScale = document.getElementById('inputSizeScale');
const inputUnits = document.getElementById('inputUnits');
const inputImageFile = document.getElementById('inputImageFile');
const inputSeason = document.getElementById('inputSeason');
const inputLaunchMonth = document.getElementById('inputLaunchMonth');
const inputVendor = document.getElementById('inputVendor');
const inputPoBulk = document.getElementById('inputPoBulk');
const inputPoTop = document.getElementById('inputPoTop');
const inputStatus = document.getElementById('inputStatus');
const inputNotes = document.getElementById('inputNotes');
const imagePreview = document.getElementById('imagePreview');
const fileName = document.getElementById('fileName');

// Delete modal elements
const deleteModalClose = document.getElementById('deleteModalClose');
const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
const deleteProductName = document.getElementById('deleteProductName');

// Proto modal elements
const protoModal = document.getElementById('protoModal');
const protoModalClose = document.getElementById('protoModalClose');
const protoProductInfo = document.getElementById('protoProductInfo');
const protoList = document.getElementById('protoList');
const addProtoBtn = document.getElementById('addProtoBtn');
const saveProtosBtn = document.getElementById('saveProtosBtn');

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
    
    // Image file selection
    inputImageFile.addEventListener('change', handleImageSelect);
    
    // Delete modal handlers
    deleteModalClose.addEventListener('click', closeDeleteModal);
    cancelDeleteBtn.addEventListener('click', closeDeleteModal);
    confirmDeleteBtn.addEventListener('click', confirmDelete);
    deleteModal.addEventListener('click', (e) => {
        if (e.target === deleteModal) closeDeleteModal();
    });
    
    // Proto modal handlers
    protoModalClose.addEventListener('click', closeProtoModal);
    protoModal.addEventListener('click', (e) => {
        if (e.target === protoModal) closeProtoModal();
    });
    addProtoBtn.addEventListener('click', addProto);
    saveProtosBtn.addEventListener('click', saveProtos);
    
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
    pendingImageFile = null;
    
    if (productId) {
        const product = products.find(p => p.id === productId);
        if (product) {
            modalTitle.textContent = 'Edit Product';
            inputStyleNumber.value = product.styleNumber || '';
            inputStyleName.value = product.styleName || '';
            inputDescription.value = product.description || '';
            inputColor.value = product.color || '';
            inputSizeScale.value = product.sizeScale || '';
            inputUnits.value = product.units || '';
            inputSeason.value = product.season || '';
            inputLaunchMonth.value = product.launchMonth || '';
            inputVendor.value = product.vendor || '';
            inputPoBulk.value = product.poBulk || '';
            inputPoTop.value = product.poTop || '';
            inputStatus.value = product.status || 'in_production';
            inputNotes.value = product.notes || '';
            inputImageFile.value = '';
            updateImagePreview(product.imageUrl);
        }
    } else {
        modalTitle.textContent = 'Add Product';
        productForm.reset();
        inputStatus.value = 'in_production';
        updateImagePreview();
    }
    
    productModal.classList.add('active');
    inputStyleNumber.focus();
}

function closeProductModal() {
    productModal.classList.remove('active');
    editingProductId = null;
    productForm.reset();
    updateImagePreview();
}

function handleImageSelect(e) {
    const file = e.target.files[0];
    if (file) {
        pendingImageFile = file;
        fileName.textContent = file.name;
        
        // Show preview
        const reader = new FileReader();
        reader.onload = (e) => {
            imagePreview.innerHTML = `<img src="${e.target.result}" alt="Preview">`;
        };
        reader.readAsDataURL(file);
    }
}

function updateImagePreview(imageUrl = null) {
    if (imageUrl) {
        const fullUrl = getProductImageUrl(imageUrl);
        imagePreview.innerHTML = `<img src="${escapeHtml(fullUrl)}" alt="Preview" onerror="this.parentElement.innerHTML='<span class=\\'image-preview-placeholder\\'>📷</span>'">`;
    } else {
        imagePreview.innerHTML = '<span class="image-preview-placeholder">📷</span>';
    }
    fileName.textContent = '';
    pendingImageFile = null;
}

function getProductImageUrl(imagePath) {
    if (!imagePath) return null;
    if (imagePath.startsWith('http')) return imagePath;
    const baseUrl = API_BASE.replace('/grizz.biz/grizz-lists', '');
    return `${baseUrl}${imagePath}`;
}

// ============================================
// PRODUCT OPERATIONS
// ============================================

async function uploadProductImage(file) {
    const uploadUrl = `${API_BASE}/lists/${listId}`;
    
    try {
        const formData = new FormData();
        formData.append('op', 'product_image');
        formData.append('image', file);
        
        const response = await fetch(uploadUrl, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.images && result.images.length > 0) {
            return result.images[0].path || result.images[0].url;
        }
        return null;
    } catch (error) {
        console.error('Failed to upload product image:', error);
        return null;
    }
}

async function saveProduct() {
    const description = inputDescription.value.trim();
    if (!description) {
        inputDescription.focus();
        return;
    }
    
    // Upload image if a new file was selected
    let imageUrl = '';
    if (pendingImageFile) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Uploading...';
        imageUrl = await uploadProductImage(pendingImageFile);
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Product';
    } else if (editingProductId) {
        // Keep existing image URL when editing
        const existingProduct = products.find(p => p.id === editingProductId);
        imageUrl = existingProduct?.imageUrl || '';
    }
    
    const productData = {
        styleNumber: inputStyleNumber.value.trim(),
        styleName: inputStyleName.value.trim(),
        description,
        color: inputColor.value.trim(),
        sizeScale: inputSizeScale.value,
        units: inputUnits.value.trim(),
        imageUrl,
        season: inputSeason.value,
        launchMonth: inputLaunchMonth.value,
        vendor: inputVendor.value,
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
    deleteProductName.textContent = `"${product.description}"?`;
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
// PROTO MANAGEMENT
// ============================================

function renderProtoSummary(product) {
    const protos = product.protos || [];
    
    if (protos.length === 0) {
        return `
            <span class="proto-badge empty" data-proto-product="${product.id}" title="Add protos">
                +
            </span>
        `;
    }
    
    // Get the last proto
    const lastProto = protos[protos.length - 1];
    const protoLabel = lastProto.name || `Proto ${protos.length}`;
    
    // Get the most recent status update from the last proto
    const lastUpdate = lastProto.updates && lastProto.updates.length > 0 
        ? lastProto.updates[lastProto.updates.length - 1] 
        : null;
    
    if (!lastUpdate) {
        return `
            <div class="proto-summary" data-proto-product="${product.id}" title="Manage protos">
                <span class="proto-summary-label">${escapeHtml(protoLabel)}</span>
                <span class="proto-status-tag proto-status-none">No updates</span>
            </div>
        `;
    }
    
    const statusInfo = getProtoStatusInfo(lastUpdate.type);
    
    return `
        <div class="proto-summary" data-proto-product="${product.id}" title="Manage protos">
            <span class="proto-summary-label">${escapeHtml(protoLabel)}</span>
            <span class="proto-status-tag" style="background: ${statusInfo.color}20; color: ${statusInfo.color}; border-color: ${statusInfo.color}40;">
                ${statusInfo.label}
            </span>
        </div>
    `;
}

function openProtoModal(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    
    editingProtoProductId = productId;
    editingProtos = JSON.parse(JSON.stringify(product.protos || [])); // Deep copy
    
    protoProductInfo.textContent = `${product.styleNumber || 'No Style#'} - ${product.description || 'No Description'}`;
    renderProtos();
    protoModal.classList.add('active');
}

function closeProtoModal() {
    protoModal.classList.remove('active');
    editingProtoProductId = null;
    editingProtos = [];
}

function addProto() {
    if (editingProtos.length >= 4) {
        alert('Maximum of 4 protos allowed per product.');
        return;
    }
    
    editingProtos.push({
        id: Date.now(),
        name: '',
        updates: []
    });
    renderProtos();
}

function removeProto(protoId) {
    editingProtos = editingProtos.filter(p => p.id !== protoId);
    renderProtos();
}

function addProtoUpdate(protoId) {
    const proto = editingProtos.find(p => p.id === protoId);
    if (!proto) return;
    
    proto.updates.push({
        id: Date.now(),
        type: 'sent',
        date: new Date().toISOString().split('T')[0],
        notes: ''
    });
    renderProtos();
}

function removeProtoUpdate(protoId, updateId) {
    const proto = editingProtos.find(p => p.id === protoId);
    if (!proto) return;
    
    proto.updates = proto.updates.filter(u => u.id !== updateId);
    renderProtos();
}

function renderProtos() {
    if (editingProtos.length === 0) {
        protoList.innerHTML = `
            <div class="empty-state" style="padding: 40px 20px;">
                <div class="empty-icon">📦</div>
                <h3 class="empty-title">No protos yet</h3>
                <p class="empty-text">Add a proto to track its progress</p>
            </div>
        `;
        return;
    }
    
    const statusOptionsHtml = protoStatusTypes.map(s => 
        `<option value="${s.value}">${s.label}</option>`
    ).join('');
    
    protoList.innerHTML = editingProtos.map((proto, index) => `
        <div class="proto-card" data-proto-id="${proto.id}">
            <div class="proto-header">
                <span class="proto-number">Proto ${index + 1}</span>
                <input type="text" class="proto-name-input" placeholder="Proto name (optional)" 
                       value="${escapeHtml(proto.name || '')}" data-field="name">
                <button type="button" class="proto-delete-btn" data-delete-proto="${proto.id}" title="Remove proto">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                </button>
            </div>
            <div class="proto-updates">
                ${proto.updates.map(update => `
                    <div class="proto-update-row" data-update-id="${update.id}">
                        <select data-field="type" data-update="${update.id}">
                            ${protoStatusTypes.map(s => 
                                `<option value="${s.value}" ${update.type === s.value ? 'selected' : ''}>${s.label}</option>`
                            ).join('')}
                        </select>
                        <input type="date" value="${update.date || ''}" data-field="date" data-update="${update.id}">
                        <input type="text" placeholder="Notes (optional)" value="${escapeHtml(update.notes || '')}" data-field="notes" data-update="${update.id}">
                        <button type="button" class="proto-update-delete" data-delete-update="${update.id}" data-proto="${proto.id}" title="Remove">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M18 6L6 18M6 6l12 12"/>
                            </svg>
                        </button>
                    </div>
                `).join('')}
            </div>
            <button type="button" class="add-update-btn" data-add-update="${proto.id}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 5v14M5 12h14"/>
                </svg>
                Add Status Update
            </button>
        </div>
    `).join('');
    
    // Attach event listeners
    protoList.querySelectorAll('.proto-delete-btn').forEach(btn => {
        btn.addEventListener('click', () => removeProto(parseInt(btn.dataset.deleteProto)));
    });
    
    protoList.querySelectorAll('.add-update-btn').forEach(btn => {
        btn.addEventListener('click', () => addProtoUpdate(parseInt(btn.dataset.addUpdate)));
    });
    
    protoList.querySelectorAll('.proto-update-delete').forEach(btn => {
        btn.addEventListener('click', () => removeProtoUpdate(parseInt(btn.dataset.proto), parseInt(btn.dataset.deleteUpdate)));
    });
    
    // Input change handlers
    protoList.querySelectorAll('.proto-name-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const card = e.target.closest('.proto-card');
            const protoId = parseInt(card.dataset.protoId);
            const proto = editingProtos.find(p => p.id === protoId);
            if (proto) proto.name = e.target.value;
        });
    });
    
    protoList.querySelectorAll('.proto-update-row select, .proto-update-row input').forEach(input => {
        input.addEventListener('change', (e) => {
            const updateId = parseInt(e.target.dataset.update);
            const field = e.target.dataset.field;
            const card = e.target.closest('.proto-card');
            const protoId = parseInt(card.dataset.protoId);
            
            const proto = editingProtos.find(p => p.id === protoId);
            if (!proto) return;
            
            const update = proto.updates.find(u => u.id === updateId);
            if (update) update[field] = e.target.value;
        });
    });
}

async function saveProtos() {
    if (!editingProtoProductId) return;
    
    saveProtosBtn.disabled = true;
    saveProtosBtn.textContent = 'Saving...';
    
    try {
        await addEvent('updated', { 
            id: editingProtoProductId, 
            protos: JSON.stringify(editingProtos)
        });
        
        // Update local state
        const product = products.find(p => p.id === editingProtoProductId);
        if (product) {
            product.protos = editingProtos;
        }
        
        closeProtoModal();
        renderProducts();
    } catch (error) {
        console.error('Failed to save protos:', error);
    } finally {
        saveProtosBtn.disabled = false;
        saveProtosBtn.textContent = 'Save Changes';
    }
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
            const statusOrder = ['in_production', 'approved_photo_sample', 'bulk_top', 'dropped'];
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
                        <th>Protos</th>
                        <th class="sortable" data-sort="styleNumber">Style#</th>
                        <th class="sortable" data-sort="styleName">Style Name</th>
                        <th class="sortable" data-sort="description">Description</th>
                        <th class="sortable" data-sort="color">Color</th>
                        <th class="sortable" data-sort="sizeScale">Size Scale</th>
                        <th class="sortable" data-sort="season">Season</th>
                        <th class="sortable" data-sort="launchMonth">Launch</th>
                        <th class="sortable" data-sort="vendor">Vendor</th>
                        <th>PO# (Bulk)</th>
                        <th>PO# (TOP)</th>
                        <th>Units</th>
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
                        ? `<img src="${escapeHtml(getProductImageUrl(product.imageUrl))}" alt="${escapeHtml(product.description)}" class="product-image" onerror="this.outerHTML='<div class=\\'product-image-placeholder\\'>📷</div>'">`
                        : '<div class="product-image-placeholder">📷</div>'
                    }
                </td>
                <td>
                    ${renderProtoSummary(product)}
                </td>
                <td>${escapeHtml(product.styleNumber) || '<span class="po-empty">—</span>'}</td>
                <td>${escapeHtml(product.styleName) || '<span class="po-empty">—</span>'}</td>
                <td>
                    <div class="product-name">${escapeHtml(product.description)}</div>
                    ${product.notes ? `<div class="product-notes">${escapeHtml(truncate(product.notes, 50))}</div>` : ''}
                </td>
                <td>${escapeHtml(product.color) || '<span class="po-empty">—</span>'}</td>
                <td>${escapeHtml(product.sizeScale) || '<span class="po-empty">—</span>'}</td>
                <td>${escapeHtml(product.season) || '<span class="po-empty">—</span>'}</td>
                <td>${escapeHtml(product.launchMonth) || '<span class="po-empty">—</span>'}</td>
                <td>${escapeHtml(product.vendor) || '<span class="po-empty">—</span>'}</td>
                <td>${product.poBulk ? `<span class="po-number">${escapeHtml(product.poBulk)}</span>` : '<span class="po-empty">—</span>'}</td>
                <td>${product.poTop ? `<span class="po-number">${escapeHtml(product.poTop)}</span>` : '<span class="po-empty">—</span>'}</td>
                <td>${escapeHtml(product.units) || '<span class="po-empty">—</span>'}</td>
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
    tbody.querySelectorAll('tr').forEach(row => {
        row.style.cursor = 'pointer';
        row.addEventListener('click', (e) => {
            // Don't trigger if clicking on action buttons
            if (e.target.closest('.action-btn')) return;
            const productId = parseInt(row.dataset.id);
            openProductModal(productId);
        });
    });
    
    tbody.querySelectorAll('.action-btn.edit').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            openProductModal(parseInt(btn.dataset.editId));
        });
    });
    
    tbody.querySelectorAll('.action-btn.delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            openDeleteModal(parseInt(btn.dataset.deleteId));
        });
    });
    
    // Proto badge/summary click handlers
    tbody.querySelectorAll('.proto-badge, .proto-summary').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            openProtoModal(parseInt(el.dataset.protoProduct));
        });
    });
}

function updateStats() {
    const total = products.length;
    const inProduction = products.filter(p => p.status === 'in_production').length;
    const photoSample = products.filter(p => p.status === 'approved_photo_sample').length;
    const bulkTop = products.filter(p => p.status === 'bulk_top').length;
    
    document.getElementById('statTotal').textContent = total;
    document.getElementById('statInProduction').textContent = inProduction;
    document.getElementById('statPhotoSample').textContent = photoSample;
    document.getElementById('statBulkTop').textContent = bulkTop;
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

