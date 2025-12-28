// ============================================
// TRACKER - Import Module
// Dynamically loaded when import button is clicked
// ============================================

import { generateId } from '../shared.js';

// Load CSS
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = 'import.css';
document.head.appendChild(link);

// ============================================
// STATE
// ============================================

let parsedImportData = [];
let addEventFn = null;
let syncAndRenderFn = null;
let escapeHtmlFn = null;
let formatDateShortFn = null;

// DOM Elements
const importModal = document.getElementById('importModal');
const importTextarea = document.getElementById('importTextarea');
const parseImportBtn = document.getElementById('parseImportBtn');
const importStepPaste = document.getElementById('importStepPaste');
const importStepPreview = document.getElementById('importStepPreview');
const importSummary = document.getElementById('importSummary');
const importPreviewList = document.getElementById('importPreviewList');
const cancelImportBtn = document.getElementById('cancelImportBtn');
const backImportBtn = document.getElementById('backImportBtn');
const confirmImportBtn = document.getElementById('confirmImportBtn');
const importModalClose = document.getElementById('importModalClose');

// ============================================
// INITIALIZATION
// ============================================

export function initImport({ addEvent, syncAndRender, escapeHtml, formatDateShort }) {
    addEventFn = addEvent;
    syncAndRenderFn = syncAndRender;
    escapeHtmlFn = escapeHtml;
    formatDateShortFn = formatDateShort;
    
    // Setup event listeners
    importModalClose.addEventListener('click', closeImportModal);
    cancelImportBtn.addEventListener('click', closeImportModal);
    importModal.addEventListener('click', (e) => {
        if (e.target === importModal) closeImportModal();
    });
    parseImportBtn.addEventListener('click', parseImportData);
    backImportBtn.addEventListener('click', showImportPasteStep);
    confirmImportBtn.addEventListener('click', confirmImport);
}

// ============================================
// MODAL CONTROL
// ============================================

export function openImportModal() {
    importModal.classList.add('active');
    showImportPasteStep();
    importTextarea.value = '';
    importTextarea.focus();
}

function closeImportModal() {
    importModal.classList.remove('active');
    parsedImportData = [];
}

function showImportPasteStep() {
    importStepPaste.classList.remove('hidden');
    importStepPreview.classList.add('hidden');
    parseImportBtn.classList.remove('hidden');
    backImportBtn.classList.add('hidden');
    confirmImportBtn.classList.add('hidden');
}

function showImportPreviewStep() {
    importStepPaste.classList.add('hidden');
    importStepPreview.classList.remove('hidden');
    parseImportBtn.classList.add('hidden');
    backImportBtn.classList.remove('hidden');
    confirmImportBtn.classList.remove('hidden');
}

// ============================================
// TSV PARSING
// ============================================

// Normalize smart/curly quotes to straight quotes
function normalizeQuotes(text) {
    return text
        .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')  // Various double quotes
        .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'"); // Various single quotes
}

// Parse TSV with support for quoted fields containing newlines
function parseTSV(text) {
    // Pre-process: normalize smart quotes
    text = normalizeQuotes(text);
    
    const rows = [];
    let currentRow = [];
    let currentField = '';
    let inQuotes = false;
    let fieldStart = true; // Track if we're at the start of a new field
    
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = text[i + 1];
        
        if (inQuotes) {
            if (char === '"' && nextChar === '"') {
                // Escaped quote
                currentField += '"';
                i++;
            } else if (char === '"') {
                // End of quoted field
                inQuotes = false;
            } else {
                currentField += char;
            }
        } else {
            if (char === '"' && fieldStart) {
                // Start of quoted field - only if we're at field start
                inQuotes = true;
            } else if (char === '\t') {
                // Field separator
                currentRow.push(currentField.trim());
                currentField = '';
                fieldStart = true; // Next char starts a new field
            } else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
                // Row separator
                if (char === '\r') i++; // Skip \n in \r\n
                currentRow.push(currentField.trim());
                if (currentRow.some(f => f)) { // Only add non-empty rows
                    rows.push(currentRow);
                }
                currentRow = [];
                currentField = '';
                fieldStart = true; // Next char starts a new field
            } else {
                currentField += char;
                // After any non-whitespace character, we're no longer at field start
                if (char !== ' ' && char !== '\t') {
                    fieldStart = false;
                }
            }
        }
    }
    
    // Add final field and row
    currentRow.push(currentField.trim());
    if (currentRow.some(f => f)) {
        rows.push(currentRow);
    }
    
    return rows;
}

// ============================================
// COLUMN MAPPING
// ============================================

const columnMappings = {
    '#': null, // Row number, ignore
    'status': null, // We have our own status system
    'cad/sketch': 'imageNote', // Note about image
    'season': 'season',
    'launch month': null, // We infer from launch date
    'vendor': 'vendor',
    'po# (bulk)': 'poBulk',
    'po # (bulk)': 'poBulk',
    'po # (top)': 'poTop',
    'po# (top)': 'poTop',
    'style #': 'styleNumber',
    'style name': 'styleName',
    'description': 'description',
    'color': 'color',
    'units': 'units',
    'size scale': 'sizeScale',
    'tp release date': 'tpReleaseDate',
    '1st proto': 'proto1',
    '2nd proto': 'proto2',
    '3rd proto': 'proto3',
    '4th proto': 'proto4',
    'photo sample': 'photoSampleNote',
    'passed photo samples?': 'passedPhotoSamplesNote',
    'photo sample due date': 'photoSampleDueDate',
    'approval due date - fab. prod. (90 days bf xf)': 'approvalDueDateFabProd',
    'approval due date - fab. prod.': 'approvalDueDateFabProd',
    'top': 'topDate',
    'passed to retail date': 'passedToRetailDate',
    'own doc update (specs, fiber content, instructions)': 'ownDocUpdate',
    'own doc update': 'ownDocUpdate',
    'fabric': 'fabric',
    'content': 'content',
    'fabric approvals': 'fabricApprovalDate',
    'color approvals': 'colorApprovalDate',
    'trims': 'trimsApprovalDate',
    'launch date': 'launchDate',
    'cancel date (xf date)': 'cancelDate',
    'cancel date': 'cancelDate',
    'notes': 'notes'
};

// ============================================
// DATE PARSING
// ============================================

function parseImportDate(dateStr) {
    if (!dateStr) return '';
    
    // Clean up the string
    dateStr = dateStr.trim();
    
    // Try to extract just a date if there's extra text
    const dateMatch = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-]?(\d{2,4})?/);
    if (!dateMatch) return '';
    
    let month = parseInt(dateMatch[1]);
    let day = parseInt(dateMatch[2]);
    let year = dateMatch[3] ? parseInt(dateMatch[3]) : new Date().getFullYear();
    
    // Handle 2-digit years
    if (year < 100) {
        year += year > 50 ? 1900 : 2000;
    }
    
    // Validate
    if (month < 1 || month > 12 || day < 1 || day > 31) return '';
    
    // Return in YYYY-MM-DD format
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// ============================================
// PROTO PARSING
// ============================================

// Generate unique IDs using shared base62 generator
function generateUniqueId() {
    return generateId();
}

function parseProtoData(protoStr, protoNumber) {
    if (!protoStr || !protoStr.trim()) return null;
    
    const lines = protoStr.split('\n').map(l => l.trim()).filter(l => l);
    if (lines.length === 0) return null;
    
    const proto = {
        id: generateUniqueId(),
        name: '',
        notes: '', // Proto-level notes/comments
        updates: [],
        isPhotoSample: false,
        passedPhotoSampleDate: ''
    };
    
    const unmappedLines = [];
    const commentLines = []; // Text lines like "Pink / White" that are comments
    
    // Status code mapping
    const statusCodes = {
        'S': 'sent',
        'R': 'received',
        'C': 'comments',
        'F': 'fit',
        'A': 'approved_photo_sample',
        'X': 'comments', // Crossed out / issue
        'AWC': 'approved_photo_sample' // Approved with comments
    };
    
    for (const line of lines) {
        // Try to parse date + status code patterns like "10/17S" or "10/17 S"
        const statusMatch = line.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-]?\d{0,4})?\s*([A-Z]{1,3})?$/i);
        
        if (statusMatch) {
            const statusCode = statusMatch[3]?.toUpperCase();
            const statusType = statusCodes[statusCode] || 'sent';
            
            // Get year - use current year for simplicity
            const now = new Date();
            const month = parseInt(statusMatch[1]);
            let year = now.getFullYear();
            // If month is in the future, assume last year
            if (month > now.getMonth() + 4) {
                year--;
            }
            
            const parsedDate = parseImportDate(`${statusMatch[1]}/${statusMatch[2]}/${year}`);
            
            if (parsedDate) {
                proto.updates.push({
                    id: generateUniqueId(),
                    type: statusType,
                    date: parsedDate,
                    notes: ''
                });
            }
        } else if (line.match(/^\(/)) {
            // Note in parentheses - add to last update as notes
            const noteText = line.replace(/^\(|\)$/g, '').trim();
            if (proto.updates.length > 0) {
                const lastUpdate = proto.updates[proto.updates.length - 1];
                lastUpdate.notes = lastUpdate.notes ? lastUpdate.notes + ' ' + noteText : noteText;
            } else {
                commentLines.push(noteText);
            }
        } else if (!line.match(/^\d/)) {
            // Text line (like color name "Pink / White") - these are comments about the proto
            commentLines.push(line);
        } else {
            unmappedLines.push(line);
        }
    }
    
    // Add comment lines to proto-level notes
    if (commentLines.length > 0) {
        proto.notes = commentLines.join(' | ');
    }
    
    // Check for photo sample approval
    const fullText = protoStr.toLowerCase();
    if (fullText.includes('approved') && (fullText.includes('photo') || fullText.includes('ps'))) {
        proto.isPhotoSample = true;
    }
    
    return { proto, unmappedLines };
}

// ============================================
// IMPORT DATA PARSING
// ============================================

function parseImportData() {
    console.log('[Parse] Starting parse');
    const rawData = importTextarea.value;
    if (!rawData.trim()) {
        alert('Please paste some data first.');
        return;
    }
    
    const rows = parseTSV(rawData);
    console.log('[Parse] Parsed rows:', rows.length);
    
    if (rows.length < 2) {
        alert('Data must include a header row and at least one data row.');
        return;
    }
    
    // First row is headers
    const headers = rows[0].map(h => h.toLowerCase().replace(/\s+/g, ' ').trim());
    console.log('[Parse] Headers:', headers);
    const dataRows = rows.slice(1);
    console.log('[Parse] Data rows:', dataRows.length);
    
    parsedImportData = [];
    
    for (const row of dataRows) {
        const product = {
            id: generateUniqueId(),
            styleNumber: '',
            styleName: '',
            description: '',
            color: '',
            sizeScale: '',
            units: '',
            imageUrl: '',
            season: '',
            launchDate: '',
            vendor: '',
            poBulk: '',
            poTop: '',
            status: 'in_production',
            urgent: false,
            fabric: '',
            content: '',
            fabricApprovalDate: '',
            colorApprovalDate: '',
            trimsApprovalDate: '',
            tpReleaseDate: '',
            photoSampleDueDate: '',
            approvalDueDateFabProd: '',
            topDate: '',
            passedToRetailDate: '',
            cancelDate: '',
            ownDocUpdate: '',
            notes: '',
            protos: []
        };
        
        const warnings = [];
        const unmappedData = [];
        
        for (let i = 0; i < headers.length; i++) {
            const header = headers[i];
            const value = row[i] || '';
            
            if (!value) continue;
            
            const mapping = columnMappings[header];
            
            if (mapping === null) {
                // Explicitly ignored
                continue;
            } else if (mapping === undefined) {
                // Unknown column
                unmappedData.push(`${header}: ${value}`);
            } else if (mapping.startsWith('proto')) {
                // Proto column
                const protoNum = parseInt(mapping.replace('proto', ''));
                const result = parseProtoData(value, protoNum);
                if (result) {
                    product.protos.push(result.proto);
                    if (result.unmappedLines.length > 0) {
                        warnings.push(`Proto ${protoNum}: Some entries not parsed`);
                    }
                }
            } else if (mapping.endsWith('Date')) {
                // Date field
                const parsedDate = parseImportDate(value);
                if (parsedDate) {
                    product[mapping] = parsedDate;
                } else if (value.trim()) {
                    // Could not parse date - add to notes
                    warnings.push(`${header}: "${value}" (date not parsed)`);
                    unmappedData.push(`${header}: ${value}`);
                }
            } else if (mapping.endsWith('Note')) {
                // Note fields - add to product notes
                if (value.trim()) {
                    unmappedData.push(`${header}: ${value}`);
                }
            } else if (mapping === 'season') {
                // Normalize season
                const seasonVal = value.toUpperCase();
                if (seasonVal.includes('SPRING')) product.season = 'Spring 2026';
                else if (seasonVal.includes('SUMMER')) product.season = 'Summer 2026';
                else if (seasonVal.includes('FALL')) product.season = 'Fall 2026';
                else if (seasonVal.includes('HOLIDAY')) product.season = 'Holiday 2026';
                else if (seasonVal.includes('WINTER')) product.season = 'Winter 2026';
                else product.season = value;
            } else if (mapping === 'sizeScale') {
                // Normalize size scale
                const sizeVal = value.trim();
                if (['0-14', '24-31', 'OS', 'XS-XL'].includes(sizeVal)) {
                    product.sizeScale = sizeVal;
                } else {
                    product.sizeScale = sizeVal;
                }
            } else if (mapping === 'vendor') {
                // Normalize vendor
                const vendorVal = value.trim().toUpperCase();
                if (vendorVal.includes('P&C') || vendorVal === 'P&C') {
                    product.vendor = 'P&C';
                } else if (vendorVal.includes('MESTRINER')) {
                    product.vendor = 'Mestriner';
                } else {
                    product.vendor = value.trim();
                }
            } else {
                // Direct mapping
                product[mapping] = value.trim();
            }
        }
        
        // Add unmapped data to notes
        if (unmappedData.length > 0) {
            const existingNotes = product.notes ? product.notes + '\n\n' : '';
            product.notes = existingNotes + '--- Imported Data ---\n' + unmappedData.join('\n');
        }
        
        // Skip rows without a description
        if (!product.description && !product.styleName && !product.styleNumber) {
            continue;
        }
        
        // Use style name as description fallback
        if (!product.description && product.styleName) {
            product.description = product.styleName;
        }
        
        console.log('[Parse] Adding product:', product.description || product.styleName, 'ID:', product.id);
        parsedImportData.push({ product, warnings });
    }
    
    console.log('[Parse] Total products parsed:', parsedImportData.length);
    console.log('[Parse] Parsed products:', parsedImportData.map(p => ({ id: p.product.id, desc: p.product.description })));
    
    renderImportPreview();
    showImportPreviewStep();
}

// ============================================
// PREVIEW RENDERING
// ============================================

function updateImportSummary() {
    const totalProducts = parsedImportData.length;
    const selectedCount = parsedImportData.filter(p => p.selected).length;
    const productsWithWarnings = parsedImportData.filter(p => p.warnings.length > 0).length;
    const selectedProtos = parsedImportData
        .filter(p => p.selected)
        .reduce((sum, p) => sum + p.product.protos.length, 0);
    
    // Update select all checkbox state
    const selectAllCheckbox = document.getElementById('importSelectAll');
    if (selectAllCheckbox) {
        selectAllCheckbox.checked = selectedCount === totalProducts;
        selectAllCheckbox.indeterminate = selectedCount > 0 && selectedCount < totalProducts;
    }
    
    // Update summary counts
    const selectedCountEl = document.getElementById('importSelectedCount');
    const protosCountEl = document.getElementById('importProtosCount');
    if (selectedCountEl) selectedCountEl.textContent = selectedCount;
    if (protosCountEl) protosCountEl.textContent = selectedProtos;
    
    // Update import button state
    confirmImportBtn.disabled = selectedCount === 0;
    
    // Update individual item visual states
    parsedImportData.forEach((item, index) => {
        const itemEl = document.querySelector(`.import-preview-item[data-index="${index}"]`);
        if (itemEl) {
            itemEl.classList.toggle('deselected', !item.selected);
        }
    });
}

function toggleSelectAll(checked) {
    parsedImportData.forEach(item => item.selected = checked);
    
    // Update all checkboxes
    document.querySelectorAll('.import-item-checkbox').forEach(cb => {
        cb.checked = checked;
    });
    
    updateImportSummary();
}

function toggleItemSelection(index) {
    parsedImportData[index].selected = !parsedImportData[index].selected;
    
    // Update the checkbox
    const checkbox = document.querySelector(`.import-item-checkbox[data-index="${index}"]`);
    if (checkbox) checkbox.checked = parsedImportData[index].selected;
    
    updateImportSummary();
}

function renderImportPreview() {
    // Mark all as selected by default
    parsedImportData.forEach(item => {
        if (item.selected === undefined) item.selected = true;
    });
    
    const totalProducts = parsedImportData.length;
    const selectedCount = parsedImportData.filter(p => p.selected).length;
    const productsWithWarnings = parsedImportData.filter(p => p.warnings.length > 0).length;
    const selectedProtos = parsedImportData
        .filter(p => p.selected)
        .reduce((sum, p) => sum + p.product.protos.length, 0);
    
    // Summary with select all checkbox
    importSummary.innerHTML = `
        <label class="import-select-all">
            <input type="checkbox" id="importSelectAll" ${selectedCount === totalProducts ? 'checked' : ''}>
            <span>Select All</span>
        </label>
        <div class="import-summary-stat success">
            <span class="count" id="importSelectedCount">${selectedCount}</span> / ${totalProducts} selected
        </div>
        <div class="import-summary-stat">
            <span class="count" id="importProtosCount">${selectedProtos}</span> protos
        </div>
        ${productsWithWarnings > 0 ? `
            <div class="import-summary-stat warning">
                <span class="count">${productsWithWarnings}</span> with notes
            </div>
        ` : ''}
    `;
    
    // Add select all event listener
    document.getElementById('importSelectAll').addEventListener('change', (e) => {
        toggleSelectAll(e.target.checked);
    });
    
    // Preview list with checkboxes
    importPreviewList.innerHTML = parsedImportData.map(({ product, warnings, selected }, index) => `
        <div class="import-preview-item ${!selected ? 'deselected' : ''}" data-index="${index}">
            <label class="import-item-checkbox-wrapper">
                <input type="checkbox" class="import-item-checkbox" data-index="${index}" ${selected ? 'checked' : ''}>
            </label>
            <div class="import-preview-main">
                <div class="import-preview-title">${escapeHtmlFn(product.description || product.styleName || 'Untitled')}</div>
                <div class="import-preview-subtitle">
                    ${product.styleNumber ? `#${escapeHtmlFn(product.styleNumber)}` : ''}
                    ${product.color ? ` · ${escapeHtmlFn(product.color)}` : ''}
                    ${product.vendor ? ` · ${escapeHtmlFn(product.vendor)}` : ''}
                    ${product.poBulk ? ` · Bulk: ${escapeHtmlFn(product.poBulk)}` : ''}
                    ${product.poTop ? ` · TOP: ${escapeHtmlFn(product.poTop)}` : ''}
                </div>
                <div class="import-preview-meta">
                    ${product.season ? `<span class="import-preview-tag">${escapeHtmlFn(product.season)}</span>` : ''}
                    ${product.launchDate ? `<span class="import-preview-tag">Launch: ${formatDateShortFn(product.launchDate)}</span>` : ''}
                    ${product.protos.map((proto, i) => `
                        <span class="import-preview-tag proto">Proto ${i + 1}${proto.notes ? `: ${escapeHtmlFn(proto.notes.substring(0, 30))}${proto.notes.length > 30 ? '...' : ''}` : ''} (${proto.updates.length} updates)</span>
                    `).join('')}
                </div>
                ${warnings.length > 0 ? `
                    <div class="import-preview-warnings">
                        ${warnings.map(w => `<div class="import-preview-warning">${escapeHtmlFn(w)}</div>`).join('')}
                    </div>
                ` : ''}
            </div>
            <div class="import-preview-status ${warnings.length > 0 ? 'warning' : 'valid'}">
                ${warnings.length > 0 ? '⚠ Has notes' : '✓ Ready'}
            </div>
        </div>
    `).join('');
    
    // Add checkbox event listeners
    document.querySelectorAll('.import-item-checkbox').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const index = parseInt(e.target.dataset.index);
            toggleItemSelection(index);
        });
    });
    
    // Also allow clicking the row (but not the checkbox itself) to toggle
    document.querySelectorAll('.import-preview-item').forEach(item => {
        item.addEventListener('click', (e) => {
            // Don't toggle if clicking on checkbox or its label
            if (e.target.closest('.import-item-checkbox-wrapper')) return;
            const index = parseInt(item.dataset.index);
            const checkbox = item.querySelector('.import-item-checkbox');
            checkbox.checked = !checkbox.checked;
            toggleItemSelection(index);
        });
    });
}

// ============================================
// IMPORT EXECUTION
// ============================================

async function confirmImport() {
    // Filter to only selected items
    const selectedItems = parsedImportData.filter(item => item.selected);
    
    console.log('[Import] Starting import, selected items:', selectedItems.length);
    console.log('[Import] selectedItems:', JSON.parse(JSON.stringify(selectedItems)));
    
    if (selectedItems.length === 0) {
        console.log('[Import] No items selected, returning');
        return;
    }
    
    confirmImportBtn.disabled = true;
    confirmImportBtn.textContent = 'Importing...';
    
    try {
        for (let i = 0; i < selectedItems.length; i++) {
            const { product } = selectedItems[i];
            console.log(`[Import] Processing product ${i + 1}/${selectedItems.length}:`, product.description || product.styleName);
            
            // Prepare product data with stringified protos
            const productData = {
                ...product,
                protos: JSON.stringify(product.protos)
            };
            delete productData.id;
            
            const newId = generateId();
            console.log(`[Import] Assigning ID ${newId} to product:`, product.description);
            
            // Unique ID: base timestamp + index ensures no collisions within this import batch
            const eventData = { id: newId, ...productData };
            console.log('[Import] Event data:', eventData);
            
            const localEvent = await addEventFn('added', eventData);
            console.log(`[Import] addEventFn returned for product ${i + 1}, waiting for server POST...`);
            
            // Wait for the actual server POST to complete (addEvent returns immediately but attaches _postPromise)
            if (localEvent._postPromise) {
                const postResult = await localEvent._postPromise;
                console.log(`[Import] Server POST completed for product ${i + 1}, result:`, postResult);
            }
            
            // Small delay to avoid overwhelming the server
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        console.log('[Import] All products imported, calling syncAndRender');
        
        closeImportModal();
        await syncAndRenderFn();
        console.log('[Import] syncAndRender completed');
    } catch (error) {
        console.error('[Import] Import failed:', error);
        console.error('[Import] Error stack:', error.stack);
        alert('Import failed. Please try again.');
    } finally {
        confirmImportBtn.disabled = false;
        confirmImportBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Import Products
        `;
    }
}

