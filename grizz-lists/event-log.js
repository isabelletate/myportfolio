// ============================================
// EVENT LOG VIEWER
// Shows all events from the changelog in a modal table
// Dynamically imported when Ctrl+Shift+E is pressed
// ============================================

let eventLogModal = null;

function createEventLogModal() {
  if (eventLogModal) return eventLogModal;

  const modal = document.createElement('div');
  modal.id = 'eventLogModal';
  modal.innerHTML = `
        <div class="event-log-overlay"></div>
        <div class="event-log-content">
            <div class="event-log-header">
                <h2>📋 Event Log</h2>
                <div class="event-log-actions">
                    <button class="event-log-copy-btn" title="Copy as JSON">📋 Copy JSON</button>
                    <button class="event-log-close-btn" title="Close (Esc)">✕</button>
                </div>
            </div>
            <div class="event-log-stats"></div>
            <div class="event-log-table-wrapper">
                <table class="event-log-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Timestamp</th>
                            <th>Operation</th>
                            <th>ID</th>
                            <th>User</th>
                            <th>Details</th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                </table>
            </div>
        </div>
    `;

  // Add styles
  const style = document.createElement('style');
  style.textContent = `
        #eventLogModal {
            display: none;
            position: fixed;
            inset: 0;
            z-index: 100000;
        }
        #eventLogModal.open {
            display: block;
        }
        .event-log-overlay {
            position: absolute;
            inset: 0;
            background: rgba(0, 0, 0, 0.7);
            backdrop-filter: blur(4px);
        }
        .event-log-content {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 95%;
            max-width: 1200px;
            max-height: 90vh;
            background: #1a1a2e;
            border-radius: 12px;
            display: flex;
            flex-direction: column;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
            border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .event-log-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 16px 20px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        .event-log-header h2 {
            margin: 0;
            font-size: 18px;
            font-weight: 600;
            color: #fff;
        }
        .event-log-actions {
            display: flex;
            gap: 8px;
        }
        .event-log-copy-btn,
        .event-log-close-btn {
            background: rgba(255, 255, 255, 0.1);
            border: none;
            color: #fff;
            padding: 8px 12px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            transition: background 0.2s;
        }
        .event-log-copy-btn:hover,
        .event-log-close-btn:hover {
            background: rgba(255, 255, 255, 0.2);
        }
        .event-log-stats {
            padding: 12px 20px;
            background: rgba(255, 255, 255, 0.05);
            color: #888;
            font-size: 13px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        .event-log-table-wrapper {
            flex: 1;
            overflow: auto;
            padding: 0;
        }
        .event-log-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 13px;
            font-family: 'SF Mono', Menlo, Monaco, 'Courier New', monospace;
        }
        .event-log-table th {
            position: sticky;
            top: 0;
            background: #16162a;
            color: #888;
            font-weight: 500;
            text-align: left;
            padding: 10px 12px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            white-space: nowrap;
        }
        .event-log-table td {
            padding: 8px 12px;
            color: #ddd;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            vertical-align: top;
        }
        .event-log-table tr:hover td {
            background: rgba(255, 255, 255, 0.03);
        }
        .event-log-table .row-num {
            color: #555;
            text-align: right;
        }
        .event-log-table .ts {
            color: #6ee7b7;
            white-space: nowrap;
            font-size: 11px;
        }
        .event-log-table .op {
            font-weight: 600;
        }
        .event-log-table .op-added { color: #4ade80; }
        .event-log-table .op-removed { color: #f87171; }
        .event-log-table .op-updated { color: #60a5fa; }
        .event-log-table .op-checked, .event-log-table .op-completed { color: #a78bfa; }
        .event-log-table .op-unchecked, .event-log-table .op-uncompleted { color: #fbbf24; }
        .event-log-table .op-reorder { color: #f472b6; }
        .event-log-table .op-list_init { color: #22d3ee; }
        .event-log-table .op-list_renamed { color: #818cf8; }
        .event-log-table .op-status_changed { color: #fb923c; }
        .event-log-table .item-id {
            color: #888;
            font-size: 11px;
        }
        .event-log-table .user {
            color: #94a3b8;
            max-width: 150px;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .event-log-table .details {
            color: #9ca3af;
            max-width: 400px;
            word-break: break-word;
            font-size: 11px;
        }
        .event-log-table .details-key {
            color: #60a5fa;
        }
        .event-log-empty {
            text-align: center;
            padding: 40px 20px;
            color: #666;
        }
        @media (max-width: 768px) {
            .event-log-content {
                width: 100%;
                max-width: none;
                max-height: 100vh;
                border-radius: 0;
            }
            .event-log-table {
                font-size: 11px;
            }
        }
    `;

  document.head.appendChild(style);
  document.body.appendChild(modal);

  eventLogModal = modal;
  return modal;
}

function formatEventDetails(event) {
  const excludeKeys = ['op', 'ts', 'timeStamp', 'id', 'user', 'postPromise'];
  const details = [];

  Object.entries(event)
    .filter(([key, value]) => !excludeKeys.includes(key)
      && value !== undefined
      && value !== null
      && value !== '')
    .forEach(([key, value]) => {
      let displayValue = value;
      if (typeof value === 'object') {
        try {
          displayValue = JSON.stringify(value);
          if (displayValue.length > 100) {
            displayValue = `${displayValue.substring(0, 100)}...`;
          }
        } catch {
          displayValue = '[object]';
        }
      } else if (typeof value === 'string' && value.length > 100) {
        displayValue = `${value.substring(0, 100)}...`;
      }
      details.push(`<span class="details-key">${key}</span>: ${displayValue}`);
    });

  return details.join(', ') || '—';
}

function formatTimestamp(ts) {
  if (!ts) return '—';
  try {
    const date = new Date(ts);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return ts;
  }
}

function populateEventLog(getCacheFn) {
  if (!eventLogModal || !getCacheFn) return;

  const events = getCacheFn();
  const sortedEvents = [...events].sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));

  const tbody = eventLogModal.querySelector('.event-log-table tbody');
  const stats = eventLogModal.querySelector('.event-log-stats');

  // Calculate stats
  const opCounts = {};
  events.forEach((event) => {
    opCounts[event.op] = (opCounts[event.op] || 0) + 1;
  });
  const opSummary = Object.entries(opCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([op, count]) => `${op}: ${count}`)
    .join(' · ');

  stats.textContent = `${events.length} events total${opSummary ? ` · ${opSummary}` : ''}`;

  if (sortedEvents.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="event-log-empty">No events recorded yet</td></tr>';
    return;
  }

  tbody.innerHTML = sortedEvents.map((event, idx) => `
        <tr>
            <td class="row-num">${sortedEvents.length - idx}</td>
            <td class="ts">${formatTimestamp(event.ts)}</td>
            <td class="op op-${event.op}">${event.op}</td>
            <td class="item-id">${event.id ?? '—'}</td>
            <td class="user" title="${event.user || ''}">${event.user || '—'}</td>
            <td class="details">${formatEventDetails(event)}</td>
        </tr>
    `).join('');
}

function copyEventLogAsJson(getCacheFn) {
  if (!getCacheFn) return;

  const events = getCacheFn();
  const json = JSON.stringify(events, null, 2);

  navigator.clipboard.writeText(json).then(() => {
    const btn = eventLogModal.querySelector('.event-log-copy-btn');
    const originalText = btn.textContent;
    btn.textContent = '✓ Copied!';
    setTimeout(() => {
      btn.textContent = originalText;
    }, 2000);
  });
}

// Store reference to getCacheFn for event handlers
let currentGetCacheFn = null;

// Track if listeners have been attached to the modal
let listenersAttached = false;

export function closeEventLog() {
  if (eventLogModal) {
    eventLogModal.classList.remove('open');
    document.body.style.overflow = '';
  }
}

export function openEventLog(getCacheFn) {
  currentGetCacheFn = getCacheFn;
  const modal = createEventLogModal();

  // Set up event listeners (only once)
  if (!listenersAttached) {
    modal.querySelector('.event-log-overlay').addEventListener('click', closeEventLog);
    modal.querySelector('.event-log-close-btn').addEventListener('click', closeEventLog);
    modal.querySelector('.event-log-copy-btn').addEventListener('click', () => {
      copyEventLogAsJson(currentGetCacheFn);
    });
    listenersAttached = true;
  }

  populateEventLog(getCacheFn);
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

export function isOpen() {
  return eventLogModal?.classList.contains('open') ?? false;
}
