// ============================================
// AUTOCOMPLETE - Shared Autocomplete Module
// A reusable, styleable autocomplete component
// ============================================

// ============================================
// STYLES
// ============================================

let stylesInjected = false;

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;

  const styles = document.createElement('style');
  styles.textContent = `
        .autocomplete-dropdown {
            position: absolute;
            left: 0;
            right: 0;
            background: var(--bg-card, #132337);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
            max-height: 240px;
            overflow-y: auto;
            z-index: 1000;
            opacity: 0;
            transition: opacity 0.15s ease, transform 0.15s ease;
        }

        .autocomplete-dropdown.position-below {
            top: 100%;
            margin-top: 4px;
            transform: translateY(-8px);
        }

        .autocomplete-dropdown.position-above {
            bottom: 100%;
            margin-bottom: 4px;
            transform: translateY(8px);
        }

        .autocomplete-dropdown.open {
            opacity: 1;
            transform: translateY(0);
        }

        .autocomplete-dropdown::-webkit-scrollbar {
            width: 6px;
        }

        .autocomplete-dropdown::-webkit-scrollbar-track {
            background: transparent;
        }

        .autocomplete-dropdown::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.2);
            border-radius: 3px;
        }

        .autocomplete-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px 16px;
            cursor: pointer;
            transition: background 0.1s ease;
            color: var(--text-light, #eef0f2);
            font-family: inherit;
            font-size: 0.95rem;
        }

        .autocomplete-item:first-child {
            border-radius: 12px 12px 0 0;
        }

        .autocomplete-item:last-child {
            border-radius: 0 0 12px 12px;
        }

        .autocomplete-item:only-child {
            border-radius: 12px;
        }

        .autocomplete-item:hover,
        .autocomplete-item.selected {
            background: rgba(255, 255, 255, 0.08);
        }

        .autocomplete-item.selected {
            background: rgba(0, 217, 192, 0.15);
        }

        .autocomplete-text {
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .autocomplete-text mark {
            background: rgba(0, 217, 192, 0.3);
            color: var(--accent-teal, #00d9c0);
            border-radius: 2px;
            padding: 0 2px;
        }

        .autocomplete-count {
            font-size: 0.75rem;
            color: var(--text-muted, #7a8599);
            background: rgba(255, 255, 255, 0.05);
            padding: 2px 6px;
            border-radius: 8px;
            margin-left: 8px;
            flex-shrink: 0;
        }
    `;
  document.head.appendChild(styles);
}

/**
 * Creates an autocomplete dropdown for an input element
 *
 * @param {Object} options
 * @param {HTMLInputElement} options.input - The input element to attach to
 * @param {Function} options.getSuggestions - Returns array of { text: string, count?: number }
 * @param {Function} options.onSelect - Called when a suggestion is selected
 * @param {number} [options.maxSuggestions=10] - Max suggestions to show
 * @param {number} [options.minChars=1] - Min chars before showing suggestions
 * @param {boolean} [options.showCount=false] - Show frequency count badge
 * @param {string} [options.position='above'] - 'above' or 'below' the input
 *
 * @returns {Object} Autocomplete instance with update() and destroy() methods
 */
// eslint-disable-next-line import/prefer-default-export
export function createAutocomplete(options) {
  const {
    input,
    getSuggestions,
    onSelect,
    maxSuggestions = 10,
    minChars = 1,
    showCount = false,
    position = 'above',
  } = options;

  // Inject styles once
  injectStyles();

  // Create dropdown container
  const dropdown = document.createElement('div');
  dropdown.className = `autocomplete-dropdown ${position === 'above' ? 'position-above' : 'position-below'}`;
  dropdown.setAttribute('role', 'listbox');
  dropdown.style.display = 'none';

  // Position dropdown relative to input's parent
  const wrapper = input.parentElement;
  wrapper.style.position = 'relative';
  wrapper.appendChild(dropdown);

  let selectedIndex = -1;
  let currentSuggestions = [];
  let isOpen = false;

  // Helper functions - defined first
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function highlightMatch(text, query) {
    if (!query) return escapeHtml(text);

    const lowerText = text.toLowerCase();
    const matchIndex = lowerText.indexOf(query);

    if (matchIndex === -1) return escapeHtml(text);

    const before = text.slice(0, matchIndex);
    const match = text.slice(matchIndex, matchIndex + query.length);
    const after = text.slice(matchIndex + query.length);

    return `${escapeHtml(before)}<mark>${escapeHtml(match)}</mark>${escapeHtml(after)}`;
  }

  function open() {
    if (!isOpen) {
      dropdown.style.display = 'block';
      isOpen = true;
      requestAnimationFrame(() => {
        dropdown.classList.add('open');
      });
    }
  }

  function close() {
    if (isOpen) {
      dropdown.classList.remove('open');
      dropdown.style.display = 'none';
      isOpen = false;
      selectedIndex = -1;
      currentSuggestions = [];
    }
  }

  function updateSelection() {
    dropdown.querySelectorAll('.autocomplete-item').forEach((el, index) => {
      el.classList.toggle('selected', index === selectedIndex);
      el.setAttribute('aria-selected', index === selectedIndex);
    });

    // Scroll selected item into view
    const selectedEl = dropdown.querySelector('.autocomplete-item.selected');
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: 'nearest' });
    }
  }

  function selectItem(index) {
    const item = currentSuggestions[index];
    if (item) {
      input.value = item.text;
      onSelect(item);
      close();
    }
  }

  function renderDropdown(query) {
    const html = currentSuggestions.map((item, index) => {
      const highlighted = highlightMatch(item.text, query);
      const countBadge = showCount && item.count > 1
        ? `<span class="autocomplete-count">${item.count}×</span>`
        : '';

      return `
                <div class="autocomplete-item${index === selectedIndex ? ' selected' : ''}" 
                     data-index="${index}"
                     role="option"
                     aria-selected="${index === selectedIndex}">
                    <span class="autocomplete-text">${highlighted}</span>
                    ${countBadge}
                </div>
            `;
    }).join('');

    dropdown.innerHTML = html;

    // Add click listeners
    dropdown.querySelectorAll('.autocomplete-item').forEach((el) => {
      el.addEventListener('mousedown', (e) => {
        e.preventDefault(); // Prevent input blur
        const index = parseInt(el.dataset.index, 10);
        selectItem(index);
      });

      el.addEventListener('mouseenter', () => {
        selectedIndex = parseInt(el.dataset.index, 10);
        updateSelection();
      });
    });
  }

  // Filter and render suggestions
  function updateSuggestions() {
    const query = input.value.trim().toLowerCase();

    if (query.length < minChars) {
      close();
      return;
    }

    const allSuggestions = getSuggestions();

    // Filter by query and limit
    currentSuggestions = allSuggestions
      .filter((item) => item.text.toLowerCase().includes(query))
      .slice(0, maxSuggestions);

    if (currentSuggestions.length === 0) {
      close();
      return;
    }

    // When position is 'above', reverse so most frequent is at bottom (closest to input)
    if (position === 'above') {
      currentSuggestions = currentSuggestions.reverse();
    }

    renderDropdown(query);
    open();
  }

  // Event handlers
  function handleInput() {
    selectedIndex = -1;
    updateSuggestions();
  }

  function handleKeyDown(e) {
    if (!isOpen) {
      // Open dropdown with appropriate arrow key based on position
      const openKey = position === 'above' ? 'ArrowUp' : 'ArrowDown';
      if (e.key === openKey && input.value.trim().length >= minChars) {
        updateSuggestions();
        // Select the item closest to input (bottom for above, top for below)
        if (currentSuggestions.length > 0) {
          selectedIndex = position === 'above'
            ? currentSuggestions.length - 1 // Bottom item (closest to input)
            : 0; // Top item (closest to input)
          updateSelection();
        }
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (selectedIndex === -1) {
          // Nothing selected yet - start from top for below, bottom for above
          selectedIndex = position === 'above' ? currentSuggestions.length - 1 : 0;
        } else {
          // Move down visually (toward higher index)
          selectedIndex = Math.min(selectedIndex + 1, currentSuggestions.length - 1);
        }
        updateSelection();
        break;

      case 'ArrowUp':
        e.preventDefault();
        if (selectedIndex === -1) {
          // Nothing selected yet - start from bottom (closest to input when above)
          selectedIndex = position === 'above'
            ? currentSuggestions.length - 1 // Bottom item
            : 0; // Top item
        } else {
          // Move up visually (toward lower index)
          selectedIndex = Math.max(selectedIndex - 1, 0);
        }
        updateSelection();
        break;

      case 'Enter':
        if (selectedIndex >= 0) {
          e.preventDefault();
          selectItem(selectedIndex);
        }
        break;

      case 'Escape':
        e.preventDefault();
        close();
        break;

      case 'Tab':
        close();
        break;

      default:
        break;
    }
  }

  function handleBlur() {
    // Small delay to allow click events on dropdown items
    setTimeout(close, 150);
  }

  function handleFocus() {
    if (input.value.trim().length >= minChars) {
      updateSuggestions();
    }
  }

  // Attach event listeners
  input.addEventListener('input', handleInput);
  input.addEventListener('keydown', handleKeyDown);
  input.addEventListener('blur', handleBlur);
  input.addEventListener('focus', handleFocus);

  // Remove the datalist attribute if present
  input.removeAttribute('list');

  // Public API
  return {
    update: updateSuggestions,
    close,
    destroy() {
      input.removeEventListener('input', handleInput);
      input.removeEventListener('keydown', handleKeyDown);
      input.removeEventListener('blur', handleBlur);
      input.removeEventListener('focus', handleFocus);
      dropdown.remove();
    },
  };
}
