// ============================================
// GRIZZ LISTS - Shared Module
// Common utilities and event store factory
// ============================================

// API Configuration
export const API_BASE = 'https://sheet-logger.david8603.workers.dev/grizz.biz/grizz-lists';

// User email stored in localStorage
const USER_EMAIL_KEY = 'grizzLists_userEmail';
const ANONYMOUS_NAME_KEY = 'grizzLists_anonymousName';

// Animals for anonymous names (like Google Docs)
const ANONYMOUS_ANIMALS = [
  'Alligator', 'Anteater', 'Armadillo', 'Axolotl',
  'Badger', 'Bat', 'Bear', 'Beaver', 'Bison', 'Buffalo', 'Bunny',
  'Camel', 'Capybara', 'Cat', 'Chameleon', 'Cheetah', 'Chinchilla', 'Chipmunk', 'Cobra',
  'Dingo', 'Dolphin', 'Dragon', 'Duck',
  'Eagle', 'Elephant', 'Elk', 'Emu',
  'Falcon', 'Ferret', 'Flamingo', 'Fox', 'Frog',
  'Gazelle', 'Gecko', 'Giraffe', 'Goat', 'Gorilla', 'Grizzly',
  'Hamster', 'Hawk', 'Hedgehog', 'Hippo', 'Horse', 'Husky', 'Hyena',
  'Iguana', 'Impala',
  'Jaguar', 'Jellyfish',
  'Kangaroo', 'Koala', 'Kiwi',
  'Lemur', 'Leopard', 'Lion', 'Llama', 'Lobster', 'Lynx',
  'Meerkat', 'Mongoose', 'Monkey', 'Moose', 'Mouse',
  'Narwhal', 'Newt',
  'Octopus', 'Opossum', 'Orca', 'Ostrich', 'Otter', 'Owl',
  'Panda', 'Panther', 'Parrot', 'Peacock', 'Pelican', 'Penguin', 'Phoenix', 'Pig', 'Platypus', 'Porcupine', 'Puma',
  'Quail', 'Quokka',
  'Rabbit', 'Raccoon', 'Raven', 'Reindeer', 'Rhino',
  'Salamander', 'Seal', 'Shark', 'Sloth', 'Snake', 'Sparrow', 'Squirrel', 'Stingray', 'Swan',
  'Tiger', 'Toucan', 'Turtle',
  'Unicorn',
  'Vulture',
  'Walrus', 'Weasel', 'Whale', 'Wolf', 'Wombat', 'Woodpecker',
  'Yak',
  'Zebra',
];

// ============================================
// ID GENERATION
// 6-character base62 IDs (0-9, a-z, A-Z)
// 62^6 = ~56 billion possible IDs
// ============================================

const BASE62_CHARS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function generateId() {
  let id = '';
  for (let i = 0; i < 6; i += 1) {
    id += BASE62_CHARS[Math.floor(Math.random() * 62)];
  }
  return id;
}

export function getUserEmail() {
  return localStorage.getItem(USER_EMAIL_KEY);
}

export function setUserEmail(email) {
  localStorage.setItem(USER_EMAIL_KEY, email);
}

export function hasUserEmail() {
  return !!localStorage.getItem(USER_EMAIL_KEY);
}

// Get or generate anonymous name for this device
export function getAnonymousName() {
  let name = localStorage.getItem(ANONYMOUS_NAME_KEY);
  if (!name) {
    const animal = ANONYMOUS_ANIMALS[Math.floor(Math.random() * ANONYMOUS_ANIMALS.length)];
    name = `Anonymous ${animal}`;
    localStorage.setItem(ANONYMOUS_NAME_KEY, name);
  }
  return name;
}

// Get the user identity (email if set, otherwise anonymous name)
export function getUserIdentity() {
  return getUserEmail() || getAnonymousName();
}

// ============================================
// RECENTLY ACCESSED LISTS
// Tracks lists the user has accessed (including shared lists)
// Stored in localStorage, sorted by most recently used
// ============================================

const RECENT_LISTS_KEY = 'grizzLists_recentLists';

export function getRecentLists() {
  const saved = localStorage.getItem(RECENT_LISTS_KEY);
  if (!saved) return [];

  try {
    const lists = JSON.parse(saved);
    // Sort by lastAccessed (most recent first)
    return lists.sort((a, b) => (b.lastAccessed || '').localeCompare(a.lastAccessed || ''));
  } catch (e) {
    return [];
  }
}

export function addToRecentLists(listId, name, type, heroImage = null) {
  const lists = getRecentLists();
  const now = new Date().toISOString();

  // Find existing entry
  const existingIndex = lists.findIndex((l) => l.id === listId);

  if (existingIndex >= 0) {
    // Update existing entry
    lists[existingIndex].lastAccessed = now;
    if (name) lists[existingIndex].name = name;
    if (type) lists[existingIndex].type = type;
    if (heroImage !== null) lists[existingIndex].heroImage = heroImage;
  } else {
    // Add new entry
    lists.push({
      id: listId,
      name: name || 'Unnamed List',
      type: type || 'shopping',
      lastAccessed: now,
      heroImage,
    });
  }

  // Sort by most recent
  lists.sort((a, b) => (b.lastAccessed || '').localeCompare(a.lastAccessed || ''));

  localStorage.setItem(RECENT_LISTS_KEY, JSON.stringify(lists));
}

export function updateRecentListName(listId, name) {
  const lists = getRecentLists();
  const entry = lists.find((l) => l.id === listId);
  if (entry) {
    entry.name = name;
    localStorage.setItem(RECENT_LISTS_KEY, JSON.stringify(lists));
  }
}

export function removeFromRecentLists(listId) {
  const lists = getRecentLists().filter((l) => l.id !== listId);
  localStorage.setItem(RECENT_LISTS_KEY, JSON.stringify(lists));
}

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
// URL UTILITIES
// ============================================

// Get list ID from URL params
export function getListIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('list');
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
    default:
      break;
  }
}

// ============================================
// EVENT STORE FACTORY
// Creates an isolated event store for a specific list
// Shopping lists (perpetual): ${API_BASE}/lists/${listId}
// Planner lists:
//   - Metadata (list_init, list_renamed): ${API_BASE}/lists/${listId}
//   - Daily items: ${API_BASE}/lists/${listId}/${date}
// ============================================

// Track the current store's getCache function (set by createEventStore, used by event log viewer)
let currentEventStoreGetCache = null;

export function createEventStore(listType, listId) {
  if (!listId) {
    throw new Error('listId is required for createEventStore');
  }

  // Shopping lists are perpetual (no date), planner lists are daily (with date)
  const isDateBased = listType === 'planner';
  const localStorageKey = isDateBased
    ? `grizzChangelog_list_${listId}_${getTodayDateKey()}_fallback`
    : `grizzChangelog_list_${listId}_fallback`;
  const metadataStorageKey = `grizzChangelog_list_${listId}_metadata_fallback`;
  let changelogCache = [];
  let isSyncing = false;
  let listMetadata = { name: 'My List', type: listType, owner: getUserEmail() };

  // Base URL for list metadata (always perpetual)
  function getMetadataApiUrl() {
    return `${API_BASE}/lists/${listId}`;
  }

  // URL for items - shopping is perpetual, planner is daily
  function getItemsApiUrl() {
    if (isDateBased) {
      return `${API_BASE}/lists/${listId}/${getTodayDateKey()}`;
    }
    return `${API_BASE}/lists/${listId}`;
  }

  // Legacy compatibility - returns the items URL
  function getApiUrl() {
    return getItemsApiUrl();
  }

  // Extract list metadata from changelog events
  function extractMetadata(events) {
    const sortedEvents = [...events].sort((a, b) => (a.ts || '').localeCompare(b.ts || ''));

    sortedEvents.forEach((event) => {
      if (event.op === 'list_init') {
        listMetadata = {
          name: event.name || 'My List',
          type: event.type || listType,
          owner: event.owner || getUserEmail(),
          heroImage: event.heroImage || null,
        };
      } else if (event.op === 'list_renamed') {
        listMetadata.name = event.name;
      } else if (event.op === 'hero_image' && event.images) {
        // Extract hero image from upload event
        const images = typeof event.images === 'string' ? JSON.parse(event.images) : event.images;
        if (images && images.length > 0) {
          listMetadata.heroImage = images[0].path || images[0].url;
        }
      }
    });

    return listMetadata;
  }

  function getMetadata() {
    return listMetadata;
  }

  // Normalize events from server response
  function normalizeEvents(data) {
    return (data || []).map((event) => {
      let normalizedId = event.id;
      if (event.id) {
        const numId = Number(event.id);
        normalizedId = Number.isNaN(numId) ? event.id : numId;
      }
      return {
        ...event,
        ts: event.timeStamp || event.ts,
        id: normalizedId,
      };
    });
  }

  async function loadChangelogFromServer(options = {}) {
    const { silent = false } = options;
    try {
      if (!silent) updateSyncStatus('syncing');

      if (isDateBased) {
        // For planner: load metadata from base URL, items from dated URL
        const [metadataResponse, itemsResponse] = await Promise.all([
          fetch(getMetadataApiUrl()),
          fetch(getItemsApiUrl()),
        ]);

        let metadataEvents = [];
        let itemEvents = [];

        if (metadataResponse.ok) {
          const metadataData = await metadataResponse.json();
          metadataEvents = normalizeEvents(metadataData);
        }

        if (itemsResponse.ok) {
          const itemsData = await itemsResponse.json();
          itemEvents = normalizeEvents(itemsData);
        }

        // Extract metadata from metadata events
        extractMetadata(metadataEvents);

        // Cache only the daily items (metadata is separate)
        changelogCache = itemEvents;
      } else {
        // For shopping: everything is at the same URL
        const response = await fetch(getApiUrl());

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        changelogCache = normalizeEvents(data);

        // Extract list metadata from events
        extractMetadata(changelogCache);
      }

      if (!silent) updateSyncStatus('synced');
      return changelogCache;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to load changelog from server:', error);
      if (!silent) updateSyncStatus('error');

      // Fall back to localStorage if server fails
      const saved = localStorage.getItem(localStorageKey);
      if (saved) {
        changelogCache = JSON.parse(saved);
      }

      const savedMetadata = localStorage.getItem(metadataStorageKey);
      if (savedMetadata) {
        extractMetadata(JSON.parse(savedMetadata));
      } else {
        extractMetadata(changelogCache);
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

  // Determine which URL to use for an event
  function getUrlForEvent(event) {
    // Metadata events always go to base URL
    if (event.op === 'list_init' || event.op === 'list_renamed') {
      return getMetadataApiUrl();
    }
    // Item events go to items URL (dated for planner, same as base for shopping)
    return getItemsApiUrl();
  }

  async function postEvent(event) {
    try {
      updateSyncStatus('syncing');

      // Add user identity to every event
      const eventWithUser = {
        ...event,
        user: getUserIdentity(),
      };

      const params = new URLSearchParams();
      Object.entries(eventWithUser).forEach(([key, value]) => {
        params.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
      });

      const url = `${getUrlForEvent(event)}?${params.toString()}`;

      const response = await fetch(url, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      updateSyncStatus('synced');
      return true;
    } catch (error) {
      // eslint-disable-next-line no-console
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

    // Return both the local event and the promise for callers who need to wait
    const postPromise = postEvent(event);
    localEvent.postPromise = postPromise;

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

  // Rename the list (adds a list_renamed event)
  async function renameList(newName) {
    return addEvent('list_renamed', { name: newName });
  }

  // Register this store's cache getter for the event log viewer
  currentEventStoreGetCache = getCache;

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
    getApiUrl,
    getMetadata,
    renameList,
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

  sortedEvents.forEach((event) => {
    switch (event.op) {
      case 'added':
        itemsMap.set(event.id, itemFactory(event));
        order.push(event.id);
        break;

      case 'removed': {
        itemsMap.delete(event.id);
        const removeIdx = order.indexOf(event.id);
        if (removeIdx > -1) order.splice(removeIdx, 1);
        break;
      }

      case 'reorder':
        order.length = 0;
        if (event.order) {
          const orderArray = typeof event.order === 'string'
            ? JSON.parse(event.order)
            : event.order;
          const normalizedOrder = orderArray.map((id) => {
            const numId = Number(id);
            return Number.isNaN(numId) ? id : numId;
          });
          order.push(...normalizedOrder.filter((id) => itemsMap.has(id)));
        }
        break;

      default:
        break;
    }
  });

  return { itemsMap, order, sortedEvents };
}

// ============================================
// LIST MANAGER
// Manages user's list references and fetches list metadata
// User's list IDs stored at: ${API_BASE}/${userEmail}/user-lists (perpetual)
// List metadata (list_init, list_renamed) stored at: ${API_BASE}/lists/${listId} (perpetual)
// ============================================

export function createListManager() {
  function getLocalStorageKey() {
    return `grizzLists_${getUserEmail()}_fallback`;
  }
  let userListsCache = []; // User's list references (just IDs)
  const listsMetadataCache = new Map(); // Cached metadata from each list

  function getUserListsApiUrl() {
    return `${API_BASE}/${getUserEmail()}/user-lists`;
  }

  // Base URL for list metadata (always perpetual, no date)
  function getListBaseApiUrl(listId) {
    return `${API_BASE}/lists/${listId}`;
  }

  // Replay user's list references to get active list IDs
  function replayUserLists(changelog) {
    const activeListIds = new Set();

    const sortedEvents = [...changelog].sort((a, b) => (a.ts || '').localeCompare(b.ts || ''));

    sortedEvents.forEach((event) => {
      switch (event.op) {
        case 'list_added':
          activeListIds.add(event.id);
          break;
        case 'list_removed':
          activeListIds.delete(event.id);
          break;
        default:
          break;
      }
    });

    return Array.from(activeListIds);
  }

  // Post event to user's list references
  async function postUserListEvent(event) {
    try {
      // Add user identity to every event
      const eventWithUser = {
        ...event,
        user: getUserIdentity(),
      };

      const params = new URLSearchParams();
      Object.entries(eventWithUser).forEach(([key, value]) => {
        params.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
      });

      const url = `${getUserListsApiUrl()}?${params.toString()}`;
      const response = await fetch(url, { method: 'POST' });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return true;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to post user list event:', error);
      return false;
    }
  }

  // Post event to a specific list's base log (for list_init, list_renamed)
  async function postListEvent(listId, event) {
    try {
      // Add user identity to every event
      const eventWithUser = {
        ...event,
        user: getUserIdentity(),
      };

      const params = new URLSearchParams();
      Object.entries(eventWithUser).forEach(([key, value]) => {
        params.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
      });

      const url = `${getListBaseApiUrl(listId)}?${params.toString()}`;
      const response = await fetch(url, { method: 'POST' });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return true;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to post list event:', error);
      return false;
    }
  }

  // Load user's list references from server
  async function loadUserListsFromServer() {
    try {
      updateSyncStatus('syncing');
      const response = await fetch(getUserListsApiUrl());

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      userListsCache = (data || []).map((event) => ({
        ...event,
        ts: event.timeStamp || event.ts,
      }));

      return userListsCache;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to load user lists from server:', error);

      const saved = localStorage.getItem(getLocalStorageKey());
      if (saved) {
        userListsCache = JSON.parse(saved);
      }
      return userListsCache;
    }
  }

  // Load metadata for a single list (from base URL, always perpetual)
  async function loadListMetadata(listId) {
    try {
      const response = await fetch(getListBaseApiUrl(listId));

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const events = (data || []).map((event) => ({
        ...event,
        ts: event.timeStamp || event.ts,
      }));

      // Extract metadata from list events
      let metadata = {
        id: listId, name: 'Unnamed List', type: 'shopping', createdAt: null, heroImage: null,
      };
      const sortedEvents = [...events].sort((a, b) => (a.ts || '').localeCompare(b.ts || ''));

      sortedEvents.forEach((event) => {
        if (event.op === 'list_init') {
          metadata = {
            id: listId,
            name: event.name || 'Unnamed List',
            type: event.type || 'shopping',
            createdAt: event.ts,
            heroImage: null,
          };
        } else if (event.op === 'list_renamed') {
          metadata.name = event.name;
        } else if (event.op === 'hero_image' && event.images) {
          // Extract hero image from upload event
          const images = typeof event.images === 'string' ? JSON.parse(event.images) : event.images;
          if (images && images.length > 0) {
            metadata.heroImage = images[0].path || images[0].url;
          }
        }
      });

      listsMetadataCache.set(listId, metadata);
      return metadata;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`Failed to load metadata for list ${listId}:`, error);
      return {
        id: listId, name: 'Unnamed List', type: 'shopping', createdAt: null, heroImage: null,
      };
    }
  }

  // Load all lists with their metadata
  async function loadListsFromServer() {
    updateSyncStatus('syncing');

    // First load user's list references
    await loadUserListsFromServer();

    // Get active list IDs
    const listIds = replayUserLists(userListsCache);

    // Load metadata for each list in parallel
    await Promise.all(listIds.map((id) => loadListMetadata(id)));

    updateSyncStatus('synced');

    // Return lists with metadata, sorted by creation date
    return listIds
      .map((id) => listsMetadataCache.get(id))
      .filter(Boolean)
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }

  function saveListsLocal() {
    localStorage.setItem(getLocalStorageKey(), JSON.stringify(userListsCache));
  }

  // Create a new list
  async function createList(name, type) {
    const id = generateId();
    const tempTs = new Date().toISOString();

    // 1. Add list reference to user's list
    const userEvent = { op: 'list_added', id };
    userListsCache.push({ ...userEvent, ts: tempTs });
    saveListsLocal();

    // 2. Initialize the list with metadata
    const listInitEvent = {
      op: 'list_init',
      name,
      type,
      owner: getUserEmail(),
    };

    // Cache the metadata locally
    const metadata = {
      id, name, type, createdAt: tempTs,
    };
    listsMetadataCache.set(id, metadata);

    // Post both events (in parallel)
    await Promise.all([
      postUserListEvent(userEvent),
      postListEvent(id, listInitEvent),
    ]);

    return metadata;
  }

  // Remove a list from user's lists
  async function deleteList(id) {
    const event = { op: 'list_removed', id };
    const tempTs = new Date().toISOString();

    userListsCache.push({ ...event, ts: tempTs });
    listsMetadataCache.delete(id);

    saveListsLocal();
    await postUserListEvent(event);

    return true;
  }

  // Get cached lists
  function getLists() {
    const listIds = replayUserLists(userListsCache);
    return listIds
      .map((id) => listsMetadataCache.get(id))
      .filter(Boolean)
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }

  // Add an existing list to the user's account (for syncing lists found in localStorage)
  async function addExistingList(id, metadata) {
    const event = { op: 'list_added', id };
    const tempTs = new Date().toISOString();

    userListsCache.push({ ...event, ts: tempTs });

    // Cache the metadata
    if (metadata) {
      listsMetadataCache.set(id, metadata);
    }

    saveListsLocal();
    await postUserListEvent(event);

    return true;
  }

  return {
    loadListsFromServer,
    saveListsLocal,
    createList,
    deleteList,
    getLists,
    loadListMetadata,
    addExistingList,
    getCache: () => userListsCache,
  };
}

// ============================================
// IMAGE UPLOAD
// Uploads images to the sheet-logger worker
// Images stored at: ${API_BASE}/lists/${listId}/images/${filename}
// ============================================

export async function uploadHeroImage(listId, file) {
  const uploadUrl = `${API_BASE}/lists/${listId}`;

  try {
    updateSyncStatus('syncing');

    const formData = new FormData();
    formData.append('op', 'hero_image');
    formData.append('hero', file);

    const response = await fetch(uploadUrl, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const result = await response.json();
    updateSyncStatus('synced');

    // Return the image info from the response
    if (result.images && result.images.length > 0) {
      return result.images[0];
    }
    return null;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to upload hero image:', error);
    updateSyncStatus('error');
    return null;
  }
}

export function getHeroImageUrl(listId, imagePath) {
  if (!imagePath) return null;
  // If it's already a full URL, return as-is
  if (imagePath.startsWith('http')) return imagePath;
  // Otherwise construct from API base
  const baseUrl = API_BASE.replace('/grizz.biz/grizz-lists', '');
  return `${baseUrl}${imagePath}`;
}

// ============================================
// SHARED POLLING WITH FOCUS/BLUR HANDLING
// ============================================

export function createPoller(pollFn, intervalMs = 5000) {
  let pollInterval = null;
  let isWindowFocused = !document.hidden;

  function startPolling() {
    if (pollInterval) return; // Already polling
    pollInterval = setInterval(pollFn, intervalMs);
  }

  function stopPolling() {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  }

  function handleVisibilityChange() {
    if (document.hidden) {
      // Window blurred - stop polling
      isWindowFocused = false;
      stopPolling();
    } else {
      // Window focused - poll immediately and resume
      isWindowFocused = true;
      pollFn(); // Immediate poll to catch up
      startPolling();
    }
  }

  // Listen for visibility changes
  document.addEventListener('visibilitychange', handleVisibilityChange);

  // Also handle window focus/blur for broader compatibility
  window.addEventListener('focus', () => {
    if (!isWindowFocused) {
      isWindowFocused = true;
      pollFn();
      startPolling();
    }
  });

  window.addEventListener('blur', () => {
    isWindowFocused = false;
    stopPolling();
  });

  // Start polling if window is currently focused
  if (isWindowFocused) {
    startPolling();
  }

  return {
    start: startPolling,
    stop: stopPolling,
    isPolling: () => pollInterval !== null,
  };
}

// ============================================
// EVENT LOG VIEWER (Hidden Debug Tool)
// Dynamically loaded when Ctrl+Shift+E is pressed
// ============================================

// Lazy-loaded event log module
let eventLogModule = null;

// Register keystroke listener when DOM is ready
function initEventLogKeyListener() {
  document.addEventListener('keydown', async (e) => {
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'e') {
      e.preventDefault();

      // Dynamically import event-log.js on first use
      if (!eventLogModule) {
        try {
          const moduleUrl = new URL('./event-log.js', import.meta.url).href;
          eventLogModule = await import(moduleUrl);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('Failed to load event-log.js:', err);
          return;
        }
      }

      if (eventLogModule.isOpen()) {
        eventLogModule.closeEventLog();
      } else if (currentEventStoreGetCache) {
        eventLogModule.openEventLog(currentEventStoreGetCache);
      }
    }

    // Close on Escape
    if (e.key === 'Escape' && eventLogModule?.isOpen()) {
      eventLogModule.closeEventLog();
    }
  });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initEventLogKeyListener);
} else {
  initEventLogKeyListener();
}
