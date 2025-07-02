// Fixed init.js for HackMD Desktop App
// Addresses duplicate open_link triggering issue

function init() {
  console.log('[HackMD] Initializing link handler...', Date.now());
  
  // Check if we've already initialized to prevent duplicate listeners
  if (window.hackmdLinkHandlerInitialized) {
    console.warn('[HackMD] Link handler already initialized, skipping...');
    return;
  }
  
  const invoke = window.__TAURI__.invoke;

  // Mark as initialized
  window.hackmdLinkHandlerInitialized = true;
  
  // Count script loads for debugging
  if (window.hackmdInitCount) {
    window.hackmdInitCount++;
    console.warn('[HackMD] Init script loaded multiple times:', window.hackmdInitCount);
  } else {
    window.hackmdInitCount = 1;
  }

  /** 
   * Link click handler with duplicate prevention
   * Based on {@link https://github.com/lencx/ChatGPT/blob/fac5a4399ed553424be5388fe5eb24d5e5c0e98c/scripts/core.js#L102-L108}
   */
  function handleLinkClick(event) {
    const { target } = event;
    const origin = target.closest('a');
    
    if (!origin || !origin.target) return;
    
    // Debug logging
    console.log('[HackMD] Link click detected:', {
      href: origin.href,
      target: origin.target,
      timestamp: Date.now()
    });
    
    // Prevent default browser behavior and event bubbling
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    
    // URL validation for security
    try {
      const url = new URL(origin.href);
      const allowedProtocols = ['http:', 'https:', 'mailto:'];
      
      if (!allowedProtocols.includes(url.protocol)) {
        console.warn('[HackMD] Blocked potentially unsafe URL:', origin.href);
        return;
      }
      
      // Optional: Allow-list specific domains for HackMD
      const allowedDomains = [
        'hackmd.io', 
        'hackmd.com', 
        'codimd.io',
        'github.com',
        'gitlab.com'
      ];
      
      // For external links, show confirmation (optional)
      if (!allowedDomains.some(domain => url.hostname.includes(domain))) {
        const confirmOpen = confirm(`Open external link: ${url.hostname}?`);
        if (!confirmOpen) return;
      }
      
      console.log('[HackMD] Opening link via Tauri:', origin.href);
      
      // Call Tauri open_link command
      invoke('open_link', { url: origin.href }).catch(error => {
        console.error('[HackMD] Failed to open link:', error);
        // Fallback: could show an error message to user
      });
      
    } catch (error) {
      console.error('[HackMD] Invalid URL:', origin.href, error);
    }
  }

  // Remove any existing listeners to prevent duplicates
  if (window.hackmdLinkClickHandler) {
    document.removeEventListener('click', window.hackmdLinkClickHandler);
    console.log('[HackMD] Removed existing link handler');
  }
  
  // Store reference for cleanup
  window.hackmdLinkClickHandler = handleLinkClick;
  
  // Add single event listener with proper options
  document.addEventListener('click', handleLinkClick, {
    capture: true,  // Capture phase to handle early
    passive: false  // Allow preventDefault
  });
  
  console.log('[HackMD] Link handler initialized successfully');
  
  // Optional: Add cleanup on page unload
  window.addEventListener('beforeunload', () => {
    if (window.hackmdLinkClickHandler) {
      document.removeEventListener('click', window.hackmdLinkClickHandler);
      window.hackmdLinkHandlerInitialized = false;
      console.log('[HackMD] Cleaned up link handler');
    }
  });
}

// Self-executing function with error handling
try {
  init();
} catch (error) {
  console.error('[HackMD] Failed to initialize link handler:', error);
}