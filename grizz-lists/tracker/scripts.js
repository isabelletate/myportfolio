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

import { API_BASE, createPoller } from '../shared.js';

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
let pendingImageFile = null;
let editingProtoProductId = null;
let editingProtos = [];
let editingUpdateId = null; // Track which update row is in edit mode

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
const inputLaunchDate = document.getElementById('inputLaunchDate');
const inputVendor = document.getElementById('inputVendor');
const inputPoBulk = document.getElementById('inputPoBulk');
const inputPoTop = document.getElementById('inputPoTop');
const inputStatus = document.getElementById('inputStatus');
const inputUrgent = document.getElementById('inputUrgent');
const inputFabric = document.getElementById('inputFabric');
const inputContent = document.getElementById('inputContent');
const inputFabricApprovalDate = document.getElementById('inputFabricApprovalDate');
const inputColorApprovalDate = document.getElementById('inputColorApprovalDate');
const inputTrimsApprovalDate = document.getElementById('inputTrimsApprovalDate');
const inputNotes = document.getElementById('inputNotes');
const materialsSection = document.getElementById('materialsSection');
const materialsToggle = document.getElementById('materialsToggle');
const imagePreview = document.getElementById('imagePreview');
const fileName = document.getElementById('fileName');
// New date fields
const inputTpReleaseDate = document.getElementById('inputTpReleaseDate');
const inputPhotoSampleDueDate = document.getElementById('inputPhotoSampleDueDate');
const inputApprovalDueDateFabProd = document.getElementById('inputApprovalDueDateFabProd');
const inputTopDate = document.getElementById('inputTopDate');
const inputPassedToRetailDate = document.getElementById('inputPassedToRetailDate');
const inputCancelDate = document.getElementById('inputCancelDate');
const inputOwnDocUpdate = document.getElementById('inputOwnDocUpdate');
const datesSection = document.getElementById('datesSection');
const datesToggle = document.getElementById('datesToggle');

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

async function syncAndRender() {
    // Resync from server before rendering to ensure consistency
    const changelog = await loadChangelogFromServer({ silent: true });
    products = replayChangelog(changelog);
    lastKnownEventCount = changelog.length;
    renderProducts();
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
    
    // Materials section toggle
    materialsToggle.addEventListener('click', () => {
        materialsSection.classList.toggle('open');
    });
    
    // Dates section toggle
    datesToggle.addEventListener('click', () => {
        datesSection.classList.toggle('open');
    });
    
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
            inputLaunchDate.value = product.launchDate || '';
            inputVendor.value = product.vendor || '';
            inputPoBulk.value = product.poBulk || '';
            inputPoTop.value = product.poTop || '';
            inputStatus.value = product.status || 'in_production';
            inputUrgent.checked = product.urgent || false;
            inputFabric.value = product.fabric || '';
            inputContent.value = product.content || '';
            inputFabricApprovalDate.value = product.fabricApprovalDate || '';
            inputColorApprovalDate.value = product.colorApprovalDate || '';
            inputTrimsApprovalDate.value = product.trimsApprovalDate || '';
            inputNotes.value = product.notes || '';
            inputImageFile.value = '';
            updateImagePreview(product.imageUrl);
            // New date fields
            inputTpReleaseDate.value = product.tpReleaseDate || '';
            inputPhotoSampleDueDate.value = product.photoSampleDueDate || '';
            inputApprovalDueDateFabProd.value = product.approvalDueDateFabProd || '';
            inputTopDate.value = product.topDate || '';
            inputPassedToRetailDate.value = product.passedToRetailDate || '';
            inputCancelDate.value = product.cancelDate || '';
            inputOwnDocUpdate.value = product.ownDocUpdate || '';
            
            // Open materials section if any field has data
            if (product.fabric || product.content || product.fabricApprovalDate || product.colorApprovalDate || product.trimsApprovalDate) {
                materialsSection.classList.add('open');
            } else {
                materialsSection.classList.remove('open');
            }
            
            // Open dates section if any field has data
            if (product.tpReleaseDate || product.photoSampleDueDate || product.approvalDueDateFabProd || product.topDate || product.passedToRetailDate || product.cancelDate || product.ownDocUpdate) {
                datesSection.classList.add('open');
            } else {
                datesSection.classList.remove('open');
            }
        }
    } else {
        modalTitle.textContent = 'Add Product';
        productForm.reset();
        inputStatus.value = 'in_production';
        inputUrgent.checked = false;
        materialsSection.classList.remove('open');
        datesSection.classList.remove('open');
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
        launchDate: inputLaunchDate.value,
        vendor: inputVendor.value,
        poBulk: inputPoBulk.value.trim(),
        poTop: inputPoTop.value.trim(),
        status: inputStatus.value,
        urgent: inputUrgent.checked,
        fabric: inputFabric.value.trim(),
        content: inputContent.value.trim(),
        fabricApprovalDate: inputFabricApprovalDate.value,
        colorApprovalDate: inputColorApprovalDate.value,
        trimsApprovalDate: inputTrimsApprovalDate.value,
        notes: inputNotes.value.trim(),
        // New date fields
        tpReleaseDate: inputTpReleaseDate.value,
        photoSampleDueDate: inputPhotoSampleDueDate.value,
        approvalDueDateFabProd: inputApprovalDueDateFabProd.value,
        topDate: inputTopDate.value,
        passedToRetailDate: inputPassedToRetailDate.value,
        cancelDate: inputCancelDate.value,
        ownDocUpdate: inputOwnDocUpdate.value
    };
    
    if (editingProductId) {
        // Update existing product
        await addEvent('updated', { id: editingProductId, ...productData });
    } else {
        // Add new product
        const id = Date.now();
        await addEvent('added', { id, ...productData });
    }
    
    closeProductModal();
    await syncAndRender();
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
    await syncAndRender();
}

// ============================================
// PROTO MANAGEMENT
// ============================================

function formatProtoDate(dateStr) {
    if (!dateStr) return '';
    
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';
    
    const now = new Date();
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    const month = date.getMonth() + 1;
    const day = date.getDate();
    
    if (date < sixMonthsAgo) {
        // Include year for dates older than 6 months
        return `${month}/${day}/${date.getFullYear()}`;
    } else {
        // Just M/D for recent dates
        return `${month}/${day}`;
    }
}

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
    const dateStr = formatProtoDate(lastUpdate.date);
    
    return `
        <div class="proto-summary" data-proto-product="${product.id}" title="Manage protos">
            <span class="proto-summary-label">${escapeHtml(protoLabel)}</span>
            <span class="proto-status-tag" style="background: ${statusInfo.color}15; color: ${statusInfo.color}; border-color: ${statusInfo.color};">
                ${statusInfo.label}${dateStr ? ` · ${dateStr}` : ''}
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
    editingUpdateId = null;
}

function setEditingUpdate(updateId) {
    editingUpdateId = updateId;
    renderProtos();
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
    
    const newUpdateId = Date.now();
    proto.updates.push({
        id: newUpdateId,
        type: 'sent',
        date: new Date().toISOString().split('T')[0],
        notes: ''
    });
    editingUpdateId = newUpdateId; // Automatically enter edit mode for new update
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
                ${proto.updates.map(update => {
                    const statusInfo = getProtoStatusInfo(update.type);
                    const isEditing = editingUpdateId === update.id;
                    const dateDisplay = update.date ? formatProtoDate(update.date) : '';
                    
                    if (isEditing) {
                        return `
                            <div class="proto-update-row editing" data-update-id="${update.id}" style="background: ${statusInfo.color}15; border-color: ${statusInfo.color};">
                                <select data-field="type" data-update="${update.id}">
                                    ${protoStatusTypes.map(s => 
                                        `<option value="${s.value}" ${update.type === s.value ? 'selected' : ''}>${s.label}</option>`
                                    ).join('')}
                                </select>
                                <input type="date" value="${update.date || ''}" data-field="date" data-update="${update.id}">
                                <input type="text" placeholder="Notes (optional)" value="${escapeHtml(update.notes || '')}" data-field="notes" data-update="${update.id}">
                                <button type="button" class="proto-update-done" data-done-update="${update.id}" title="Done" style="background: ${statusInfo.color};">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <polyline points="20 6 9 17 4 12"></polyline>
                                    </svg>
                                </button>
                                <button type="button" class="proto-update-cancel" data-cancel-update="${update.id}" title="Cancel">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <path d="M18 6L6 18M6 6l12 12"/>
                                    </svg>
                                </button>
                            </div>
                        `;
                    } else {
                        return `
                            <div class="proto-update-row view-mode" data-update-id="${update.id}" data-edit-update="${update.id}" style="background: ${statusInfo.color}15; border-color: ${statusInfo.color};">
                                <span class="update-status" style="color: ${statusInfo.color};">${statusInfo.label}</span>
                                <span class="update-date">${dateDisplay || '—'}</span>
                                <span class="update-notes">${escapeHtml(update.notes) || '—'}</span>
                                <button type="button" class="proto-update-delete view-delete" data-delete-update="${update.id}" data-proto="${proto.id}" title="Remove" style="color: ${statusInfo.color};">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <path d="M18 6L6 18M6 6l12 12"/>
                                    </svg>
                                </button>
                            </div>
                        `;
                    }
                }).join('')}
            </div>
            <button type="button" class="add-update-btn" data-add-update="${proto.id}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 5v14M5 12h14"/>
                </svg>
                Add Status Update
            </button>
            <div class="proto-photo-sample">
                <label class="photo-sample-checkbox">
                    <input type="checkbox" class="photo-sample-check" data-proto="${proto.id}" ${proto.isPhotoSample ? 'checked' : ''}>
                    <span class="checkbox-text">📸 Photo Sample</span>
                </label>
                <div class="photo-sample-date-wrapper ${proto.isPhotoSample ? 'visible' : ''}">
                    <label class="photo-sample-date-label">Passed:</label>
                    <input type="date" class="photo-sample-date" data-proto="${proto.id}" value="${proto.passedPhotoSampleDate || ''}">
                </div>
            </div>
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
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            removeProtoUpdate(parseInt(btn.dataset.proto), parseInt(btn.dataset.deleteUpdate));
        });
    });
    
    // Click on view-mode row to enter edit mode
    protoList.querySelectorAll('.proto-update-row.view-mode').forEach(row => {
        row.addEventListener('click', (e) => {
            if (e.target.closest('.proto-update-delete')) return;
            setEditingUpdate(parseInt(row.dataset.editUpdate));
        });
    });
    
    // Done button to exit edit mode
    protoList.querySelectorAll('.proto-update-done').forEach(btn => {
        btn.addEventListener('click', () => {
            editingUpdateId = null;
            renderProtos();
        });
    });
    
    // Cancel button to exit edit mode (same as done, just exits)
    protoList.querySelectorAll('.proto-update-cancel').forEach(btn => {
        btn.addEventListener('click', () => {
            editingUpdateId = null;
            renderProtos();
        });
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
    
    // Photo sample checkbox handlers
    protoList.querySelectorAll('.photo-sample-check').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const protoId = parseInt(e.target.dataset.proto);
            const proto = editingProtos.find(p => p.id === protoId);
            if (proto) {
                proto.isPhotoSample = e.target.checked;
                if (!e.target.checked) {
                    proto.passedPhotoSampleDate = '';
                }
                renderProtos();
            }
        });
    });
    
    // Photo sample date handlers
    protoList.querySelectorAll('.photo-sample-date').forEach(input => {
        input.addEventListener('change', (e) => {
            const protoId = parseInt(e.target.dataset.proto);
            const proto = editingProtos.find(p => p.id === protoId);
            if (proto) {
                proto.passedPhotoSampleDate = e.target.value;
            }
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
        
        closeProtoModal();
        await syncAndRender();
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
                        <th class="sortable" data-sort="launchDate">Launch</th>
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
            <tr data-id="${product.id}" class="${product.urgent ? 'urgent' : ''}">
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
                <td>${formatLaunchMonth(product.launchDate) || '<span class="po-empty">—</span>'}</td>
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

function formatLaunchMonth(launchDate) {
    if (!launchDate) return '';
    const date = new Date(launchDate);
    if (isNaN(date.getTime())) return '';
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 
                    'July', 'August', 'September', 'October', 'November', 'December'];
    return months[date.getMonth()];
}

function formatDateShort(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';
    return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear().toString().slice(-2)}`;
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
    
    // Start polling with focus/blur handling
    createPoller(pollForChanges, 5000);
});

