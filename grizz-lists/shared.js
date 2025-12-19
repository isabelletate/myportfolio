// ============================================
// GRIZZ LISTS - Shared Module
// Common utilities and event store factory
// ============================================

// API Configuration
export const API_BASE = 'https://sheet-logger.david8603.workers.dev/grizz.biz/grizz-lists';
export const USER_EMAIL = 'test@testing.com';

// ============================================
// DATE UTILITIES
// ============================================

// Get today's date in yyyy-mm-dd format for the API endpoint
export function getTodayDateKey() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// ============================================
// SYNC STATUS UI
// ============================================

export function updateSyncStatus(status) {
    const indicator = document.getElementById('syncIndicator');
    if (!indicator) return;
    
    indicator.className = 'sync-indicator';
    switch (status) {
        case 'syncing':
            indicator.classList.add('syncing');
            indicator.title = 'Syncing...';
            break;
        case 'synced':
            indicator.classList.add('synced');
            indicator.title = 'Synced';
            break;
        case 'error':
            indicator.classList.add('error');
            indicator.title = 'Sync error - changes saved locally';
            break;
        case 'offline':
            indicator.classList.add('offline');
            indicator.title = 'Offline - changes saved locally';
            break;
    }
}

// ============================================
// EVENT STORE FACTORY
// Creates an isolated event store for a specific list type
// ============================================

export function createEventStore(listType) {
    const localStorageKey = `grizzChangelog_${listType}_fallback`;
    let changelogCache = [];
    let isSyncing = false;

    function getApiUrl() {
        return `${API_BASE}/${USER_EMAIL}/${listType}/${getTodayDateKey()}`;
    }

    async function loadChangelogFromServer() {
        try {
            updateSyncStatus('syncing');
            const response = await fetch(getApiUrl());
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            
            // Normalize events: server uses 'timeStamp', we use 'ts'
            // Also convert string IDs back to numbers
            changelogCache = (data || []).map(event => ({
                ...event,
                ts: event.timeStamp || event.ts,
                id: event.id ? (isNaN(Number(event.id)) ? event.id : Number(event.id)) : event.id
            }));
            
            updateSyncStatus('synced');
            return changelogCache;
        } catch (error) {
            console.error('Failed to load changelog from server:', error);
            updateSyncStatus('error');
            
            // Fall back to localStorage if server fails
            const saved = localStorage.getItem(localStorageKey);
            if (saved) {
                changelogCache = JSON.parse(saved);
            }
            return changelogCache;
        }
    }

    function loadChangelog() {
        return changelogCache;
    }

    function saveChangelogLocal() {
        localStorage.setItem(localStorageKey, JSON.stringify(changelogCache));
    }

    async function postEvent(event) {
        try {
            updateSyncStatus('syncing');
            
            const params = new URLSearchParams();
            for (const [key, value] of Object.entries(event)) {
                params.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
            }
            
            const url = `${getApiUrl()}?${params.toString()}`;
            
            const response = await fetch(url, {
                method: 'POST'
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            updateSyncStatus('synced');
            return true;
        } catch (error) {
            console.error('Failed to post event to server:', error);
            updateSyncStatus('error');
            return false;
        }
    }

    async function addEvent(op, data) {
        const event = { op, ...data };
        
        // Optimistic update with temporary timestamp
        const tempTs = new Date().toISOString();
        const localEvent = { ...event, ts: tempTs };
        changelogCache.push(localEvent);
        
        saveChangelogLocal();
        postEvent(event);
        
        return localEvent;
    }

    function getIsSyncing() {
        return isSyncing;
    }

    function setIsSyncing(value) {
        isSyncing = value;
    }

    function getCache() {
        return changelogCache;
    }

    function setCache(cache) {
        changelogCache = cache;
    }

    return {
        loadChangelogFromServer,
        loadChangelog,
        saveChangelogLocal,
        postEvent,
        addEvent,
        getIsSyncing,
        setIsSyncing,
        getCache,
        setCache,
        getApiUrl
    };
}

// ============================================
// CHANGELOG REPLAY - Generic base operations
// ============================================

// Base replay function for common operations (added, removed, reorder)
// Each list type can extend this with their own specific operations
export function replayChangelogBase(changelog, itemFactory) {
    const itemsMap = new Map();
    const order = [];
    
    const sortedEvents = [...changelog].sort((a, b) => (a.ts || '').localeCompare(b.ts || ''));
    
    for (const event of sortedEvents) {
        switch (event.op) {
            case 'added':
                itemsMap.set(event.id, itemFactory(event));
                order.push(event.id);
                break;
                
            case 'removed':
                itemsMap.delete(event.id);
                const removeIdx = order.indexOf(event.id);
                if (removeIdx > -1) order.splice(removeIdx, 1);
                break;
                
            case 'reorder':
                order.length = 0;
                if (event.order) {
                    const orderArray = typeof event.order === 'string' 
                        ? JSON.parse(event.order) 
                        : event.order;
                    const normalizedOrder = orderArray.map(id => 
                        isNaN(Number(id)) ? id : Number(id)
                    );
                    order.push(...normalizedOrder.filter(id => itemsMap.has(id)));
                }
                break;
        }
    }
    
    return { itemsMap, order, sortedEvents };
}

