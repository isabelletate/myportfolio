// ============================================
// TIMELINE VIEW - Product Date Visualization
// ============================================

import {
    loadChangelogFromServer,
    loadChangelog,
    replayChangelog,
    listId,
    protoStatusTypes,
    getProtoStatusInfo
} from '../shared.js';

import { API_BASE, createPoller } from '../../shared.js';

// If no list ID, redirect to main page
if (!listId) {
    window.location.href = '../../index.html';
}

// ============================================
// STATE
// ============================================

let products = [];
let selectedProductId = null;

// ============================================
// DOM ELEMENTS
// ============================================

const productList = document.getElementById('productList');
const productCount = document.getElementById('productCount');
const searchInput = document.getElementById('searchInput');
const timelineEmpty = document.getElementById('timelineEmpty');
const timelineContent = document.getElementById('timelineContent');
const timeline = document.getElementById('timeline');
const selectedProductName = document.getElementById('selectedProductName');
const selectedProductMeta = document.getElementById('selectedProductMeta');
const selectedProductImage = document.getElementById('selectedProductImage');

// ============================================
// DATE FIELD DEFINITIONS
// ============================================

const dateFields = [
    { key: 'tpReleaseDate', label: 'TP Release', category: 'key-dates', description: 'Technical package released to vendor' },
    { key: 'fabricApprovalDate', label: 'Fabric Approved', category: 'materials', description: 'Fabric approved for production' },
    { key: 'colorApprovalDate', label: 'Color Approved', category: 'materials', description: 'Color approved for production' },
    { key: 'trimsApprovalDate', label: 'Trims Approved', category: 'materials', description: 'Trims approved for production' },
    { key: 'photoSampleDueDate', label: 'Photo Sample Due', category: 'key-dates', description: 'Photo sample expected' },
    { key: 'approvalDueDateFabProd', label: 'Approval Due (Fab. Prod.)', category: 'key-dates', description: 'Approval needed for fabric production' },
    { key: 'topDate', label: 'TOP Date', category: 'key-dates', description: 'Top of production' },
    { key: 'passedToRetailDate', label: 'Passed to Retail', category: 'key-dates', description: 'Product passed to retail' },
    { key: 'launchDate', label: 'Launch', category: 'key-dates', description: 'Product launch date' },
    { key: 'cancelDate', label: 'Cancel Date (XF)', category: 'key-dates', description: 'Order cancellation deadline' },
    { key: 'ownDocUpdate', label: 'Own Doc Update', category: 'key-dates', description: 'Documentation updated' }
];

// ============================================
// UTILITIES
// ============================================

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr + 'T00:00:00');
    if (isNaN(date.getTime())) return '';
    
    const options = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
    return date.toLocaleDateString('en-US', options);
}

function getDateStatus(dateStr) {
    if (!dateStr) return 'none';
    
    const date = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const diffTime = date.getTime() - today.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'today';
    if (diffDays < 0) return 'past';
    return 'future';
}

function getProductImageUrl(imageUrl) {
    if (!imageUrl) return '';
    if (imageUrl.startsWith('data:') || imageUrl.startsWith('http')) {
        return imageUrl;
    }
    return `${API_BASE}/image/${imageUrl}`;
}

// ============================================
// RENDERING
// ============================================

function renderProductList(filter = '') {
    const filtered = products.filter(p => {
        if (!filter) return true;
        const search = filter.toLowerCase();
        return (
            (p.description || '').toLowerCase().includes(search) ||
            (p.styleNumber || '').toLowerCase().includes(search) ||
            (p.styleName || '').toLowerCase().includes(search)
        );
    });
    
    productCount.textContent = `${filtered.length} product${filtered.length !== 1 ? 's' : ''}`;
    
    if (filtered.length === 0) {
        productList.innerHTML = `
            <div class="timeline-no-events">
                <div class="timeline-no-events-icon">📦</div>
                <p class="timeline-no-events-text">No products found</p>
            </div>
        `;
        return;
    }
    
    productList.innerHTML = filtered.map(product => `
        <div class="product-item ${selectedProductId === product.id ? 'selected' : ''}" data-id="${product.id}">
            <div class="product-item-image">
                ${product.imageUrl 
                    ? `<img src="${escapeHtml(getProductImageUrl(product.imageUrl))}" alt="" onerror="this.parentElement.innerHTML='📦'">`
                    : '📦'
                }
            </div>
            <div class="product-item-info">
                <div class="product-item-name">${escapeHtml(product.description) || 'Untitled'}</div>
                <div class="product-item-meta">${escapeHtml(product.styleNumber) || 'No Style#'}${product.season ? ` · ${product.season}` : ''}</div>
            </div>
        </div>
    `).join('');
    
    // Attach click handlers
    productList.querySelectorAll('.product-item').forEach(item => {
        item.addEventListener('click', () => {
            selectProduct(parseFloat(item.dataset.id));
        });
    });
}

function selectProduct(productId) {
    selectedProductId = productId;
    const product = products.find(p => p.id === productId);
    
    if (!product) {
        timelineEmpty.classList.remove('hidden');
        timelineContent.classList.add('hidden');
        return;
    }
    
    // Update sidebar selection
    productList.querySelectorAll('.product-item').forEach(item => {
        item.classList.toggle('selected', parseFloat(item.dataset.id) === productId);
    });
    
    // Update header
    selectedProductName.textContent = product.description || 'Untitled';
    selectedProductMeta.textContent = [
        product.styleNumber,
        product.styleName,
        product.season,
        product.vendor
    ].filter(Boolean).join(' · ') || 'No details';
    
    selectedProductImage.innerHTML = product.imageUrl
        ? `<img src="${escapeHtml(getProductImageUrl(product.imageUrl))}" alt="" onerror="this.parentElement.innerHTML='📦'">`
        : '📦';
    
    // Show timeline
    timelineEmpty.classList.add('hidden');
    timelineContent.classList.remove('hidden');
    
    renderTimeline(product);
}

function renderTimeline(product) {
    // Collect all date events
    const events = [];
    
    // Add standard date fields
    for (const field of dateFields) {
        const dateValue = product[field.key];
        if (dateValue) {
            events.push({
                date: dateValue,
                label: field.label,
                description: field.description,
                category: field.category
            });
        }
    }
    
    // Add proto updates
    const protos = product.protos || [];
    protos.forEach((proto, protoIndex) => {
        const protoName = proto.name || `Proto ${protoIndex + 1}`;
        const updates = proto.updates || [];
        
        updates.forEach(update => {
            if (update.date) {
                const statusInfo = getProtoStatusInfo(update.type);
                events.push({
                    date: update.date,
                    label: `${protoName}: ${statusInfo.label}`,
                    description: update.notes || `Proto status updated`,
                    category: 'protos'
                });
            }
        });
    });
    
    // Sort by date
    events.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    if (events.length === 0) {
        timeline.innerHTML = `
            <div class="timeline-no-events">
                <div class="timeline-no-events-icon">📅</div>
                <p class="timeline-no-events-text">No dates recorded for this product</p>
            </div>
        `;
        return;
    }
    
    timeline.innerHTML = events.map(event => {
        const status = getDateStatus(event.date);
        return `
            <div class="timeline-event ${status}">
                <div class="timeline-dot"></div>
                <div class="timeline-card">
                    <div class="timeline-date">${formatDate(event.date)}${status === 'today' ? ' — Today' : ''}</div>
                    <div class="timeline-title">${escapeHtml(event.label)}</div>
                    <div class="timeline-description">${escapeHtml(event.description)}</div>
                    <span class="timeline-category ${event.category}">${event.category.replace('-', ' ')}</span>
                </div>
            </div>
        `;
    }).join('');
}

// ============================================
// DATA LOADING
// ============================================

async function loadProducts() {
    try {
        const changelog = await loadChangelogFromServer();
        products = replayChangelog(changelog);
        renderProductList();
        
        // Check if there's a product ID in the URL hash
        const hash = window.location.hash.slice(1);
        if (hash) {
            if (products.find(p => p.id === hash)) {
                selectProduct(hash);
            }
        }
    } catch (err) {
        console.error('Failed to load products:', err);
        // Try loading from local storage
        const changelog = await loadChangelog();
        products = replayChangelog(changelog);
        renderProductList();
    }
}

// ============================================
// EVENT LISTENERS
// ============================================

searchInput.addEventListener('input', (e) => {
    renderProductList(e.target.value);
});

// Update URL hash when product is selected
window.addEventListener('hashchange', () => {
    const hash = window.location.hash.slice(1);
    if (hash) {
        if (hash !== selectedProductId && products.find(p => p.id === hash)) {
            selectProduct(hash);
        }
    }
});

// ============================================
// INITIALIZATION
// ============================================

// Update back link to include list ID
const backLink = document.querySelector('.back-link');
if (backLink && listId) {
    backLink.href = `../index.html?list=${listId}`;
}

loadProducts();

