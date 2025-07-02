// Link Click Debugging Tool for HackMD Desktop App
// Run this in the browser console to diagnose duplicate triggering

class LinkDebugTool {
  constructor() {
    this.clickCount = 0;
    this.linkClicks = [];
    this.originalAddEventListener = Document.prototype.addEventListener;
    this.originalRemoveEventListener = Document.prototype.removeEventListener;
    this.eventListeners = new Map();
    
    this.init();
  }
  
  init() {
    console.log('[Debug Tool] Initializing link debug tool...');
    this.interceptEventListeners();
    this.setupLinkClickMonitoring();
    this.checkExistingEventListeners();
    this.monitorTauriCalls();
  }
  
  // Intercept addEventListener calls to track registrations
  interceptEventListeners() {
    const self = this;
    
    Document.prototype.addEventListener = function(type, listener, options) {
      if (type === 'click') {
        const listenerId = `listener-${Date.now()}-${Math.random()}`;
        self.eventListeners.set(listenerId, {
          type,
          listener,
          options,
          element: this,
          stack: new Error().stack
        });
        console.log('[Debug Tool] Click listener registered:', {
          listenerId,
          element: this.tagName || 'document',
          stack: new Error().stack.split('\n')[2] // Show caller
        });
      }
      
      return self.originalAddEventListener.call(this, type, listener, options);
    };
    
    Document.prototype.removeEventListener = function(type, listener, options) {
      if (type === 'click') {
        // Find and remove from our tracking
        for (const [id, data] of self.eventListeners.entries()) {
          if (data.listener === listener) {
            self.eventListeners.delete(id);
            console.log('[Debug Tool] Click listener removed:', id);
            break;
          }
        }
      }
      
      return self.originalRemoveEventListener.call(this, type, listener, options);
    };
  }
  
  // Monitor all link clicks
  setupLinkClickMonitoring() {
    const self = this;
    
    // High priority listener to catch all clicks
    document.addEventListener('click', function(event) {
      const target = event.target;
      const link = target.closest('a');
      
      if (link && link.href) {
        self.clickCount++;
        const clickData = {
          id: self.clickCount,
          timestamp: Date.now(),
          href: link.href,
          target: link.target,
          eventPhase: event.eventPhase,
          bubbles: event.bubbles,
          cancelable: event.cancelable,
          defaultPrevented: event.defaultPrevented,
          element: link,
          clickTarget: target,
          stack: new Error().stack
        };
        
        self.linkClicks.push(clickData);
        
        console.group(`[Debug Tool] Link Click #${self.clickCount}`);
        console.log('URL:', link.href);
        console.log('Target:', link.target);
        console.log('Event Phase:', event.eventPhase);
        console.log('Default Prevented:', event.defaultPrevented);
        console.log('Event:', event);
        console.log('Link Element:', link);
        console.groupEnd();
        
        // Check for rapid duplicate clicks (within 100ms)
        const recentClicks = self.linkClicks.filter(click => 
          clickData.timestamp - click.timestamp < 100 && 
          click.href === clickData.href
        );
        
        if (recentClicks.length > 1) {
          console.warn('[Debug Tool] ⚠️ DUPLICATE CLICK DETECTED!', {
            duplicateCount: recentClicks.length,
            timeSpan: clickData.timestamp - recentClicks[0].timestamp,
            clicks: recentClicks
          });
        }
      }
    }, true); // Use capture phase
  }
  
  // Check existing event listeners
  checkExistingEventListeners() {
    if (typeof getEventListeners === 'function') {
      const listeners = getEventListeners(document);
      console.log('[Debug Tool] Existing document event listeners:', listeners);
      
      if (listeners.click && listeners.click.length > 1) {
        console.warn('[Debug Tool] ⚠️ Multiple click listeners detected:', listeners.click.length);
        listeners.click.forEach((listener, index) => {
          console.log(`[Debug Tool] Listener ${index + 1}:`, listener);
        });
      }
    }
  }
  
  // Monitor Tauri invoke calls
  monitorTauriCalls() {
    if (window.__TAURI__ && window.__TAURI__.invoke) {
      const originalInvoke = window.__TAURI__.invoke;
      const self = this;
      
      window.__TAURI__.invoke = function(command, args) {
        if (command === 'open_link') {
          console.log('[Debug Tool] 🔗 Tauri open_link called:', {
            url: args?.url,
            timestamp: Date.now(),
            stack: new Error().stack.split('\n').slice(0, 5)
          });
          
          // Check for rapid duplicate invocations
          const recentCalls = self.linkClicks.filter(click => 
            Date.now() - click.timestamp < 1000 && 
            click.href === args?.url
          );
          
          if (recentCalls.length > 1) {
            console.error('[Debug Tool] 🚨 DUPLICATE TAURI CALL!', {
              url: args?.url,
              callCount: recentCalls.length
            });
          }
        }
        
        return originalInvoke.call(this, command, args);
      };
    }
  }
  
  // Get debug report
  getReport() {
    return {
      totalClicks: this.clickCount,
      recentClicks: this.linkClicks.slice(-10),
      activeListeners: Array.from(this.eventListeners.values()),
      listenerCount: this.eventListeners.size,
      duplicateClicks: this.findDuplicateClicks(),
      initializationState: {
        hackmdInitialized: window.hackmdLinkHandlerInitialized,
        hackmdInitCount: window.hackmdInitCount,
        tauriAvailable: !!window.__TAURI__
      }
    };
  }
  
  // Find potential duplicate clicks
  findDuplicateClicks() {
    const duplicates = [];
    const urlGroups = {};
    
    this.linkClicks.forEach(click => {
      if (!urlGroups[click.href]) {
        urlGroups[click.href] = [];
      }
      urlGroups[click.href].push(click);
    });
    
    Object.entries(urlGroups).forEach(([url, clicks]) => {
      // Group clicks within 1 second of each other
      const groups = [];
      let currentGroup = [];
      
      clicks.forEach(click => {
        if (currentGroup.length === 0 || 
            click.timestamp - currentGroup[currentGroup.length - 1].timestamp < 1000) {
          currentGroup.push(click);
        } else {
          if (currentGroup.length > 1) {
            groups.push([...currentGroup]);
          }
          currentGroup = [click];
        }
      });
      
      if (currentGroup.length > 1) {
        groups.push(currentGroup);
      }
      
      if (groups.length > 0) {
        duplicates.push({ url, groups });
      }
    });
    
    return duplicates;
  }
  
  // Reset monitoring
  reset() {
    this.clickCount = 0;
    this.linkClicks = [];
    console.log('[Debug Tool] Reset complete');
  }
}

// Auto-start the debug tool
const linkDebugTool = new LinkDebugTool();

// Make it globally available
window.linkDebugTool = linkDebugTool;

console.log(`
🔍 Link Debug Tool Active
=======================

Usage:
- linkDebugTool.getReport() - Get full debug report
- linkDebugTool.reset() - Reset monitoring
- linkDebugTool.findDuplicateClicks() - Find potential duplicates

The tool is now monitoring all link clicks and Tauri calls.
Check the console for real-time debug information.
`);