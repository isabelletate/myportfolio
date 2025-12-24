// ============================================
// PLANNER - Shared Module
// Extends the base shared module with planner-specific functionality
// ============================================

import { 
    createEventStore, 
    replayChangelogBase,
    getTodayDateKey,
    updateSyncStatus,
    getListIdFromUrl,
    addToRecentLists,
    createPoller
} from '../shared.js';

export { addToRecentLists, createPoller };

// ============================================
// LIST CONFIGURATION
// ============================================

const listId = getListIdFromUrl();

// Export list info for use in scripts
export { listId };

// ============================================
// PLANNER EVENT STORE
// ============================================

const store = createEventStore('planner', listId);

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
// PLANNER-SPECIFIC REPLAY
// ============================================

export function replayChangelog(changelog) {
    // Create task from event
    const taskFactory = (event) => ({
        id: event.id,
        text: event.text,
        time: event.time,
        color: event.color,
        completed: false,
        enjoyment: event.enjoyment !== undefined ? event.enjoyment : 2
    });
    
    const { itemsMap, order, sortedEvents } = replayChangelogBase(changelog, taskFactory);
    
    // Handle planner-specific operations
    for (const event of sortedEvents) {
        switch (event.op) {
            case 'completed':
                if (itemsMap.has(event.id)) {
                    itemsMap.get(event.id).completed = true;
                }
                break;
                
            case 'uncompleted':
                if (itemsMap.has(event.id)) {
                    itemsMap.get(event.id).completed = false;
                }
                break;
                
            case 'moved':
                const moveIdx = order.indexOf(event.id);
                if (moveIdx > -1) order.splice(moveIdx, 1);
                
                if (event.toIndex !== undefined) {
                    order.splice(event.toIndex, 0, event.id);
                } else if (event.afterId !== undefined) {
                    const afterIdx = order.indexOf(event.afterId);
                    order.splice(afterIdx + 1, 0, event.id);
                } else {
                    order.push(event.id);
                }
                break;
                
            case 'enjoyment':
                if (itemsMap.has(event.id)) {
                    itemsMap.get(event.id).enjoyment = event.value;
                }
                break;
        }
    }
    
    return order.map(id => itemsMap.get(id)).filter(Boolean);
}

// ============================================
// TIME UTILITIES
// ============================================

export function parseTimeToMinutes(timeStr) {
    const str = timeStr.toLowerCase().trim();
    let minutes = 0;
    
    const hourMatch = str.match(/([\d.]+)\s*h/);
    if (hourMatch) {
        minutes += parseFloat(hourMatch[1]) * 60;
    }
    
    const minMatch = str.match(/(\d+)\s*m/);
    if (minMatch) {
        minutes += parseInt(minMatch[1]);
    }
    
    if (!hourMatch && !minMatch) {
        const numMatch = str.match(/(\d+)/);
        if (numMatch) minutes = parseInt(numMatch[1]);
    }
    
    return minutes || 30;
}

export function formatTimeShort(totalMinutes) {
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    const hour12 = hours > 12 ? hours - 12 : (hours === 0 ? 12 : hours);
    const ampm = hours >= 12 ? 'p' : 'a';
    return `${hour12}:${mins.toString().padStart(2, '0')}${ampm}`;
}

export function formatTimeLong(totalMinutes) {
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    const hour12 = hours > 12 ? hours - 12 : (hours === 0 ? 12 : hours);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    return `${hour12}:${mins.toString().padStart(2, '0')} ${ampm}`;
}

export function formatDuration(minutes) {
    if (minutes >= 60) {
        const hrs = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
    }
    return `${minutes}m`;
}

// ============================================
// PLANNER CONSTANTS
// ============================================

export const colors = [
    '#ff6b35', // orange
    '#00d9c0', // teal
    '#ff2e63', // pink
    '#ffc93c', // yellow
    '#a855f7', // purple
    '#4ade80', // green
    '#38bdf8', // blue
];

export const defaultTasks = [
    { text: 'Check emails', time: '15m' },
    { text: 'Process incoming shipments', time: '45m' },
    { text: 'Update tracking spreadsheet', time: '30m' },
    { text: 'Schedule outbound pickups', time: '20m' },
    { text: 'Verify package labels', time: '30m' },
    { text: 'Follow up on delayed deliveries', time: '30m' },
];

// Initialize default tasks as events
export async function initializeDefaultTasks() {
    const baseTime = Date.now();
    const cache = store.getCache();
    
    for (let i = 0; i < defaultTasks.length; i++) {
        const t = defaultTasks[i];
        const event = {
            op: 'added',
            id: baseTime + i,
            text: t.text,
            time: t.time,
            color: colors[i % colors.length]
        };
        
        const tempTs = new Date(baseTime + i).toISOString();
        cache.push({ ...event, ts: tempTs });
        
        await store.postEvent(event);
    }
    
    store.saveChangelogLocal();
    return cache;
}
