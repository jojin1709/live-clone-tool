// Living Clone - Form Data Grabber Test Payload
// For testing form security vulnerabilities

(function() {
  'use strict';

  // Visual indicator
  const indicator = document.createElement('div');
  indicator.innerHTML = `
    <div style="
      position: fixed;
      top: 10px;
      left: 10px;
      background: linear-gradient(135deg, #9C27B0, #7B1FA2);
      color: white;
      padding: 15px 20px;
      z-index: 99999;
      border-radius: 8px;
      font-family: 'Segoe UI', monospace;
      box-shadow: 0 4px 15px rgba(0,0,0,0.3);
      max-width: 350px;
    ">
      📝 Form Monitor Active
      <div style="font-size: 11px; margin-top: 8px; opacity: 0.9;">
        <div>Forms found: <span id="formCount">0</span></div>
        <div id="formList" style="margin-top: 5px; max-height: 150px; overflow-y: auto;"></div>
      </div>
    </div>
  `;
  document.body.appendChild(indicator);

  // Monitor all forms
  function monitorForms() {
    const forms = document.querySelectorAll('form');
    const countEl = document.getElementById('formCount');
    const listEl = document.getElementById('formList');
    
    if (countEl) countEl.textContent = forms.length;
    
    const formDetails = Array.from(forms).map((form, idx) => {
      const fields = Array.from(form.elements).filter(el => el.name).map(el => ({
        name: el.name,
        type: el.type,
        placeholder: el.placeholder,
        required: el.required
      }));
      
      return {
        index: idx + 1,
        action: form.action || 'current page',
        method: form.method || 'GET',
        fields: fields
      };
    });

    if (listEl) {
      listEl.innerHTML = formDetails.map(f => `
        <div style="background:rgba(255,255,255,0.2);padding:5px 8px;margin:3px 0;border-radius:3px;font-size:10px;">
          <div><strong>Form #${f.index}</strong> (${f.method})</div>
          <div>Fields: ${f.fields.length}</div>
        </div>
      `).join('');
    }

    // Log form details
    console.log('[FormGrabber] Forms found:', formDetails);

    // Add submit handlers to all forms
    forms.forEach((form, idx) => {
      if (!form.dataset.grabberAttached) {
        form.addEventListener('submit', (e) => {
          const formData = new FormData(form);
          const data = {};
          
          for (let [key, value] of formData.entries()) {
            // Mask sensitive fields
            if (key.toLowerCase().includes('password') || 
                key.toLowerCase().includes('token') ||
                key.toLowerCase().includes('secret')) {
              data[key] = '[REDACTED]';
            } else {
              data[key] = value;
            }
          }

          console.log('[FormGrabber] Form submission captured:', {
            formIndex: idx + 1,
            action: form.action,
            method: form.method,
            data: data
          });

          // Show notification
          showNotification(`Form #${idx + 1} data captured!`);
        });

        form.dataset.grabberAttached = 'true';
      }
    });

    return formDetails;
  }

  function showNotification(message) {
    const notif = document.createElement('div');
    notif.innerHTML = `
      <div style="
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: #333;
        color: white;
        padding: 20px 30px;
        z-index: 100000;
        border-radius: 10px;
        font-family: 'Segoe UI', monospace;
        box-shadow: 0 5px 20px rgba(0,0,0,0.5);
        animation: fadeInOut 2s forwards;
      ">
        📝 ${message}
      </div>
      <style>
        @keyframes fadeInOut {
          0% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
          20% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          80% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
        }
      </style>
    `;
    document.body.appendChild(notif);
    setTimeout(() => notif.remove(), 2000);
  }

  // Initial scan
  monitorForms();

  // Re-scan every 3 seconds for dynamic forms
  setInterval(monitorForms, 3000);

  console.log('[FormGrabber] Form monitor active');
})();
