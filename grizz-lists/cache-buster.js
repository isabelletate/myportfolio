// ============================================
// CACHE BUSTER - Performance Observer Module
// Tracks loaded resources and busts cache on reload
// ============================================

/**
 * CacheBuster Module
 * 
 * Uses PerformanceObserver to track all resources loaded by the page.
 * On explicit reload, attempts to bust the cache for all tracked resources
 * using fetch with { cache: 'reload' }.
 * 
 * Note: Intercepting a pending reload is limited by browser security.
 * We use beforeunload + keepalive fetches for best-effort cache busting.
 */

class CacheBuster {
    constructor(options = {}) {
        this.options = {
            // Resource types to track
            resourceTypes: options.resourceTypes || ['script', 'link', 'fetch', 'xmlhttprequest', 'img', 'css', 'font'],
            // Only track same-origin resources by default
            sameOriginOnly: options.sameOriginOnly ?? true,
            // Enable keyboard shortcut (Ctrl/Cmd + Shift + B)
            enableKeyboardShortcut: options.enableKeyboardShortcut ?? true,
            // Log activity to console
            debug: options.debug ?? false,
            // Patterns to exclude (regex strings)
            excludePatterns: options.excludePatterns || [],
            ...options
        };

        this.trackedResources = new Set();
        this.observer = null;
        this.isInitialized = false;
        this.reloadPending = false;
        
        // Bind methods
        this._handleBeforeUnload = this._handleBeforeUnload.bind(this);
        this._handleKeyDown = this._handleKeyDown.bind(this);
        this._handlePerformanceEntry = this._handlePerformanceEntry.bind(this);
    }

    /**
     * Initialize the cache buster
     */
    init() {
        if (this.isInitialized) {
            this._log('Already initialized');
            return this;
        }

        this._log('Initializing CacheBuster...');

        // Track existing resources from performance timeline
        this._trackExistingResources();

        // Start observing new resources
        this._startObserving();

        // Listen for reload events
        window.addEventListener('beforeunload', this._handleBeforeUnload);

        // Optional keyboard shortcut
        if (this.options.enableKeyboardShortcut) {
            window.addEventListener('keydown', this._handleKeyDown);
        }

        this.isInitialized = true;
        this._log(`Initialized. Tracking ${this.trackedResources.size} existing resources.`);

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

        window.removeEventListener('beforeunload', this._handleBeforeUnload);
        window.removeEventListener('keydown', this._handleKeyDown);

        this.trackedResources.clear();
        this.isInitialized = false;
        this._log('Destroyed');
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
        this._log(`Busting cache for ${resources.length} resources...`);

        const results = await Promise.allSettled(
            resources.map(url => this._bustCacheForUrl(url))
        );

        const successful = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected').length;

        this._log(`Cache bust complete: ${successful} succeeded, ${failed} failed`);

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
        this._bustCacheAsync();
        // Use location.reload(true) for deprecated hard reload
        // or navigate to same URL with cache-busting query
        window.location.href = this._addCacheBustParam(window.location.href);
    }

    // ============================================
    // Private Methods
    // ============================================

    _log(...args) {
        if (this.options.debug) {
            console.log('[CacheBuster]', ...args);
        }
    }

    _trackExistingResources() {
        // Get all resource entries from performance timeline
        const entries = performance.getEntriesByType('resource');
        
        for (const entry of entries) {
            this._processResourceEntry(entry);
        }
    }

    _startObserving() {
        if (!window.PerformanceObserver) {
            this._log('PerformanceObserver not supported');
            return;
        }

        try {
            this.observer = new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                    this._handlePerformanceEntry(entry);
                }
            });

            this.observer.observe({ 
                entryTypes: ['resource'],
                buffered: false 
            });

            this._log('PerformanceObserver started');
        } catch (error) {
            this._log('Failed to start PerformanceObserver:', error);
        }
    }

    _handlePerformanceEntry(entry) {
        this._processResourceEntry(entry);
    }

    _processResourceEntry(entry) {
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
        for (const pattern of this.options.excludePatterns) {
            const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
            if (regex.test(url)) {
                return;
            }
        }

        // Track the resource
        if (!this.trackedResources.has(url)) {
            this.trackedResources.add(url);
            this._log(`Tracked: ${entry.initiatorType} - ${url}`);
        }
    }

    _handleBeforeUnload(event) {
        // Detect if this is a reload (vs navigation away)
        // Note: We can't reliably distinguish reload from close/navigate
        // but we can use keepalive fetches that will continue after unload
        
        if (this.trackedResources.size > 0) {
            this._bustCacheAsync();
        }
    }

    _handleKeyDown(event) {
        // Ctrl/Cmd + Shift + B = Bust cache and reload
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        const modifierKey = isMac ? event.metaKey : event.ctrlKey;

        if (modifierKey && event.shiftKey && event.key.toLowerCase() === 'b') {
            event.preventDefault();
            this._log('Keyboard shortcut triggered');
            this.bustCacheAndReload();
        }

        // Intercept Ctrl/Cmd + R for cache-busted reload
        if (modifierKey && !event.shiftKey && event.key.toLowerCase() === 'r') {
            // Let browser handle Ctrl+Shift+R (hard reload)
            // For plain Ctrl+R, we can optionally bust cache first
            // Uncomment below to intercept all reloads:
            // event.preventDefault();
            // this.bustCacheAndReload();
        }
    }

    /**
     * Fire-and-forget cache busting with keepalive
     * Used in beforeunload where we can't await
     */
    _bustCacheAsync() {
        const resources = this.getTrackedResources();
        this._log(`Async cache bust for ${resources.length} resources`);

        for (const url of resources) {
            try {
                // Using keepalive allows fetch to continue after page unload
                fetch(url, {
                    method: 'GET',
                    cache: 'reload',
                    keepalive: true,
                    // Don't need the response body
                    mode: 'no-cors',
                    credentials: 'same-origin'
                }).catch(() => {
                    // Ignore errors during unload
                });
            } catch {
                // Ignore errors
            }
        }
    }

    async _bustCacheForUrl(url) {
        try {
            const response = await fetch(url, {
                method: 'GET',
                cache: 'reload',
                mode: 'no-cors',
                credentials: 'same-origin'
            });
            
            // Consume the body to complete the fetch
            if (response.body) {
                const reader = response.body.getReader();
                while (true) {
                    const { done } = await reader.read();
                    if (done) break;
                }
            }

            return { url, success: true };
        } catch (error) {
            this._log(`Failed to bust cache for ${url}:`, error);
            throw error;
        }
    }

    _addCacheBustParam(url) {
        const urlObj = new URL(url);
        urlObj.searchParams.set('_cb', Date.now().toString(36));
        return urlObj.toString();
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
        instance.init();
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
if (typeof document !== 'undefined') {
    const script = document.currentScript;
    if (script?.hasAttribute('data-auto-init')) {
        const debug = script.hasAttribute('data-debug');
        initCacheBuster({ debug });
    }
}

