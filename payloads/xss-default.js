// Living Clone - Default XSS Testing Payload
// This payload adds visual indicators and logs activities

(function() {
  'use strict';

  // Add visual indicator that site is cloned
  const indicator = document.createElement('div');
  indicator.innerHTML = `
    <div style="
      position: fixed;
      top: 10px;
      right: 10px;
      background: linear-gradient(135deg, #ff6b6b, #ee5a5a);
      color: white;
      padding: 15px 20px;
      z-index: 99999;
      border-radius: 8px;
      font-family: 'Segoe UI', monospace;
      box-shadow: 0 4px 15px rgba(0,0,0,0.3);
      cursor: pointer;
      transition: transform 0.2s;
    " onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
      🔴 LIVING CLONE - XSS TEST ENVIRONMENT
      <div style="font-size: 10px; margin-top: 5px; opacity: 0.8;">
        Click to dismiss | $(new Date().toLocaleString())
      </div>
    </div>
  `;
  document.body.appendChild(indicator);

  // Click to dismiss indicator
  indicator.addEventListener('click', () => indicator.remove());

  // Log all clicks with coordinates
  document.addEventListener('click', (e) => {
    console.log('[LivingClone] Click detected:', {
      x: e.clientX,
      y: e.clientY,
      element: e.target.tagName,
      id: e.target.id,
      class: e.target.className,
      timestamp: new Date().toISOString()
    });
  });

  // Log form submissions
  document.querySelectorAll('form').forEach(form => {
    form.addEventListener('submit', (e) => {
      console.log('[LivingClone] Form submission:', {
        action: form.action,
        method: form.method,
        fields: Array.from(form.elements).map(el => ({
          name: el.name,
          type: el.type,
          value: el.value ? '[REDACTED]' : '[EMPTY]'
        }))
      });
    });
  });

  // Log XMLHttpRequest
  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function() {
    console.log('[LivingClone] XHR Request:', arguments[0], arguments[1]);
    originalOpen.apply(this, arguments);
  };

  // Log Fetch API calls
  const originalFetch = window.fetch;
  window.fetch = function() {
    console.log('[LivingClone] Fetch Request:', arguments[0]);
    return originalFetch.apply(this, arguments);
  };

  console.log('[LivingClone] Payload loaded successfully');
  console.log('[LivingClone] Current URL:', window.location.href);
})();
