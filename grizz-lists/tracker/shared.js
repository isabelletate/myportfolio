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
        name: event.name || '',
        imageUrl: event.imageUrl || '',
        season: event.season || '',
        launchMonth: event.launchMonth || '',
        vendor: event.vendor || '',
        poBulk: event.poBulk || '',
        poTop: event.poTop || '',
        status: event.status || 'pending',
        notes: event.notes || ''
    });
    
    const { itemsMap, order, sortedEvents } = replayChangelogBase(changelog, productFactory);
    
    // Handle tracker-specific operations
    for (const event of sortedEvents) {
        switch (event.op) {
            case 'updated':
                if (itemsMap.has(event.id)) {
                    const product = itemsMap.get(event.id);
                    // Update only provided fields
                    if (event.name !== undefined) product.name = event.name;
                    if (event.imageUrl !== undefined) product.imageUrl = event.imageUrl;
                    if (event.season !== undefined) product.season = event.season;
                    if (event.launchMonth !== undefined) product.launchMonth = event.launchMonth;
                    if (event.vendor !== undefined) product.vendor = event.vendor;
                    if (event.poBulk !== undefined) product.poBulk = event.poBulk;
                    if (event.poTop !== undefined) product.poTop = event.poTop;
                    if (event.status !== undefined) product.status = event.status;
                    if (event.notes !== undefined) product.notes = event.notes;
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
    'Spring 2024',
    'Summer 2024',
    'Fall 2024',
    'Winter 2024',
    'Spring 2025',
    'Summer 2025',
    'Fall 2025',
    'Winter 2025',
    'Holiday 2025'
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
    { value: 'pending', label: 'Pending', color: '#94a3b8' },
    { value: 'ordered', label: 'Ordered', color: '#60a5fa' },
    { value: 'in_production', label: 'In Production', color: '#fbbf24' },
    { value: 'shipped', label: 'Shipped', color: '#a78bfa' },
    { value: 'received', label: 'Received', color: '#4ade80' },
    { value: 'cancelled', label: 'Cancelled', color: '#f87171' }
];

export function getStatusInfo(status) {
    return statusOptions.find(s => s.value === status) || statusOptions[0];
}

