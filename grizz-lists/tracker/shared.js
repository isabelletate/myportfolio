// ============================================
// TRACKER - Shared Module
// Extends the base shared module with product tracker-specific functionality
// ============================================

import { 
    createEventStore, 
    replayChangelogBase,
    getTodayDateKey,
    updateSyncStatus,
    getListIdFromUrl,
    addToRecentLists
} from '../shared.js';

export { addToRecentLists };

// ============================================
// LIST CONFIGURATION
// ============================================

const listId = getListIdFromUrl();

// Export list info for use in scripts
export { listId };

// ============================================
// TRACKER EVENT STORE
// ============================================

const store = createEventStore('tracker', listId);

// Re-export store methods
export const loadChangelogFromServer = store.loadChangelogFromServer;
export const loadChangelog = store.loadChangelog;
export const saveChangelogLocal = store.saveChangelogLocal;
export const postEvent = store.postEvent;
export const addEvent = store.addEvent;
export const getIsSyncing = store.getIsSyncing;
export const setIsSyncing = store.setIsSyncing;
export const getChangelogCache = store.getCache;
export const setChangelogCache = store.setCache;
export const getMetadata = store.getMetadata;
export const renameList = store.renameList;

// Re-export utilities from parent
export { getTodayDateKey, updateSyncStatus };

// ============================================
// TRACKER-SPECIFIC REPLAY
// ============================================

export function replayChangelog(changelog) {
    // Create product from event
    const productFactory = (event) => ({
        id: event.id,
        styleNumber: event.styleNumber || '',
        styleName: event.styleName || '',
        description: event.description || '',
        color: event.color || '',
        sizeScale: event.sizeScale || '',
        units: event.units || '',
        imageUrl: event.imageUrl || '',
        season: event.season || '',
        launchMonth: event.launchMonth || '',
        vendor: event.vendor || '',
        poBulk: event.poBulk || '',
        poTop: event.poTop || '',
        status: event.status || 'in_production',
        notes: event.notes || '',
        protos: event.protos ? JSON.parse(event.protos) : [],
        urgent: event.urgent === 'true' || event.urgent === true,
        fabric: event.fabric || '',
        content: event.content || '',
        fabricApprovalDate: event.fabricApprovalDate || '',
        colorApprovalDate: event.colorApprovalDate || '',
        trimsApprovalDate: event.trimsApprovalDate || ''
    });
    
    const { itemsMap, order, sortedEvents } = replayChangelogBase(changelog, productFactory);
    
    // Handle tracker-specific operations
    for (const event of sortedEvents) {
        switch (event.op) {
            case 'updated':
                if (itemsMap.has(event.id)) {
                    const product = itemsMap.get(event.id);
                    // Update only provided fields
                    if (event.styleNumber !== undefined) product.styleNumber = event.styleNumber;
                    if (event.styleName !== undefined) product.styleName = event.styleName;
                    if (event.description !== undefined) product.description = event.description;
                    if (event.color !== undefined) product.color = event.color;
                    if (event.sizeScale !== undefined) product.sizeScale = event.sizeScale;
                    if (event.units !== undefined) product.units = event.units;
                    if (event.imageUrl !== undefined) product.imageUrl = event.imageUrl;
                    if (event.season !== undefined) product.season = event.season;
                    if (event.launchMonth !== undefined) product.launchMonth = event.launchMonth;
                    if (event.vendor !== undefined) product.vendor = event.vendor;
                    if (event.poBulk !== undefined) product.poBulk = event.poBulk;
                    if (event.poTop !== undefined) product.poTop = event.poTop;
                    if (event.status !== undefined) product.status = event.status;
                    if (event.notes !== undefined) product.notes = event.notes;
                    if (event.protos !== undefined) product.protos = typeof event.protos === 'string' ? JSON.parse(event.protos) : event.protos;
                    if (event.urgent !== undefined) product.urgent = event.urgent === 'true' || event.urgent === true;
                    if (event.fabric !== undefined) product.fabric = event.fabric;
                    if (event.content !== undefined) product.content = event.content;
                    if (event.fabricApprovalDate !== undefined) product.fabricApprovalDate = event.fabricApprovalDate;
                    if (event.colorApprovalDate !== undefined) product.colorApprovalDate = event.colorApprovalDate;
                    if (event.trimsApprovalDate !== undefined) product.trimsApprovalDate = event.trimsApprovalDate;
                }
                break;
                
            case 'status_changed':
                if (itemsMap.has(event.id)) {
                    itemsMap.get(event.id).status = event.status;
                }
                break;
        }
    }
    
    return order.map(id => itemsMap.get(id)).filter(Boolean);
}

// ============================================
// TRACKER CONSTANTS
// ============================================

export const seasons = [
    'Spring 2026',
    'Summer 2026',
    'Fall 2026',
    'Holiday 2026',
    'Winter 2026',
    'Spring 2027',
    'Summer 2027',
    'Fall 2027',
    'Holiday 2027'
];

export const vendors = [
    'Mestriner',
    'P&C'
];

export const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December'
];

export const statusOptions = [
    { value: 'in_production', label: 'In Production', color: '#fbbf24' },
    { value: 'approved_photo_sample', label: 'Approved Photo Sample', color: '#60a5fa' },
    { value: 'bulk_top', label: 'BULK/TOP', color: '#4ade80' },
    { value: 'dropped', label: 'Dropped', color: '#f87171' }
];

export function getStatusInfo(status) {
    return statusOptions.find(s => s.value === status) || statusOptions[0];
}

// ============================================
// PROTO (PROTOTYPE) CONSTANTS
// ============================================

export const protoStatusTypes = [
    { value: 'sent', label: 'Sent', color: '#2563eb' },
    { value: 'received', label: 'Received', color: '#16a34a' },
    { value: 'comments', label: 'Comments', color: '#d97706' },
    { value: 'with_gp', label: 'With GP', color: '#7c3aed' },
    { value: 'fit', label: 'Fit', color: '#db2777' },
    { value: 'approved_photo_sample', label: 'Approved as Photo Sample', color: '#059669' },
    { value: 'sent_to_pc', label: 'Sent to P&C', color: '#0891b2' },
    { value: 'sent_to_mestriner', label: 'Sent to Mestriner', color: '#ea580c' }
];

export function getProtoStatusInfo(status) {
    return protoStatusTypes.find(s => s.value === status) || protoStatusTypes[0];
}

