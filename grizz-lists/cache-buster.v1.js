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
    const scripts = document.querySelectorAll('script[type="module"]');
    for (const script of scripts) {
        if (script.src && moduleUrl.includes(script.src.split('?')[0].split('/').pop())) {
            scriptElement = script;
            break;
        }
    }
    
    // Fallback: try matching by filename
    if (!scriptElement) {
        const filename = moduleUrl.split('/').pop().split('?')[0];
        for (const script of scripts) {
            if (script.src && script.src.includes(filename)) {
                scriptElement = script;
                break;
            }
        }
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
            ...options
        };

        this.trackedResources = new Set();
        this.observer = null;
        this.isInitialized = false;
        this.reloadPending = false;
        this.serviceWorkerRegistration = null;
        
        // Bind methods
        this._handlePageHide = this._handlePageHide.bind(this);
        this._handleVisibilityChange = this._handleVisibilityChange.bind(this);
        this._handleKeyDown = this._handleKeyDown.bind(this);
        this._handlePerformanceEntry = this._handlePerformanceEntry.bind(this);
    }

    /**
     * Initialize the cache buster
     */
    async init() {
        if (this.isInitialized) {
            this._log('Already initialized');
            return this;
        }

        this._log('Initializing CacheBuster...');

        // Register service worker for reliable mobile support
        if (this.options.useServiceWorker) {
            await this._registerServiceWorker();
        }

        // Track existing resources from performance timeline
        this._trackExistingResources();

        // Start observing new resources
        this._startObserving();

        // Listen for page lifecycle events
        // pagehide - fires on navigation/reload, doesn't block bfcache
        window.addEventListener('pagehide', this._handlePageHide);
        
        // visibilitychange - fires when user switches tabs/apps (good for PWAs)
        document.addEventListener('visibilitychange', this._handleVisibilityChange);

        // Optional keyboard shortcut
        if (this.options.enableKeyboardShortcut) {
            window.addEventListener('keydown', this._handleKeyDown);
        }

        this.isInitialized = true;
        this._log(`Initialized. Tracking ${this.trackedResources.size} existing resources.`);

        // Check if we just came from a cache bust reload
        if (this.options.showVisualIndicator) {
            this._checkAndShowIndicator();
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

        window.removeEventListener('pagehide', this._handlePageHide);
        document.removeEventListener('visibilitychange', this._handleVisibilityChange);
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

        // Set flag for visual indicator on next load
        this._setIndicatorFlag();

        // Also tell service worker to clear its cache
        if (this.serviceWorkerRegistration?.active) {
            this.serviceWorkerRegistration.active.postMessage('bustCache');
        }

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

    async _registerServiceWorker() {
        if (!('serviceWorker' in navigator)) {
            this._log('Service Workers not supported');
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

            this._log(`Registering service worker: ${swPath}`);
            
            this.serviceWorkerRegistration = await navigator.serviceWorker.register(swPath, {
                scope: './'
            });

            this._log('Service worker registered:', this.serviceWorkerRegistration.scope);

            // Listen for messages from service worker
            navigator.serviceWorker.addEventListener('message', (event) => {
                if (event.data?.type === 'cacheBusted') {
                    this._log('Service worker confirmed cache bust');
                }
            });

        } catch (error) {
            this._log('Service worker registration failed:', error);
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

    _handlePageHide(event) {
        // Mobile Safari: fires on navigation/reload
        // event.persisted indicates if page might be restored from bfcache
        // Always log this even without debug mode for troubleshooting
        console.log('[CacheBuster] pagehide fired, persisted:', event.persisted, 'resources:', this.trackedResources.size);
        
        if (this.trackedResources.size > 0) {
            this._bustCacheAsync();
        }
    }

    _handleVisibilityChange() {
        // Mobile: fires when switching apps/tabs
        if (document.visibilityState === 'hidden') {
            this._log('Page hidden, busting cache proactively');
            
            if (this.trackedResources.size > 0) {
                this._bustCacheAsync();
            }
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
    }

    /**
     * Fire-and-forget cache busting with keepalive
     * Used in beforeunload/pagehide where we can't await
     */
    _bustCacheAsync() {
        const resources = this.getTrackedResources();
        this._log(`Async cache bust for ${resources.length} resources`);

        // Set flag for visual indicator on next load
        this._setIndicatorFlag();

        // Tell service worker to clear cache
        if (this.serviceWorkerRegistration?.active) {
            this.serviceWorkerRegistration.active.postMessage('bustCache');
        }

        for (const url of resources) {
            try {
                // Using keepalive allows fetch to continue after page unload
                fetch(url, {
                    method: 'GET',
                    cache: 'reload',
                    keepalive: true,
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

    /**
     * Set a flag to show visual indicator on next page load
     */
    _setIndicatorFlag() {
        try {
            sessionStorage.setItem(CACHE_BUST_FLAG, 'true');
            sessionStorage.setItem(CACHE_BUST_TIME, Date.now().toString());
            console.log('[CacheBuster] Flag set for visual indicator');
        } catch (e) {
            console.log('[CacheBuster] Could not set sessionStorage:', e);
        }
    }

    /**
     * Check for indicator flag and show animation if present
     */
    _checkAndShowIndicator() {
        try {
            const wasBusted = sessionStorage.getItem(CACHE_BUST_FLAG);
            const bustTime = sessionStorage.getItem(CACHE_BUST_TIME);
            
            console.log('[CacheBuster] Checking for indicator flag:', { wasBusted, bustTime });
            
            if (wasBusted) {
                // Clear the flag immediately
                sessionStorage.removeItem(CACHE_BUST_FLAG);
                sessionStorage.removeItem(CACHE_BUST_TIME);
                
                // Only show if bust was recent (within 10 seconds)
                const elapsed = Date.now() - parseInt(bustTime || '0', 10);
                console.log('[CacheBuster] Elapsed since bust:', elapsed, 'ms');
                
                if (elapsed < 10000) {
                    console.log('[CacheBuster] Showing visual indicator!');
                    this._showVisualIndicator();
                } else {
                    console.log('[CacheBuster] Too much time elapsed, skipping indicator');
                }
            }
        } catch (e) {
            console.log('[CacheBuster] Error checking sessionStorage:', e);
        }
    }

    /**
     * Show a visual indicator that cache was busted
     */
    _showVisualIndicator() {
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
if (typeof document !== 'undefined') {
    console.log('[CacheBuster] Checking for auto-init...');
    console.log('[CacheBuster] scriptElement:', scriptElement);
    
    if (scriptElement?.hasAttribute('data-auto-init')) {
        const debug = scriptElement.hasAttribute('data-debug');
        const showVisualIndicator = !scriptElement.hasAttribute('data-no-indicator');
        console.log('[CacheBuster] Auto-init triggered with options:', { debug, showVisualIndicator });
        initCacheBuster({ debug, showVisualIndicator });
    } else {
        console.log('[CacheBuster] No data-auto-init attribute found on script element');
    }
} else {
    console.log('[CacheBuster] Not in browser environment');
}
