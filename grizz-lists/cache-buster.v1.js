// ============================================
// CACHE BUSTER - Performance Observer Module
// Tracks loaded resources and busts cache on reload
// ============================================

/**
 * CacheBuster Module
 *
 * Uses PerformanceObserver to track all resources loaded by the page.
 * On reload (including mobile pull-to-refresh), ensures fresh resources.
 *
 * Strategies used:
 * 1. Service Worker (primary) - intercepts all fetches with cache: 'reload'
 * 2. pagehide - bust cache on page hide (bfcache-friendly, works everywhere)
 * 3. visibilitychange - bust cache when app goes to background (mobile/PWA)
 *
 * Note: We avoid beforeunload as it prevents bfcache.
 */

const CACHE_BUST_FLAG = 'cacheBuster_triggered';
const CACHE_BUST_TIME = 'cacheBuster_timestamp';

// Capture script element - document.currentScript is null for ES modules
// So we find it by searching for our script tag
let scriptElement = null;
let scriptSrc = null;

if (typeof document !== 'undefined') {
  // For ES modules, we need to find the script by its src
  // import.meta.url gives us the URL of this module
  const moduleUrl = import.meta.url;
  scriptSrc = moduleUrl;

  // Find the script element that loaded this module
  const scripts = Array.from(document.querySelectorAll('script[type="module"]'));
  scriptElement = scripts.find((script) => script.src
    && moduleUrl.includes(script.src.split('?')[0].split('/').pop()));

  // Fallback: try matching by filename
  if (!scriptElement) {
    const filename = moduleUrl.split('/').pop().split('?')[0];
    scriptElement = scripts.find((script) => script.src && script.src.includes(filename));
  }
}

class CacheBuster {
  constructor(options = {}) {
    this.options = {
      // Resource types to track
      resourceTypes: options.resourceTypes || ['script', 'link', 'fetch', 'xmlhttprequest', 'img', 'css', 'font'],
      // Only track same-origin resources by default
      sameOriginOnly: options.sameOriginOnly ?? true,
      // Enable keyboard shortcut (Ctrl/Cmd + Shift + B)
      enableKeyboardShortcut: options.enableKeyboardShortcut ?? true,
      // Enable service worker for reliable mobile support
      useServiceWorker: options.useServiceWorker ?? true,
      // Path to service worker file (relative to page)
      serviceWorkerPath: options.serviceWorkerPath || null, // Auto-detected
      // Log activity to console
      debug: options.debug ?? false,
      // Patterns to exclude (regex strings)
      excludePatterns: options.excludePatterns || [],
      // Show visual indicator after cache bust reload
      showVisualIndicator: options.showVisualIndicator ?? true,
      ...options,
    };

    this.trackedResources = new Set();
    this.observer = null;
    this.isInitialized = false;
    this.reloadPending = false;
    this.serviceWorkerRegistration = null;

    // Bind methods
    this.handlePageHide = this.handlePageHide.bind(this);
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handlePerformanceEntry = this.handlePerformanceEntry.bind(this);
  }

  /**
     * Initialize the cache buster
     */
  async init() {
    if (this.isInitialized) {
      this.log('Already initialized');
      return this;
    }

    this.log('Initializing CacheBuster...');

    // Register service worker for reliable mobile support
    if (this.options.useServiceWorker) {
      await this.registerServiceWorker();
    }

    // Track existing resources from performance timeline
    this.trackExistingResources();

    // Start observing new resources
    this.startObserving();

    // Listen for page lifecycle events
    // pagehide - fires on navigation/reload, doesn't block bfcache
    window.addEventListener('pagehide', this.handlePageHide);

    // visibilitychange - fires when user switches tabs/apps (good for PWAs)
    document.addEventListener('visibilitychange', this.handleVisibilityChange);

    // Optional keyboard shortcut
    if (this.options.enableKeyboardShortcut) {
      window.addEventListener('keydown', this.handleKeyDown);
    }

    this.isInitialized = true;
    this.log(`Initialized. Tracking ${this.trackedResources.size} existing resources.`);

    // Check if we just came from a cache bust reload
    if (this.options.showVisualIndicator) {
      this.checkAndShowIndicator();
    }

    return this;
  }

  /**
     * Destroy the cache buster and clean up
     */
  destroy() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    window.removeEventListener('pagehide', this.handlePageHide);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    window.removeEventListener('keydown', this.handleKeyDown);

    this.trackedResources.clear();
    this.isInitialized = false;
    this.log('Destroyed');
  }

  /**
     * Get all tracked resource URLs
     */
  getTrackedResources() {
    return [...this.trackedResources];
  }

  /**
     * Manually bust cache for all tracked resources
     * Returns a promise that resolves when all fetches complete
     */
  async bustCache() {
    const resources = this.getTrackedResources();
    this.log(`Busting cache for ${resources.length} resources...`);

    // Set flag for visual indicator on next load
    this.setIndicatorFlag();

    // Also tell service worker to clear its cache
    if (this.serviceWorkerRegistration?.active) {
      this.serviceWorkerRegistration.active.postMessage('bustCache');
    }

    const results = await Promise.allSettled(
      resources.map((url) => this.bustCacheForUrl(url)),
    );

    const successful = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    this.log(`Cache bust complete: ${successful} succeeded, ${failed} failed`);

    return { successful, failed, total: resources.length };
  }

  /**
     * Bust cache and then reload the page
     */
  async bustCacheAndReload() {
    this.reloadPending = true;
    await this.bustCache();
    window.location.reload();
  }

  /**
     * Trigger a hard reload with cache busting
     * Uses the cache-busting approach before reloading
     */
  hardReload() {
    this.reloadPending = true;
    this.bustCacheAsync();
    window.location.href = this.addCacheBustParam(window.location.href);
  }

  // ============================================
  // Private Methods
  // ============================================

  log(...args) {
    if (this.options.debug) {
      // eslint-disable-next-line no-console
      console.log('[CacheBuster]', ...args);
    }
  }

  async registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
      this.log('Service Workers not supported');
      return;
    }

    try {
      // Determine service worker path
      let swPath = this.options.serviceWorkerPath;

      if (!swPath) {
        // Auto-detect: service worker should be at same level as cache-buster.js
        if (scriptSrc) {
          const scriptUrl = new URL(scriptSrc);
          swPath = scriptUrl.pathname.replace(/cache-buster\.v\d+\.js/, 'cache-buster-sw.v1.js');
        } else {
          // Fallback: assume it's in the same directory as the page
          swPath = './cache-buster-sw.v1.js';
        }
      }

      this.log(`Registering service worker: ${swPath}`);

      this.serviceWorkerRegistration = await navigator.serviceWorker.register(swPath, {
        scope: './',
      });

      this.log('Service worker registered:', this.serviceWorkerRegistration.scope);

      // Listen for messages from service worker
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'cacheBusted') {
          this.log('Service worker confirmed cache bust');
        }
      });
    } catch (error) {
      this.log('Service worker registration failed:', error);
    }
  }

  trackExistingResources() {
    // Get all resource entries from performance timeline
    const entries = performance.getEntriesByType('resource');
    entries.forEach((entry) => this.processResourceEntry(entry));
  }

  startObserving() {
    if (!window.PerformanceObserver) {
      this.log('PerformanceObserver not supported');
      return;
    }

    try {
      this.observer = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => this.handlePerformanceEntry(entry));
      });

      this.observer.observe({
        entryTypes: ['resource'],
        buffered: false,
      });

      this.log('PerformanceObserver started');
    } catch (error) {
      this.log('Failed to start PerformanceObserver:', error);
    }
  }

  handlePerformanceEntry(entry) {
    this.processResourceEntry(entry);
  }

  processResourceEntry(entry) {
    const url = entry.name;

    // Filter by initiator type
    if (this.options.resourceTypes.length > 0) {
      if (!this.options.resourceTypes.includes(entry.initiatorType)) {
        return;
      }
    }

    // Filter same-origin if enabled
    if (this.options.sameOriginOnly) {
      try {
        const resourceOrigin = new URL(url).origin;
        if (resourceOrigin !== window.location.origin) {
          return;
        }
      } catch {
        return; // Invalid URL
      }
    }

    // Check exclude patterns
    const isExcluded = this.options.excludePatterns.some((pattern) => {
      const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
      return regex.test(url);
    });
    if (isExcluded) {
      return;
    }

    // Track the resource
    if (!this.trackedResources.has(url)) {
      this.trackedResources.add(url);
      this.log(`Tracked: ${entry.initiatorType} - ${url}`);
    }
  }

  handlePageHide(event) {
    // Mobile Safari: fires on navigation/reload
    // event.persisted indicates if page might be restored from bfcache
    this.log('pagehide fired, persisted:', event.persisted);

    if (this.trackedResources.size > 0) {
      this.bustCacheAsync();
    }
  }

  handleVisibilityChange() {
    // Mobile: fires when switching apps/tabs
    if (document.visibilityState === 'hidden') {
      this.log('Page hidden, busting cache proactively');

      if (this.trackedResources.size > 0) {
        this.bustCacheAsync();
      }
    }
  }

  handleKeyDown(event) {
    // Ctrl/Cmd + Shift + B = Bust cache and reload
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const modifierKey = isMac ? event.metaKey : event.ctrlKey;

    if (modifierKey && event.shiftKey && event.key.toLowerCase() === 'b') {
      event.preventDefault();
      this.log('Keyboard shortcut triggered');
      this.bustCacheAndReload();
    }
  }

  /**
     * Fire-and-forget cache busting with keepalive
     * Used in beforeunload/pagehide where we can't await
     */
  bustCacheAsync() {
    const resources = this.getTrackedResources();
    this.log(`Async cache bust for ${resources.length} resources`);

    // Set flag for visual indicator on next load
    this.setIndicatorFlag();

    // Tell service worker to clear cache
    if (this.serviceWorkerRegistration?.active) {
      this.serviceWorkerRegistration.active.postMessage('bustCache');
    }

    resources.forEach((url) => {
      try {
        // Using keepalive allows fetch to continue after page unload
        fetch(url, {
          method: 'GET',
          cache: 'reload',
          keepalive: true,
          mode: 'no-cors',
          credentials: 'same-origin',
        }).catch(() => {
          // Ignore errors during unload
        });
      } catch {
        // Ignore errors
      }
    });
  }

  async bustCacheForUrl(url) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        cache: 'reload',
        mode: 'no-cors',
        credentials: 'same-origin',
      });

      // Consume the body to complete the fetch
      if (response.body) {
        const reader = response.body.getReader();
        let done = false;
        while (!done) {
          // eslint-disable-next-line no-await-in-loop
          ({ done } = await reader.read());
        }
      }

      return { url, success: true };
    } catch (error) {
      this.log(`Failed to bust cache for ${url}:`, error);
      throw error;
    }
  }

  // eslint-disable-next-line class-methods-use-this
  addCacheBustParam(url) {
    const urlObj = new URL(url);
    urlObj.searchParams.set('_cb', Date.now().toString(36));
    return urlObj.toString();
  }

  /**
     * Set a flag to show visual indicator on next page load
     */
  // eslint-disable-next-line class-methods-use-this
  setIndicatorFlag() {
    try {
      sessionStorage.setItem(CACHE_BUST_FLAG, 'true');
      sessionStorage.setItem(CACHE_BUST_TIME, Date.now().toString());
    } catch {
      // sessionStorage might be unavailable
    }
  }

  /**
     * Check for indicator flag and show animation if present
     */
  checkAndShowIndicator() {
    try {
      const wasBusted = sessionStorage.getItem(CACHE_BUST_FLAG);
      const bustTime = sessionStorage.getItem(CACHE_BUST_TIME);

      if (wasBusted) {
        // Clear the flag immediately
        sessionStorage.removeItem(CACHE_BUST_FLAG);
        sessionStorage.removeItem(CACHE_BUST_TIME);

        // Only show if bust was recent (within 10 seconds)
        const elapsed = Date.now() - parseInt(bustTime || '0', 10);
        if (elapsed < 10000) {
          this.showVisualIndicator();
        }
      }
    } catch {
      // sessionStorage might be unavailable
    }
  }

  /**
     * Show a visual indicator that cache was busted
     */
  // eslint-disable-next-line class-methods-use-this
  showVisualIndicator() {
    // Inject styles if not already present
    if (!document.getElementById('cache-buster-styles')) {
      const style = document.createElement('style');
      style.id = 'cache-buster-styles';
      style.textContent = `
                @keyframes cacheBustSweep {
                    0% {
                        transform: translateX(-100%);
                        opacity: 1;
                    }
                    50% {
                        opacity: 1;
                    }
                    100% {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                }
                
                @keyframes cacheBustPulse {
                    0%, 100% {
                        box-shadow: inset 0 0 0 2px rgba(0, 217, 192, 0);
                    }
                    50% {
                        box-shadow: inset 0 0 0 2px rgba(0, 217, 192, 0.5);
                    }
                }
                
                .cache-bust-indicator {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    height: 3px;
                    z-index: 999999;
                    overflow: hidden;
                    pointer-events: none;
                }
                
                .cache-bust-indicator::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    height: 100%;
                    background: linear-gradient(
                        90deg,
                        transparent,
                        rgba(0, 217, 192, 0.8),
                        rgba(56, 189, 248, 0.8),
                        rgba(0, 217, 192, 0.8),
                        transparent
                    );
                    animation: cacheBustSweep 0.8s ease-out forwards;
                }
                
                .cache-bust-toast {
                    position: fixed;
                    top: 16px;
                    left: 50%;
                    transform: translateX(-50%) translateY(-100%);
                    background: linear-gradient(135deg, #132337 0%, #1a2f47 100%);
                    color: #00d9c0;
                    padding: 10px 20px;
                    border-radius: 24px;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    font-size: 13px;
                    font-weight: 500;
                    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(0, 217, 192, 0.2);
                    z-index: 999999;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    opacity: 0;
                    animation: toastIn 0.4s ease-out 0.1s forwards, toastOut 0.3s ease-in 2s forwards;
                }
                
                @keyframes toastIn {
                    to {
                        transform: translateX(-50%) translateY(0);
                        opacity: 1;
                    }
                }
                
                @keyframes toastOut {
                    to {
                        transform: translateX(-50%) translateY(-20px);
                        opacity: 0;
                    }
                }
                
                .cache-bust-toast svg {
                    width: 16px;
                    height: 16px;
                }
            `;
      document.head.appendChild(style);
    }

    // Create sweep indicator
    const indicator = document.createElement('div');
    indicator.className = 'cache-bust-indicator';
    document.body.appendChild(indicator);

    // Create toast notification
    const toast = document.createElement('div');
    toast.className = 'cache-bust-toast';
    toast.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" 
                      stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Fresh reload ✓
        `;
    document.body.appendChild(toast);

    // Clean up after animations
    setTimeout(() => {
      indicator.remove();
    }, 1000);

    setTimeout(() => {
      toast.remove();
    }, 2500);
  }
}

// ============================================
// Factory & Singleton
// ============================================

let defaultInstance = null;

/**
 * Create a new CacheBuster instance
 */
export function createCacheBuster(options) {
  return new CacheBuster(options);
}

/**
 * Get or create the default singleton instance
 */
export function getCacheBuster(options) {
  if (!defaultInstance) {
    defaultInstance = new CacheBuster(options);
  }
  return defaultInstance;
}

/**
 * Initialize the default cache buster
 * Convenience function for quick setup
 */
export function initCacheBuster(options) {
  return getCacheBuster(options).init();
}

/**
 * Bust cache for all tracked resources
 * Uses the default singleton instance
 */
export async function bustCache() {
  const instance = getCacheBuster();
  if (!instance.isInitialized) {
    await instance.init();
  }
  return instance.bustCache();
}

/**
 * Get all tracked resources from default instance
 */
export function getTrackedResources() {
  return getCacheBuster().getTrackedResources();
}

// Export the class for custom instantiation
export { CacheBuster };

// ============================================
// Auto-init for script tag usage
// ============================================

// Check for auto-init data attribute
if (typeof document !== 'undefined' && scriptElement?.hasAttribute('data-auto-init')) {
  const debug = scriptElement.hasAttribute('data-debug');
  const showVisualIndicator = !scriptElement.hasAttribute('data-no-indicator');
  initCacheBuster({ debug, showVisualIndicator });
}
