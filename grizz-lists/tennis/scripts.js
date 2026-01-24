// ============================================
// TENNIS CAPTAIN - Manage Players & Matches
// ============================================

/* eslint-disable no-use-before-define */

import {
  createEventStore,
  replayChangelogBase,
  getListIdFromUrl,
  addToRecentLists,
  generateId,
} from '../shared.js';

// ============================================
// LIST CONFIGURATION
// ============================================

const listId = getListIdFromUrl();

// If no list ID, redirect to main page
if (!listId) {
  window.location.href = '../index.html';
}

// ============================================
// EVENT STORE
// ============================================

const store = createEventStore('tennis', listId);

// Helper to write event and fetch latest state
async function writeEventAndRefresh(op, data) {
  try {
    // Post the event synchronously
    await store.postEvent({ op, ...data });
    
    // Fetch the latest state from server
    const changelog = await store.loadChangelogFromServer({ silent: true });
    
    // Replay the changelog to update local state
    const state = replayChangelog(changelog);
    players = state.players;
    matches = state.matches;
    availability = state.availability;
    assignments = state.assignments;
    
    return true;
  } catch (error) {
    console.error('Failed to write event:', error);
    return false;
  }
}

// ============================================
// REPLAY CHANGELOG
// ============================================

function replayChangelog(changelog) {
  const players = new Map();
  const matches = new Map();
  const availability = new Map(); // matchId -> Set of playerIds
  const assignments = new Map(); // matchId -> { positionId -> [playerIds] }
  
  const sortedEvents = [...changelog].sort((a, b) => (a.ts || '').localeCompare(b.ts || ''));

  sortedEvents.forEach((event) => {
    switch (event.op) {
      // Player operations
      case 'player_added':
        players.set(event.id, {
          id: event.id,
          name: event.name,
          email: event.email || '',
          phone: event.phone || '',
          usta: event.usta || '',
        });
        break;

      case 'player_updated':
        if (players.has(event.id)) {
          const player = players.get(event.id);
          if (event.name) player.name = event.name;
          if (event.email !== undefined) player.email = event.email;
          if (event.phone !== undefined) player.phone = event.phone;
          if (event.usta !== undefined) player.usta = event.usta;
        }
        break;

      case 'player_removed':
        players.delete(event.id);
        break;

      // Match operations
      case 'match_added':
        matches.set(event.id, {
          id: event.id,
          title: event.title,
          location: event.location || '',
          date: event.date,
          singles: event.singles || 2,
          doubles: event.doubles || 2,
        });
        availability.set(event.id, new Set());
        assignments.set(event.id, {});
        break;

      case 'match_updated':
        if (matches.has(event.id)) {
          const match = matches.get(event.id);
          if (event.title) match.title = event.title;
          if (event.location !== undefined) match.location = event.location;
          if (event.date) match.date = event.date;
          if (event.singles !== undefined) match.singles = event.singles;
          if (event.doubles !== undefined) match.doubles = event.doubles;
        }
        break;

      case 'match_removed':
        matches.delete(event.id);
        availability.delete(event.id);
        assignments.delete(event.id);
        break;

      // Availability operations
      case 'availability_set': {
        const matchAvail = availability.get(event.matchId);
        if (matchAvail) {
          matchAvail.add(event.playerId);
        }
        break;
      }

      case 'availability_unset': {
        const matchAvail = availability.get(event.matchId);
        if (matchAvail) {
          matchAvail.delete(event.playerId);
        }
        break;
      }

      // Assignment operations
      case 'assignment_set': {
        const matchAssign = assignments.get(event.matchId);
        if (matchAssign) {
          if (!matchAssign[event.positionId]) {
            matchAssign[event.positionId] = { players: [], date: null };
          }
          const playerIds = typeof event.playerIds === 'string' 
            ? JSON.parse(event.playerIds) 
            : event.playerIds;
          matchAssign[event.positionId].players = playerIds;
          if (event.date !== undefined) {
            matchAssign[event.positionId].date = event.date;
          }
        }
        break;
      }

      case 'assignment_clear': {
        const matchAssign = assignments.get(event.matchId);
        if (matchAssign && event.positionId) {
          delete matchAssign[event.positionId];
        }
        break;
      }

      case 'position_time_set': {
        const matchAssign = assignments.get(event.matchId);
        if (matchAssign) {
          if (!matchAssign[event.positionId]) {
            matchAssign[event.positionId] = { players: [], date: null };
          }
          matchAssign[event.positionId].date = event.date;
        }
        break;
      }

      default:
        break;
    }
  });

  return {
    players: Array.from(players.values()).sort((a, b) => a.name.localeCompare(b.name)),
    matches: Array.from(matches.values()).sort((a, b) => (a.date || '').localeCompare(b.date || '')),
    availability,
    assignments,
  };
}

// ============================================
// UI STATE & DOM
// ============================================

let players = [];
let matches = [];
let availability = new Map();
let assignments = new Map();
let currentView = 'matches';
let editingPlayerId = null;
let editingMatchId = null;
let currentLineupMatchId = null;

// Render hashes to prevent unnecessary re-renders
let playersRenderHash = '';
let matchesRenderHash = '';

// DOM Elements
const playerList = document.getElementById('playerList');
const matchList = document.getElementById('matchList');
const addBtn = document.getElementById('addBtn');
const addBtnText = document.getElementById('addBtnText');

// View tabs
const viewTabs = document.querySelectorAll('.view-tab');
const viewContents = document.querySelectorAll('.view-content');

// Player modal
const playerModal = document.getElementById('playerModal');
const playerModalTitle = document.getElementById('playerModalTitle');
const playerNameInput = document.getElementById('playerNameInput');
const playerEmailInput = document.getElementById('playerEmailInput');
const playerPhoneInput = document.getElementById('playerPhoneInput');
const playerUstaInput = document.getElementById('playerUstaInput');
const submitPlayer = document.getElementById('submitPlayer');
const cancelPlayer = document.getElementById('cancelPlayer');
const deletePlayerBtn = document.getElementById('deletePlayerBtn');

// Match modal
const matchModal = document.getElementById('matchModal');
const matchModalTitle = document.getElementById('matchModalTitle');
const matchTitleInput = document.getElementById('matchTitleInput');
const matchLocationInput = document.getElementById('matchLocationInput');
const matchDateInput = document.getElementById('matchDateInput');
const submitMatch = document.getElementById('submitMatch');
const cancelMatch = document.getElementById('cancelMatch');
const deleteMatchBtn = document.getElementById('deleteMatchBtn');
const formatOptions = document.querySelectorAll('.format-option');
const customFormatGroup = document.getElementById('customFormatGroup');
const singlesCount = document.getElementById('singlesCount');
const doublesCount = document.getElementById('doublesCount');
const counterBtns = document.querySelectorAll('.counter-btn');

// Lineup modal
const lineupModal = document.getElementById('lineupModal');
const lineupModalTitle = document.getElementById('lineupModalTitle');
const lineupModalSubtitle = document.getElementById('lineupModalSubtitle');
const lineupAssignment = document.getElementById('lineupAssignment');
const cancelLineup = document.getElementById('cancelLineup');

// Position time modal
const positionTimeModal = document.getElementById('positionTimeModal');
const positionTimeModalTitle = document.getElementById('positionTimeModalTitle');
const positionTimeModalSubtitle = document.getElementById('positionTimeModalSubtitle');
const positionTimeInput = document.getElementById('positionTimeInput');
const submitPositionTime = document.getElementById('submitPositionTime');
const cancelPositionTime = document.getElementById('cancelPositionTime');

// Player availability modal
const playerAvailabilityModal = document.getElementById('playerAvailabilityModal');
const playerAvailabilityModalTitle = document.getElementById('playerAvailabilityModalTitle');
const playerAvailabilityModalSubtitle = document.getElementById('playerAvailabilityModalSubtitle');
const availabilityMatchesList = document.getElementById('availabilityMatchesList');
const cancelPlayerAvailability = document.getElementById('cancelPlayerAvailability');

// Import modal
const importPlayersBtn = document.getElementById('importPlayersBtn');
const importModal = document.getElementById('importModal');
const importTextarea = document.getElementById('importTextarea');
const previewImport = document.getElementById('previewImport');
const importPreview = document.getElementById('importPreview');
const previewList = document.getElementById('previewList');
const previewCount = document.getElementById('previewCount');
const confirmImport = document.getElementById('confirmImport');
const cancelImport = document.getElementById('cancelImport');

// Import matches modal
const importMatchesModal = document.getElementById('importMatchesModal');
const importMatchesTextarea = document.getElementById('importMatchesTextarea');
const previewMatchesImport = document.getElementById('previewMatchesImport');
const importMatchesPreview = document.getElementById('importMatchesPreview');
const previewMatchesList = document.getElementById('previewMatchesList');
const previewMatchesCount = document.getElementById('previewMatchesCount');
const confirmMatchesImport = document.getElementById('confirmMatchesImport');
const cancelMatchesImport = document.getElementById('cancelMatchesImport');

let parsedPlayers = [];
let parsedMatches = [];

let selectedFormat = '2singles-2doubles';
let customSingles = 2;
let customDoubles = 2;

// Position time editing state
let editingPositionMatchId = null;
let editingPositionId = null;

// Player availability editing state
let currentAvailabilityPlayerId = null;

// ============================================
// INITIALIZATION
// ============================================

async function init() {
  setupEventListeners();

  const changelog = await store.loadChangelogFromServer();
  const state = replayChangelog(changelog);
  
  players = state.players;
  matches = state.matches;
  availability = state.availability;
  assignments = state.assignments;

  // Set list title
  const metadata = store.getMetadata();
  const listTitleEl = document.getElementById('listTitle');
  if (listTitleEl && metadata.name) {
    listTitleEl.textContent = metadata.name;
    document.title = `${metadata.name} 🎾 - Grizz Lists`;
  }

  // Track this list as recently accessed
  addToRecentLists(listId, metadata.name, 'tennis');

  renderCurrentView();
}

function setupEventListeners() {
  // View tabs
  viewTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const view = tab.dataset.view;
      switchView(view);
    });
  });

  // Add button
  addBtn.addEventListener('click', handleAddClick);

  // Player modal
  cancelPlayer.addEventListener('click', closePlayerModal);
  playerModal.addEventListener('click', (e) => {
    if (e.target === playerModal) closePlayerModal();
  });
  playerNameInput.addEventListener('input', validatePlayerForm);
  playerNameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !submitPlayer.disabled) {
      handlePlayerSubmit();
    }
  });
  submitPlayer.addEventListener('click', handlePlayerSubmit);
  deletePlayerBtn.addEventListener('click', () => {
    if (editingPlayerId) {
      deletePlayer(editingPlayerId);
      closePlayerModal();
    }
  });

  // Match modal
  cancelMatch.addEventListener('click', closeMatchModal);
  matchModal.addEventListener('click', (e) => {
    if (e.target === matchModal) closeMatchModal();
  });
  matchTitleInput.addEventListener('input', validateMatchForm);
  matchDateInput.addEventListener('input', validateMatchForm);
  submitMatch.addEventListener('click', handleMatchSubmit);
  deleteMatchBtn.addEventListener('click', () => {
    if (editingMatchId) {
      deleteMatch(editingMatchId);
      closeMatchModal();
    }
  });
  
  // Format selection
  formatOptions.forEach((option) => {
    option.addEventListener('click', () => {
      formatOptions.forEach((o) => o.classList.remove('active'));
      option.classList.add('active');
      selectedFormat = option.dataset.format;
      
      if (selectedFormat === 'custom') {
        customFormatGroup.style.display = 'block';
      } else {
        customFormatGroup.style.display = 'none';
      }
    });
  });

  // Counter buttons
  counterBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const counter = btn.dataset.counter;
      const action = btn.dataset.action;
      
      if (counter === 'singles') {
        if (action === 'inc' && customSingles < 6) {
          customSingles++;
        } else if (action === 'dec' && customSingles > 0) {
          customSingles--;
        }
        singlesCount.textContent = customSingles;
      } else if (counter === 'doubles') {
        if (action === 'inc' && customDoubles < 6) {
          customDoubles++;
        } else if (action === 'dec' && customDoubles > 0) {
          customDoubles--;
        }
        doublesCount.textContent = customDoubles;
      }
    });
  });

  // Lineup modal
  cancelLineup.addEventListener('click', closeLineupModal);
  lineupModal.addEventListener('click', (e) => {
    if (e.target === lineupModal) closeLineupModal();
  });

  // Position time modal
  cancelPositionTime.addEventListener('click', closePositionTimeModal);
  positionTimeModal.addEventListener('click', (e) => {
    if (e.target === positionTimeModal) closePositionTimeModal();
  });
  submitPositionTime.addEventListener('click', handlePositionTimeSubmit);

  // Player availability modal
  cancelPlayerAvailability.addEventListener('click', closePlayerAvailabilityModal);
  playerAvailabilityModal.addEventListener('click', (e) => {
    if (e.target === playerAvailabilityModal) closePlayerAvailabilityModal();
  });

  // Import modal
  importPlayersBtn.addEventListener('click', openImportModal);
  cancelImport.addEventListener('click', closeImportModal);
  importModal.addEventListener('click', (e) => {
    if (e.target === importModal) closeImportModal();
  });
  previewImport.addEventListener('click', handlePreviewImport);
  confirmImport.addEventListener('click', handleConfirmImport);

  // Import matches modal
  cancelMatchesImport.addEventListener('click', closeImportMatchesModal);
  importMatchesModal.addEventListener('click', (e) => {
    if (e.target === importMatchesModal) closeImportMatchesModal();
  });
  previewMatchesImport.addEventListener('click', handlePreviewMatchesImport);
  confirmMatchesImport.addEventListener('click', handleConfirmMatchesImport);
}

// ============================================
// VIEW SWITCHING
// ============================================

function switchView(view, skipHistory = false) {
  currentView = view;
  
  // Update URL hash
  if (!skipHistory) {
    const newHash = view === 'matches' ? '' : view;
    const url = newHash ? `#${newHash}` : window.location.pathname + window.location.search;
    history.pushState({ view }, '', url);
  }
  
  // Update tabs
  viewTabs.forEach((tab) => {
    if (tab.dataset.view === view) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });

  // Update views
  viewContents.forEach((content) => {
    content.classList.remove('active');
  });
  document.getElementById(`${view}View`).classList.add('active');

  // Update add button text and import button visibility
  if (view === 'players') {
    addBtnText.textContent = 'Add Player';
    importPlayersBtn.style.display = 'flex';
  } else if (view === 'matches') {
    addBtnText.textContent = 'Add Match';
    importPlayersBtn.style.display = 'flex';
    importPlayersBtn.title = 'Import matches';
    // Change the icon to upload
    importPlayersBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>`;
    importPlayersBtn.onclick = openImportMatchesModal;
  }

  renderCurrentView();
}

function renderCurrentView() {
  if (currentView === 'players') {
    renderPlayers();
  } else if (currentView === 'matches') {
    renderMatches();
  }
}

function handleHashChange() {
  const hash = window.location.hash.slice(1); // Remove #
  
  // Check if it's a match reference (e.g., #match-123 or #matches/match-123)
  const matchMatch = hash.match(/^(?:matches\/)?match-(.+)$/);
  
  if (matchMatch) {
    // Switch to matches view and scroll to match
    const matchId = matchMatch[1];
    if (currentView !== 'matches') {
      switchView('matches', true);
    }
    // Wait for render then scroll
    setTimeout(() => {
      scrollToMatch(matchId);
    }, 100);
  } else if (hash === 'matches' || hash === 'players') {
    switchView(hash, true);
  } else if (!hash) {
    switchView('matches', true);
  }
}

function scrollToMatch(matchId) {
  const matchCard = document.querySelector(`[data-match-id="${matchId}"]`);
  if (matchCard) {
    matchCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Add a highlight effect
    matchCard.classList.add('highlight');
    setTimeout(() => {
      matchCard.classList.remove('highlight');
    }, 2000);
  }
}

// ============================================
// PLAYER OPERATIONS
// ============================================

function handleAddClick() {
  if (currentView === 'players') {
    openPlayerModal();
  } else if (currentView === 'matches') {
    openMatchModal();
  }
}

function showImportButton() {
  // Show import button based on current view
  if (currentView === 'players') {
    importPlayersBtn.style.display = 'flex';
  } else {
    importPlayersBtn.style.display = 'none';
  }
}

function openPlayerModal(playerId = null) {
  editingPlayerId = playerId;
  
  if (playerId) {
    const player = players.find((p) => p.id === playerId);
    if (player) {
      playerModalTitle.textContent = 'Edit Player';
      playerNameInput.value = player.name;
      playerEmailInput.value = player.email || '';
      playerPhoneInput.value = player.phone || '';
      playerUstaInput.value = player.usta || '';
      submitPlayer.textContent = 'Save Changes';
      deletePlayerBtn.style.display = 'block';
    }
  } else {
    playerModalTitle.textContent = 'Add Player';
    playerNameInput.value = '';
    playerEmailInput.value = '';
    playerPhoneInput.value = '';
    playerUstaInput.value = '';
    submitPlayer.textContent = 'Add Player';
    deletePlayerBtn.style.display = 'none';
  }
  
  validatePlayerForm();
  playerModal.classList.add('active');
  playerNameInput.focus();
}

function closePlayerModal() {
  playerModal.classList.remove('active');
  editingPlayerId = null;
}

function validatePlayerForm() {
  const name = playerNameInput.value.trim();
  submitPlayer.disabled = !name;
}

async function handlePlayerSubmit() {
  const name = playerNameInput.value.trim();
  if (!name) return;

  const email = playerEmailInput.value.trim();
  const phone = playerPhoneInput.value.trim();
  const usta = playerUstaInput.value.trim();

  if (editingPlayerId) {
    // Update existing player
    await writeEventAndRefresh('player_updated', {
      id: editingPlayerId,
      name,
      email,
      phone,
      usta,
    });
  } else {
    // Add new player
    const id = generateId();
    await writeEventAndRefresh('player_added', {
      id,
      name,
      email,
      phone,
      usta,
    });
  }

  closePlayerModal();
  renderPlayers(true);
}

async function deletePlayer(id) {
  if (!confirm('Are you sure you want to delete this player?')) return;

  await writeEventAndRefresh('player_removed', { id });
  
  renderPlayers(true);
}

// ============================================
// PLAYER AVAILABILITY
// ============================================

function openPlayerAvailabilityModal(playerId) {
  currentAvailabilityPlayerId = playerId;
  
  const player = players.find((p) => p.id === playerId);
  if (!player) return;
  
  playerAvailabilityModalTitle.textContent = `${player.name} - Match Availability`;
  
  renderAvailabilityMatches(playerId);
  playerAvailabilityModal.classList.add('active');
}

function closePlayerAvailabilityModal() {
  playerAvailabilityModal.classList.remove('active');
  currentAvailabilityPlayerId = null;
  renderPlayers(true);
}

function renderAvailabilityMatches(playerId) {
  if (matches.length === 0) {
    availabilityMatchesList.innerHTML = `
      <div class="empty-state" style="padding: 20px;">
        <p style="color: var(--text-muted); text-align: center;">No matches scheduled yet. Add matches in the Matches tab.</p>
      </div>
    `;
    return;
  }
  
  let html = '';
  matches.forEach((match) => {
    const matchAvail = availability.get(match.id) || new Set();
    const isAvailable = matchAvail.has(playerId);
    
    const matchDate = match.date ? new Date(match.date) : null;
    const dateStr = matchDate ? matchDate.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }) : 'Date TBD';
    
    html += `
      <div class="availability-match-item ${isAvailable ? 'available' : ''}" data-match-id="${match.id}">
        <div class="availability-match-checkbox">
          ${isAvailable ? `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          ` : ''}
        </div>
        <div class="availability-match-info">
          <div class="availability-match-title">${escapeHtml(match.title)}</div>
          <div class="availability-match-date">${dateStr}</div>
          ${match.location ? `<div class="availability-match-location">${escapeHtml(match.location)}</div>` : ''}
        </div>
      </div>
    `;
  });
  
  availabilityMatchesList.innerHTML = html;
  
  // Add event listeners
  availabilityMatchesList.querySelectorAll('.availability-match-item').forEach((item) => {
    item.addEventListener('click', () => {
      toggleAvailability(item.dataset.matchId, currentAvailabilityPlayerId);
    });
  });
}

async function toggleAvailability(matchId, playerId) {
  const matchAvail = availability.get(matchId);
  if (!matchAvail) return;

  if (matchAvail.has(playerId)) {
    await writeEventAndRefresh('availability_unset', { matchId, playerId });
  } else {
    await writeEventAndRefresh('availability_set', { matchId, playerId });
  }

  // Re-render the availability matches
  if (currentAvailabilityPlayerId) {
    renderAvailabilityMatches(currentAvailabilityPlayerId);
  }
}

function getPlayersHash() {
  return players.map((p) => `${p.id}:${p.name}:${p.email}:${p.phone}:${p.usta}`).join('|');
}

function renderPlayers(force = false) {
  const currentHash = getPlayersHash();
  
  // Skip render if nothing changed (unless forced)
  if (!force && currentHash === playersRenderHash) {
    return;
  }
  playersRenderHash = currentHash;

  if (players.length === 0) {
    playerList.innerHTML = `
      <div class="empty-state">
        <div class="empty-emoji">👥</div>
        <p class="empty-text">No players yet!</p>
        <p class="empty-hint">Add your first player to get started</p>
      </div>
    `;
    return;
  }

  let html = '';
  players.forEach((player, index) => {
    html += `
      <div class="player-card" style="animation-delay: ${index * 0.05}s">
        <div class="player-header">
          <div class="player-name">${escapeHtml(player.name)}</div>
          <div class="player-actions">
            <button class="action-btn availability" data-player-id="${player.id}" title="Set availability">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
            </button>
            <button class="action-btn edit" data-player-id="${player.id}" title="Edit player">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
          </div>
        </div>
        ${player.usta || player.email || player.phone ? `
          <div class="player-info">
            ${player.usta ? `
              <div class="info-row">
                <svg class="info-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
                <span class="usta-badge">USTA: ${escapeHtml(player.usta)}</span>
              </div>
            ` : ''}
            ${player.email ? `
              <div class="info-row">
                <svg class="info-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                  <polyline points="22,6 12,13 2,6"/>
                </svg>
                ${escapeHtml(player.email)}
              </div>
            ` : ''}
            ${player.phone ? `
              <div class="info-row">
                <svg class="info-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                </svg>
                ${escapeHtml(player.phone)}
              </div>
            ` : ''}
          </div>
        ` : ''}
        ${renderPlayerAvailabilitySummary(player.id)}
      </div>
    `;
  });

  playerList.innerHTML = html;

  // Add event listeners
  playerList.querySelectorAll('.availability').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openPlayerAvailabilityModal(btn.dataset.playerId);
    });
  });

  playerList.querySelectorAll('.edit').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openPlayerModal(btn.dataset.playerId);
    });
  });
}

function renderPlayerAvailabilitySummary(playerId) {
  // Count how many matches this player is available for
  let availableCount = 0;
  availability.forEach((playerSet) => {
    if (playerSet.has(playerId)) {
      availableCount++;
    }
  });
  
  if (availableCount === 0 && matches.length === 0) {
    return '';
  }
  
  return `
    <div class="player-availability-summary">
      <svg class="info-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
      <span>Available for ${availableCount}/${matches.length} match${matches.length !== 1 ? 'es' : ''}</span>
    </div>
  `;
}

// ============================================
// MATCH OPERATIONS
// ============================================

function openMatchModal(matchId = null) {
  editingMatchId = matchId;
  
  if (matchId) {
    const match = matches.find((m) => m.id === matchId);
    if (match) {
      matchModalTitle.textContent = 'Edit Match';
      matchTitleInput.value = match.title;
      matchLocationInput.value = match.location || '';
      matchDateInput.value = match.date || '';
      
      // Set format based on match
      customSingles = match.singles;
      customDoubles = match.doubles;
      singlesCount.textContent = customSingles;
      doublesCount.textContent = customDoubles;
      
      if (match.singles === 2 && match.doubles === 2) {
        selectedFormat = '2singles-2doubles';
        formatOptions[0].classList.add('active');
        formatOptions[1].classList.remove('active');
        formatOptions[2].classList.remove('active');
        customFormatGroup.style.display = 'none';
      } else if (match.singles === 3 && match.doubles === 2) {
        selectedFormat = '3singles-2doubles';
        formatOptions[0].classList.remove('active');
        formatOptions[1].classList.add('active');
        formatOptions[2].classList.remove('active');
        customFormatGroup.style.display = 'none';
      } else {
        selectedFormat = 'custom';
        formatOptions[0].classList.remove('active');
        formatOptions[1].classList.remove('active');
        formatOptions[2].classList.add('active');
        customFormatGroup.style.display = 'block';
      }
      
      submitMatch.textContent = 'Save Changes';
      deleteMatchBtn.style.display = 'block';
    }
  } else {
    matchModalTitle.textContent = 'Add Match';
    matchTitleInput.value = '';
    matchLocationInput.value = '';
    matchDateInput.value = '';
    
    selectedFormat = '2singles-2doubles';
    customSingles = 2;
    customDoubles = 2;
    singlesCount.textContent = customSingles;
    doublesCount.textContent = customDoubles;
    
    formatOptions.forEach((o) => o.classList.remove('active'));
    formatOptions[0].classList.add('active');
    customFormatGroup.style.display = 'none';
    
    submitMatch.textContent = 'Add Match';
    deleteMatchBtn.style.display = 'none';
  }
  
  validateMatchForm();
  matchModal.classList.add('active');
  matchTitleInput.focus();
}

function closeMatchModal() {
  matchModal.classList.remove('active');
  editingMatchId = null;
}

function validateMatchForm() {
  const title = matchTitleInput.value.trim();
  const date = matchDateInput.value.trim();
  submitMatch.disabled = !title || !date;
}

async function handleMatchSubmit() {
  const title = matchTitleInput.value.trim();
  const location = matchLocationInput.value.trim();
  const date = matchDateInput.value.trim();
  
  if (!title || !date) return;

  let singles = 2;
  let doubles = 2;
  
  if (selectedFormat === '2singles-2doubles') {
    singles = 2;
    doubles = 2;
  } else if (selectedFormat === '3singles-2doubles') {
    singles = 3;
    doubles = 2;
  } else if (selectedFormat === 'custom') {
    singles = customSingles;
    doubles = customDoubles;
  }

  if (editingMatchId) {
    // Update existing match
    await writeEventAndRefresh('match_updated', {
      id: editingMatchId,
      title,
      location,
      date,
      singles,
      doubles,
    });
  } else {
    // Add new match
    const id = generateId();
    await writeEventAndRefresh('match_added', {
      id,
      title,
      location,
      date,
      singles,
      doubles,
    });
  }

  closeMatchModal();
  renderMatches(true);
}

async function deleteMatch(id) {
  if (!confirm('Are you sure you want to delete this match?')) return;

  await writeEventAndRefresh('match_removed', { id });

  renderMatches(true);
}

function getMatchesHash() {
  // Include match data, availability, and assignments in hash
  const matchData = matches.map((m) => {
    const avail = availability.get(m.id) || new Set();
    const assign = assignments.get(m.id) || {};
    return `${m.id}:${m.title}:${m.date}:${m.singles}:${m.doubles}:${Array.from(avail).sort().join(',')}:${JSON.stringify(assign)}`;
  }).join('|');
  return matchData;
}

function renderMatchLineupSummary(match) {
  const matchAssign = assignments.get(match.id) || {};
  
  // Check if any positions are assigned
  const hasAssignments = Object.keys(matchAssign).length > 0;
  if (!hasAssignments) {
    return '';
  }
  
  let html = '<div class="lineup-summary">';
  html += '<div class="lineup-summary-header">Assigned Lineup</div>';
  html += '<div class="lineup-summary-positions">';
  
  // Helper to check if dates are on different days
  const isDifferentDay = (date1, date2) => {
    if (!date1 || !date2) return false;
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    return d1.toDateString() !== d2.toDateString();
  };
  
  // Helper to format date as "Wed 1/28"
  const formatShortDate = (dateStr) => {
    const date = new Date(dateStr);
    const weekday = date.toLocaleDateString('en-US', { weekday: 'short' });
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${weekday} ${month}/${day}`;
  };
  
  // Render singles assignments
  for (let i = 0; i < match.singles; i++) {
    const positionId = `singles-${i + 1}`;
    const positionData = matchAssign[positionId];
    
    if (positionData) {
      const assignedIds = Array.isArray(positionData) ? positionData : (positionData.players || []);
      const positionDate = Array.isArray(positionData) ? null : positionData.date;
      
      if (assignedIds.length > 0) {
        const assignedPlayer = players.find((p) => p.id === assignedIds[0]);
        
        // Get display date
        let displayDate = match.date;
        let isDifferent = false;
        if (positionDate && positionDate !== 'null' && positionDate !== 'undefined') {
          displayDate = positionDate;
          isDifferent = isDifferentDay(match.date, positionDate);
        }
        
        const timeStr = displayDate ? new Date(displayDate).toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
        }) : '';
        
        const dateStr = isDifferent ? formatShortDate(displayDate) : '';
        
        if (assignedPlayer) {
          html += `
            <div class="lineup-summary-position">
              <div class="lineup-summary-label">S${i + 1}</div>
              <div class="lineup-summary-details">
                <div class="lineup-summary-player">${escapeHtml(assignedPlayer.name)}</div>
                <div class="lineup-summary-datetime">
                  ${dateStr ? `<span class="lineup-summary-date-diff">${dateStr}</span>` : ''}
                  ${timeStr ? `<div class="lineup-summary-time">${timeStr}</div>` : ''}
                </div>
              </div>
            </div>
          `;
        }
      }
    }
  }
  
  // Render doubles assignments
  for (let i = 0; i < match.doubles; i++) {
    const positionId = `doubles-${i + 1}`;
    const positionData = matchAssign[positionId];
    
    if (positionData) {
      const assignedIds = Array.isArray(positionData) ? positionData : (positionData.players || []);
      const positionDate = Array.isArray(positionData) ? null : positionData.date;
      
      if (assignedIds.length > 0) {
        const assignedPlayers = assignedIds.map((pId) => players.find((p) => p.id === pId)).filter(Boolean);
        
        // Get display date
        let displayDate = match.date;
        let isDifferent = false;
        if (positionDate && positionDate !== 'null' && positionDate !== 'undefined') {
          displayDate = positionDate;
          isDifferent = isDifferentDay(match.date, positionDate);
        }
        
        const timeStr = displayDate ? new Date(displayDate).toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
        }) : '';
        
        const dateStr = isDifferent ? formatShortDate(displayDate) : '';
        
        if (assignedPlayers.length > 0) {
          // Show each player on a separate line
          assignedPlayers.forEach((player, playerIndex) => {
            if (playerIndex === 0) {
              // First player gets the full position layout
              html += `
                <div class="lineup-summary-position">
                  <div class="lineup-summary-label">D${i + 1}</div>
                  <div class="lineup-summary-details">
                    <div class="lineup-summary-player">${escapeHtml(player.name)}</div>
                    <div class="lineup-summary-datetime">
                      ${dateStr ? `<span class="lineup-summary-date-diff">${dateStr}</span>` : ''}
                      ${timeStr ? `<div class="lineup-summary-time">${timeStr}</div>` : ''}
                    </div>
                  </div>
                </div>
              `;
            } else {
              // Additional players are indented without label
              html += `
                <div class="lineup-summary-position lineup-summary-position-secondary">
                  <div class="lineup-summary-player">${escapeHtml(player.name)}</div>
                </div>
              `;
            }
          });
        }
      }
    }
  }
  
  html += '</div></div>';
  return html;
}

function renderMatches(force = false) {
  const currentHash = getMatchesHash();
  
  // Skip render if nothing changed (unless forced)
  if (!force && currentHash === matchesRenderHash) {
    return;
  }
  matchesRenderHash = currentHash;

  if (matches.length === 0) {
    matchList.innerHTML = `
      <div class="empty-state">
        <div class="empty-emoji">📅</div>
        <p class="empty-text">No matches scheduled!</p>
        <p class="empty-hint">Add your first match to get started</p>
      </div>
    `;
    return;
  }

  // Get current user's player ID (if they exist)
  // For simplicity, we'll show all players' availability
  
  let html = '';
  matches.forEach((match, index) => {
    const matchDate = match.date ? new Date(match.date) : null;
    const dateStr = matchDate ? matchDate.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }) : 'Date TBD';
    
    const isPast = matchDate && matchDate < new Date();
    const statusClass = isPast ? 'completed' : 'upcoming';
    const statusText = isPast ? 'Completed' : 'Upcoming';
    
    const matchAvail = availability.get(match.id) || new Set();
    const availableCount = matchAvail.size;
    
    html += `
      <div class="match-card" style="animation-delay: ${index * 0.05}s" data-match-id="${match.id}">
        <div class="match-header">
          <div class="match-title">${escapeHtml(match.title)}</div>
          <div class="match-actions">
            <button class="action-btn lineup" data-match-id="${match.id}" title="Manage lineup">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </button>
            <button class="action-btn edit" data-match-id="${match.id}" title="Edit match">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
          </div>
        </div>
        
        <div class="match-info">
          <div class="info-row">
            <svg class="info-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            <span class="match-date">${dateStr}</span>
          </div>
          ${match.location ? `
            <div class="info-row">
              <svg class="info-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
              ${escapeHtml(match.location)}
            </div>
          ` : ''}
        </div>
        
        <div class="match-format">
          ${match.singles > 0 ? `<span class="format-badge">${match.singles} Singles</span>` : ''}
          ${match.doubles > 0 ? `<span class="format-badge">${match.doubles} Doubles</span>` : ''}
        </div>
        
        <span class="match-status ${statusClass}">${statusText}</span>
        
        ${renderMatchLineupSummary(match)}
      </div>
    `;
  });

  matchList.innerHTML = html;

  // Add event listeners
  matchList.querySelectorAll('.edit').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openMatchModal(btn.dataset.matchId);
    });
  });

  matchList.querySelectorAll('.lineup').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openLineupModal(btn.dataset.matchId);
    });
  });

  // Add click handler to match cards to update hash and scroll
  matchList.querySelectorAll('.match-card').forEach((card) => {
    card.addEventListener('click', (e) => {
      // Don't trigger if clicking on action buttons
      if (e.target.closest('.action-btn')) return;
      
      const matchId = card.dataset.matchId;
      // Update hash without triggering hashchange
      history.pushState({ view: 'matches', matchId }, '', `#match-${matchId}`);
      
      // Scroll to position and highlight
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card.classList.add('highlight');
      setTimeout(() => {
        card.classList.remove('highlight');
      }, 2000);
    });
    
    // Add cursor pointer style
    card.style.cursor = 'pointer';
  });
}

// ============================================
// LINEUP VIEW

// ============================================
// LINEUP ASSIGNMENT MODAL
// ============================================

function openLineupModal(matchId) {
  currentLineupMatchId = matchId;
  const match = matches.find((m) => m.id === matchId);
  if (!match) return;

  lineupModalTitle.textContent = `Assign Lineup`;
  lineupModalSubtitle.textContent = `${match.title} - ${match.date ? new Date(match.date).toLocaleDateString() : 'Date TBD'}`;

  renderLineupAssignments(matchId);
  lineupModal.classList.add('active');
}

function closeLineupModal() {
  lineupModal.classList.remove('active');
  currentLineupMatchId = null;
  
  // Refresh the current view
  renderCurrentView();
}

function renderLineupAssignments(matchId) {
  const match = matches.find((m) => m.id === matchId);
  if (!match) return;

  const matchAvail = availability.get(matchId) || new Set();
  const matchAssign = assignments.get(matchId) || {};
  
  // Get available players who aren't already assigned
  const assignedPlayerIds = new Set();
  Object.values(matchAssign).forEach((data) => {
    const playerIds = Array.isArray(data) ? data : (data.players || []);
    playerIds.forEach((pId) => assignedPlayerIds.add(pId));
  });

  let html = '';

  // Render singles positions
  for (let i = 0; i < match.singles; i++) {
    const positionId = `singles-${i + 1}`;
    const positionData = matchAssign[positionId] || { players: [], date: null };
    const assignedIds = Array.isArray(matchAssign[positionId]) ? matchAssign[positionId] : positionData.players;
    const positionDate = Array.isArray(matchAssign[positionId]) ? null : positionData.date;
    const assignedPlayer = assignedIds.length > 0 ? players.find((p) => p.id === assignedIds[0]) : null;
    
    // Always fall back to match date if position date is invalid
    let displayDate = match.date;
    if (positionDate && positionDate !== 'null' && positionDate !== 'undefined') {
      displayDate = positionDate;
    }
    
    const dateStr = displayDate ? new Date(displayDate).toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }) : 'Time TBD';
    
    html += `
      <div class="lineup-position">
        <div class="position-header">
          <span class="position-label">Singles ${i + 1}</span>
          <span class="position-type">Singles</span>
        </div>
        
        <div class="position-time">
          <svg class="time-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          <span class="time-text">${dateStr}</span>
          <button class="time-edit-btn" data-position="${positionId}" data-current-date="${displayDate || ''}" title="Change time">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
        </div>
        
        ${assignedPlayer ? `
          <div class="assigned-players">
            <div class="assigned-player">
              <span>${escapeHtml(assignedPlayer.name)}</span>
              <button class="remove-player-btn" data-position="${positionId}" data-player="${assignedPlayer.id}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          </div>
        ` : ''}
        
        ${!assignedPlayer ? `
          <div class="available-players-list">
            ${renderAvailablePlayers(matchId, positionId, matchAvail, assignedPlayerIds)}
          </div>
        ` : ''}
      </div>
    `;
  }

  // Render doubles positions
  for (let i = 0; i < match.doubles; i++) {
    const positionId = `doubles-${i + 1}`;
    const positionData = matchAssign[positionId] || { players: [], date: null };
    const assignedIds = Array.isArray(matchAssign[positionId]) ? matchAssign[positionId] : positionData.players;
    const positionDate = Array.isArray(matchAssign[positionId]) ? null : positionData.date;
    const assignedPlayers = assignedIds.map((pId) => players.find((p) => p.id === pId)).filter(Boolean);
    
    // Always fall back to match date if position date is invalid
    let displayDate = match.date;
    if (positionDate && positionDate !== 'null' && positionDate !== 'undefined') {
      displayDate = positionDate;
    }
    
    const dateStr = displayDate ? new Date(displayDate).toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }) : 'Time TBD';
    
    html += `
      <div class="lineup-position">
        <div class="position-header">
          <span class="position-label">Doubles ${i + 1}</span>
          <span class="position-type">Doubles</span>
        </div>
        
        <div class="position-time">
          <svg class="time-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          <span class="time-text">${dateStr}</span>
          <button class="time-edit-btn" data-position="${positionId}" data-current-date="${displayDate || ''}" title="Change time">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
        </div>
        
        ${assignedPlayers.length > 0 ? `
          <div class="assigned-players">
            ${assignedPlayers.map((player) => `
              <div class="assigned-player">
                <span>${escapeHtml(player.name)}</span>
                <button class="remove-player-btn" data-position="${positionId}" data-player="${player.id}">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            `).join('')}
          </div>
        ` : ''}
        
        ${assignedPlayers.length < 2 ? `
          <div class="available-players-list">
            ${renderAvailablePlayers(matchId, positionId, matchAvail, assignedPlayerIds)}
          </div>
        ` : ''}
      </div>
    `;
  }

  lineupAssignment.innerHTML = html;

  // Add event listeners for assigning players
  lineupAssignment.querySelectorAll('.available-player-item').forEach((item) => {
    item.addEventListener('click', () => {
      assignPlayer(matchId, item.dataset.position, item.dataset.playerId);
    });
  });

  // Add event listeners for removing players
  lineupAssignment.querySelectorAll('.remove-player-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      unassignPlayer(matchId, btn.dataset.position, btn.dataset.player);
    });
  });

  // Add event listeners for editing position times
  lineupAssignment.querySelectorAll('.time-edit-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const positionId = btn.dataset.position;
      const currentDate = btn.dataset.currentDate;
      openPositionTimeModal(matchId, positionId, currentDate);
    });
  });
}

function renderAvailablePlayers(matchId, positionId, matchAvail, assignedPlayerIds) {
  const availablePlayers = players.filter((p) => 
    matchAvail.has(p.id) && !assignedPlayerIds.has(p.id)
  );

  if (availablePlayers.length === 0) {
    return `
      <div class="no-available-players">
        No available players. Mark players as available in the Matches tab.
      </div>
    `;
  }

  return availablePlayers.map((player) => `
    <div class="available-player-item" data-position="${positionId}" data-player-id="${player.id}">
      <span>${escapeHtml(player.name)}</span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="12" y1="5" x2="12" y2="19"/>
        <line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
    </div>
  `).join('');
}

async function assignPlayer(matchId, positionId, playerId) {
  const matchAssign = assignments.get(matchId);
  if (!matchAssign) return;

  if (!matchAssign[positionId]) {
    matchAssign[positionId] = { players: [], date: null };
  }

  // Normalize old array format to new object format
  if (Array.isArray(matchAssign[positionId])) {
    matchAssign[positionId] = { players: matchAssign[positionId], date: null };
  }

  const isDoubles = positionId.startsWith('doubles');
  
  if (isDoubles && matchAssign[positionId].players.length >= 2) {
    return; // Already full
  }
  
  if (!isDoubles && matchAssign[positionId].players.length >= 1) {
    return; // Singles already assigned
  }

  matchAssign[positionId].players.push(playerId);

  await writeEventAndRefresh('assignment_set', {
    matchId,
    positionId,
    playerIds: matchAssign[positionId].players,
    date: matchAssign[positionId].date,
  });

  renderLineupAssignments(matchId);
}

async function unassignPlayer(matchId, positionId, playerId) {
  const matchAssign = assignments.get(matchId);
  if (!matchAssign || !matchAssign[positionId]) return;

  // Normalize old array format to new object format
  if (Array.isArray(matchAssign[positionId])) {
    matchAssign[positionId] = { players: matchAssign[positionId], date: null };
  }

  matchAssign[positionId].players = matchAssign[positionId].players.filter((pId) => pId !== playerId);

  if (matchAssign[positionId].players.length === 0) {
    delete matchAssign[positionId];
    await writeEventAndRefresh('assignment_clear', { matchId, positionId });
  } else {
    await writeEventAndRefresh('assignment_set', {
      matchId,
      positionId,
      playerIds: matchAssign[positionId].players,
      date: matchAssign[positionId].date,
    });
  }

  renderLineupAssignments(matchId);
}

function openPositionTimeModal(matchId, positionId, currentDate) {
  const match = matches.find((m) => m.id === matchId);
  if (!match) return;

  editingPositionMatchId = matchId;
  editingPositionId = positionId;

  const defaultDate = currentDate || match.date;
  const positionLabel = positionId.replace('-', ' ').toUpperCase();
  
  positionTimeModalTitle.textContent = `Set Time for ${positionLabel}`;
  positionTimeModalSubtitle.textContent = `Default: ${formatDateTime(match.date)}`;
  
  positionTimeInput.value = defaultDate || '';
  
  positionTimeModal.classList.add('active');
  positionTimeInput.focus();
}

function closePositionTimeModal() {
  positionTimeModal.classList.remove('active');
  editingPositionMatchId = null;
  editingPositionId = null;
}

async function handlePositionTimeSubmit() {
  if (!editingPositionMatchId || !editingPositionId) return;
  
  const date = positionTimeInput.value.trim();
  
  // If no date entered, use the team match date as default
  if (!date) {
    const match = matches.find((m) => m.id === editingPositionMatchId);
    if (match && match.date) {
      await setPositionTime(editingPositionMatchId, editingPositionId, match.date);
    }
    closePositionTimeModal();
    return;
  }

  await setPositionTime(editingPositionMatchId, editingPositionId, date);
  closePositionTimeModal();
}

async function setPositionTime(matchId, positionId, date) {
  const matchAssign = assignments.get(matchId);
  if (!matchAssign) return;
  
  // Get the match to use as fallback
  const match = matches.find((m) => m.id === matchId);
  if (!match) return;

  // Validate the date - if invalid, use match date
  let validDate = date;
  if (!date || date === 'null' || date === 'undefined') {
    validDate = match.date;
  }

  if (!matchAssign[positionId]) {
    matchAssign[positionId] = { players: [], date: validDate };
  }

  // Normalize old array format to new object format
  if (Array.isArray(matchAssign[positionId])) {
    matchAssign[positionId] = { players: matchAssign[positionId], date: validDate };
  } else {
    matchAssign[positionId].date = validDate;
  }

  await writeEventAndRefresh('position_time_set', {
    matchId,
    positionId,
    date: validDate,
  });

  renderLineupAssignments(matchId);
}

function formatDateTime(dateStr) {
  if (!dateStr || dateStr === 'null' || dateStr === 'undefined') return 'Not set';
  try {
    const date = new Date(dateStr);
    // Check if the date is valid
    if (isNaN(date.getTime())) {
      return 'Not set';
    }
    return date.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch (e) {
    return 'Not set';
  }
}

// ============================================
// PLAYER IMPORT
// ============================================

function openImportModal() {
  importTextarea.value = '';
  importPreview.style.display = 'none';
  confirmImport.style.display = 'none';
  parsedPlayers = [];
  importModal.classList.add('active');
  importTextarea.focus();
}

function closeImportModal() {
  importModal.classList.remove('active');
  parsedPlayers = [];
}

function parseImportData(text) {
  const lines = text.trim().split('\n').filter((line) => line.trim());
  const players = [];

  lines.forEach((line, index) => {
    // Try to detect delimiter (comma or tab)
    const hasComma = line.includes(',');
    const hasTab = line.includes('\t');
    
    let parts;
    if (hasTab) {
      parts = line.split('\t').map((p) => p.trim());
    } else if (hasComma) {
      parts = line.split(',').map((p) => p.trim());
    } else {
      // Single field, assume it's just the name
      parts = [line.trim()];
    }

    const name = parts[0] || '';
    
    // Smart detection: fields 1-3 could be USTA, email, or phone in any order
    let usta = '';
    let email = '';
    let phone = '';
    
    // Check remaining parts and categorize them
    for (let i = 1; i < parts.length; i++) {
      const field = parts[i].trim();
      if (!field) continue;
      
      // Check if it looks like an email (contains @ and .)
      if (field.includes('@') && field.includes('.')) {
        email = field;
      }
      // Check if it looks like a phone number (contains digits and common phone chars)
      else if (/[\d\(\)\-\.\s]/.test(field) && /\d{3,}/.test(field.replace(/\D/g, ''))) {
        phone = field;
      }
      // Otherwise assume it's USTA number (all digits, typically 10 digits)
      else if (/^\d+$/.test(field)) {
        usta = field;
      }
      // If not clearly identifiable, treat as USTA if it's mostly digits
      else if (/\d/.test(field)) {
        if (!usta) usta = field;
      }
    }

    if (name) {
      players.push({
        lineNumber: index + 1,
        name,
        usta,
        email,
        phone,
        valid: true,
        error: null,
      });
    } else {
      players.push({
        lineNumber: index + 1,
        name: '',
        usta: '',
        email: '',
        phone: '',
        valid: false,
        error: 'Name is required',
      });
    }
  });

  return players;
}

function handlePreviewImport() {
  const text = importTextarea.value.trim();
  
  if (!text) {
    alert('Please paste player data first');
    return;
  }

  parsedPlayers = parseImportData(text);
  
  const validPlayers = parsedPlayers.filter((p) => p.valid);
  const invalidPlayers = parsedPlayers.filter((p) => !p.valid);

  previewCount.textContent = validPlayers.length;
  
  let html = '';
  
  if (validPlayers.length > 0) {
    html += '<div class="preview-section">';
    validPlayers.forEach((player) => {
      html += `
        <div class="preview-player valid">
          <div class="preview-player-header">
            <span class="preview-player-name">${escapeHtml(player.name)}</span>
            <span class="preview-line-number">Line ${player.lineNumber}</span>
          </div>
          ${player.usta || player.email || player.phone ? `
            <div class="preview-player-info">
              ${player.usta ? `<span class="preview-badge">USTA: ${escapeHtml(player.usta)}</span>` : ''}
              ${player.email ? `<span class="preview-badge">${escapeHtml(player.email)}</span>` : ''}
              ${player.phone ? `<span class="preview-badge">${escapeHtml(player.phone)}</span>` : ''}
            </div>
          ` : ''}
        </div>
      `;
    });
    html += '</div>';
  }

  if (invalidPlayers.length > 0) {
    html += '<div class="preview-section error-section">';
    html += '<p class="preview-error-title">⚠️ Invalid entries (will be skipped):</p>';
    invalidPlayers.forEach((player) => {
      html += `
        <div class="preview-player invalid">
          <span class="preview-line-number">Line ${player.lineNumber}</span>
          <span class="preview-error">${player.error}</span>
        </div>
      `;
    });
    html += '</div>';
  }

  previewList.innerHTML = html;
  importPreview.style.display = 'block';
  
  if (validPlayers.length > 0) {
    confirmImport.style.display = 'block';
  } else {
    confirmImport.style.display = 'none';
  }
}

async function handleConfirmImport() {
  const validPlayers = parsedPlayers.filter((p) => p.valid);
  
  if (validPlayers.length === 0) {
    return;
  }

  // Disable the import button and show progress
  confirmImport.disabled = true;
  confirmImport.textContent = 'Importing...';

  // Import players one at a time to avoid concurrency issues
  for (let i = 0; i < validPlayers.length; i++) {
    const playerData = validPlayers[i];
    const id = generateId();
    
    // Update button text with progress
    confirmImport.textContent = `Importing... ${i + 1}/${validPlayers.length}`;
    
    // Write event and fetch latest state
    await writeEventAndRefresh('player_added', {
      id,
      name: playerData.name,
      email: playerData.email,
      phone: playerData.phone,
      usta: playerData.usta,
    });
    
    // Wait 500ms to ensure backend processes them sequentially
    if (i < validPlayers.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  // Re-enable button
  confirmImport.disabled = false;
  confirmImport.textContent = 'Import Players';

  closeImportModal();
  
  // Switch to players view and render
  switchView('players');
  renderPlayers(true);

  // Show success message
  alert(`Successfully imported ${validPlayers.length} player${validPlayers.length !== 1 ? 's' : ''}!`);
}

// ============================================
// MATCH IMPORT
// ============================================

function openImportMatchesModal() {
  importMatchesTextarea.value = '';
  importMatchesPreview.style.display = 'none';
  confirmMatchesImport.style.display = 'none';
  parsedMatches = [];
  importMatchesModal.classList.add('active');
  importMatchesTextarea.focus();
}

function closeImportMatchesModal() {
  importMatchesModal.classList.remove('active');
  parsedMatches = [];
}

function parseMatchImportData(text) {
  const lines = text.trim().split('\n').filter((line) => line.trim());
  const matchesParsed = [];
  
  // Check if first line looks like headers (contains "Date" or "Time" or "Location" or "Opponent")
  let startIndex = 0;
  if (lines.length > 0) {
    const firstLine = lines[0].toLowerCase();
    if (firstLine.includes('date') || firstLine.includes('time') || firstLine.includes('location') || firstLine.includes('opponent')) {
      startIndex = 1; // Skip header row
    }
  }

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Try to detect delimiter (comma or tab)
    const hasTab = line.includes('\t');
    
    let parts;
    if (hasTab) {
      parts = line.split('\t').map((p) => p.trim());
    } else {
      parts = line.split(',').map((p) => p.trim());
    }

    const date = parts[0] || '';
    const time = parts[1] || '';
    const location = parts[2] || '';
    const opponent = parts[3] || '';
    const formatStr = parts[4] || ''; // New: format column

    // Parse format string (e.g., "3 Doubles", "2 Singles 2 Doubles", "3S 2D")
    let singles = 0;
    let doubles = 0;
    
    if (formatStr) {
      // Try to match patterns like "3 Doubles", "2 Singles", "3S 2D", etc.
      const singlesMatch = formatStr.match(/(\d+)\s*S(?:ingles)?/i);
      const doublesMatch = formatStr.match(/(\d+)\s*D(?:oubles)?/i);
      
      if (singlesMatch) {
        singles = parseInt(singlesMatch[1]);
      }
      if (doublesMatch) {
        doubles = parseInt(doublesMatch[1]);
      }
      
      // If no explicit singles/doubles found, check for just a number + "Doubles" or "Singles"
      if (singles === 0 && doubles === 0) {
        const justDoublesMatch = formatStr.match(/(\d+)\s+Doubles/i);
        const justSinglesMatch = formatStr.match(/(\d+)\s+Singles/i);
        
        if (justDoublesMatch) {
          doubles = parseInt(justDoublesMatch[1]);
        } else if (justSinglesMatch) {
          singles = parseInt(justSinglesMatch[1]);
        }
      }
    }
    
    // Default to 2 singles + 2 doubles if no format specified
    if (singles === 0 && doubles === 0) {
      singles = 2;
      doubles = 2;
    }

    if (date && opponent) {
      // Try to parse and combine date and time
      let dateTime = '';
      try {
        // Parse date (M/D/YYYY or MM/DD/YYYY)
        const dateParts = date.split('/');
        if (dateParts.length === 3) {
          const month = dateParts[0].padStart(2, '0');
          const day = dateParts[1].padStart(2, '0');
          const year = dateParts[2];
          
          // Parse time (H:MM AM/PM or HH:MM AM/PM)
          let hour = 12;
          let minute = 0;
          
          if (time) {
            const timeMatch = time.match(/(\d+):(\d+)\s*(AM|PM)/i);
            if (timeMatch) {
              hour = parseInt(timeMatch[1]);
              minute = parseInt(timeMatch[2]);
              const period = timeMatch[3].toUpperCase();
              
              // Convert to 24-hour format
              if (period === 'PM' && hour !== 12) {
                hour += 12;
              } else if (period === 'AM' && hour === 12) {
                hour = 0;
              }
            }
          }
          
          // Format as datetime-local string (YYYY-MM-DDTHH:MM)
          const hourStr = hour.toString().padStart(2, '0');
          const minuteStr = minute.toString().padStart(2, '0');
          dateTime = `${year}-${month}-${day}T${hourStr}:${minuteStr}`;
        }
      } catch (e) {
        console.error('Failed to parse date/time:', e);
      }

      matchesParsed.push({
        lineNumber: i + 1,
        title: opponent,
        location: location,
        date: dateTime,
        dateDisplay: `${date} ${time}`,
        singles: singles,
        doubles: doubles,
        formatDisplay: formatStr || `${singles} Singles + ${doubles} Doubles`,
        valid: !!dateTime,
        error: dateTime ? null : 'Could not parse date',
      });
    } else {
      matchesParsed.push({
        lineNumber: i + 1,
        title: '',
        location: '',
        date: '',
        dateDisplay: '',
        singles: 0,
        doubles: 0,
        formatDisplay: '',
        valid: false,
        error: 'Date and opponent are required',
      });
    }
  }

  return matchesParsed;
}

function handlePreviewMatchesImport() {
  const text = importMatchesTextarea.value.trim();
  
  if (!text) {
    alert('Please paste match data first');
    return;
  }

  parsedMatches = parseMatchImportData(text);
  
  const validMatches = parsedMatches.filter((m) => m.valid);
  const invalidMatches = parsedMatches.filter((m) => !m.valid);

  previewMatchesCount.textContent = validMatches.length;
  
  let html = '';
  
  if (validMatches.length > 0) {
    html += '<div class="preview-section">';
    validMatches.forEach((match) => {
      html += `
        <div class="preview-player valid">
          <div class="preview-player-header">
            <span class="preview-player-name">${escapeHtml(match.title)}</span>
            <span class="preview-line-number">Line ${match.lineNumber}</span>
          </div>
          <div class="preview-player-info">
            <span class="preview-badge">📅 ${escapeHtml(match.dateDisplay)}</span>
            ${match.location ? `<span class="preview-badge">📍 ${escapeHtml(match.location)}</span>` : ''}
            <span class="preview-badge">🎾 ${escapeHtml(match.formatDisplay)}</span>
          </div>
        </div>
      `;
    });
    html += '</div>';
  }

  if (invalidMatches.length > 0) {
    html += '<div class="preview-section error-section">';
    html += '<p class="preview-error-title">⚠️ Invalid entries (will be skipped):</p>';
    invalidMatches.forEach((match) => {
      html += `
        <div class="preview-player invalid">
          <span class="preview-line-number">Line ${match.lineNumber}</span>
          <span class="preview-error">${match.error}</span>
        </div>
      `;
    });
    html += '</div>';
  }

  previewMatchesList.innerHTML = html;
  importMatchesPreview.style.display = 'block';
  
  if (validMatches.length > 0) {
    confirmMatchesImport.style.display = 'block';
  } else {
    confirmMatchesImport.style.display = 'none';
  }
}

async function handleConfirmMatchesImport() {
  const validMatches = parsedMatches.filter((m) => m.valid);
  
  if (validMatches.length === 0) {
    return;
  }

  // Disable the import button and show progress
  confirmMatchesImport.disabled = true;
  confirmMatchesImport.textContent = 'Importing...';

  // Import matches one at a time
  for (let i = 0; i < validMatches.length; i++) {
    const matchData = validMatches[i];
    const id = generateId();
    
    confirmMatchesImport.textContent = `Importing... ${i + 1}/${validMatches.length}`;
    
    // Write event and fetch latest state
    await writeEventAndRefresh('match_added', {
      id,
      title: matchData.title,
      location: matchData.location,
      date: matchData.date,
      singles: matchData.singles,
      doubles: matchData.doubles,
    });
    
    // Wait 500ms before next match
    if (i < validMatches.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  // Re-enable button
  confirmMatchesImport.disabled = false;
  confirmMatchesImport.textContent = 'Import Matches';

  closeImportMatchesModal();
  
  // Switch to matches view and render
  switchView('matches');
  renderMatches(true);

  alert(`Successfully imported ${validMatches.length} match${validMatches.length !== 1 ? 'es' : ''}!`);
}

// ============================================
// UTILITIES
// ============================================

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================
// POLLING
// ============================================

async function pollForChanges() {
  if (store.getIsSyncing()) return;

  try {
    store.setIsSyncing(true);
    const changelog = await store.loadChangelogFromServer({ silent: true });
    const state = replayChangelog(changelog);
    store.setIsSyncing(false);

    players = state.players;
    matches = state.matches;
    availability = state.availability;
    assignments = state.assignments;

    renderCurrentView();
  } catch (error) {
    store.setIsSyncing(false);
    // eslint-disable-next-line no-console
    console.error('Poll error:', error);
  }
}

// ============================================
// START
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
  await init();
  
  // Handle hash changes for navigation
  window.addEventListener('hashchange', handleHashChange);
  window.addEventListener('popstate', handleHashChange);
  
  // Handle initial hash on load
  handleHashChange();
  
  // Polling disabled - we fetch latest state after every write
  // createPoller(pollForChanges, 5000);
});
