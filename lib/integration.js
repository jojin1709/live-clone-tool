const axios = require('axios');
const logger = require('./logger');

class IntegrationManager {
  constructor(config = {}) {
    this.config = config;
    this.webhooks = [];
  }

  // Webhook notifications
  addWebhook(webhook) {
    this.webhooks.push(webhook);
    logger.info('Webhook added: ' + webhook.name);
  }

  async sendWebhook(name, data) {
    const webhook = this.webhooks.find(w => w.name === name);
    if (!webhook) {
      logger.warn('Webhook not found: ' + name);
      return false;
    }

    try {
      const payload = {
        text: webhook.format ? webhook.format(data) : JSON.stringify(data, null, 2),
        username: webhook.username || 'Living Clone',
        avatar_url: webhook.avatar || ''
      };

      await axios.post(webhook.url, payload, {
        headers: { 'Content-Type': 'application/json' }
      });

      logger.info('Webhook sent: ' + name);
      return true;
    } catch (error) {
      logger.error('Webhook failed: ' + error.message);
      return false;
    }
  }

  // Slack webhook
  sendSlack(message, channel = null) {
    const payload = { text: message };
    if (channel) payload.channel = channel;
    return this.sendGenericWebhook('slack', payload);
  }

  // Discord webhook
  sendDiscord(message, username = 'Living Clone') {
    return this.sendGenericWebhook('discord', { content: message, username });
  }

  async sendGenericWebhook(type, payload) {
    const url = this.config[type + 'Webhook'];
    if (!url) return false;

    try {
      await axios.post(url, payload, {
        headers: { 'Content-Type': 'application/json' }
      });
      return true;
    } catch (error) {
      logger.error(type + ' webhook failed: ' + error.message);
      return false;
    }
  }

  // Burp Suite integration
  async sendToBurp(data, burpConfig = {}) {
    const { host = '127.0.0.1', port = 1337 } = burpConfig;
    
    try {
      // Burp REST API
      const response = await axios.post(`http://${host}:${port}/burp/api/v0.1/requests`, {
        requests: [{
          url: data.url,
          method: data.method || 'GET',
          headers: data.headers || {},
          body: data.body || ''
        }]
      }, {
        headers: { 'Content-Type': 'application/json' }
      });

      logger.info('Sent to Burp Suite');
      return response.data;
    } catch (error) {
      logger.error('Burp integration failed: ' + error.message);
      return null;
    }
  }

  // ZAP integration
  async sendToZAP(data, zapConfig = {}) {
    const { host = '127.0.0.1', port = 8080, apiKey = '' } = zapConfig;
    const baseUrl = `http://${host}:${port}`;

    try {
      // Import URL to ZAP
      const response = await axios.get(`${baseUrl}/JSON/importurl/`, {
        params: { url: data.url, apikey: apiKey }
      });

      logger.info('Sent to OWASP ZAP');
      return response.data;
    } catch (error) {
      logger.error('ZAP integration failed: ' + error.message);
      return null;
    }
  }

  // HAR export
  toHar(requests, responses) {
    const har = {
      log: {
        version: '1.2',
        creator: { name: 'Living Clone', version: '2.0.0' },
        entries: []
      }
    };

    for (let i = 0; i < requests.length; i++) {
      const req = requests[i];
      const res = responses[i] || {};

      har.log.entries.push({
        startedDateTime: req.timestamp?.toISOString() || new Date().toISOString(),
        time: req.duration || 0,
        request: {
          method: req.method || 'GET',
          url: req.url,
          headers: Object.entries(req.headers || {}).map(([name, value]) => ({ name, value })),
          queryString: this.parseQueryString(req.url),
          headersSize: -1,
          bodySize: req.body ? req.body.length : 0
        },
        response: {
          status: res.status || 0,
          statusText: '',
          headers: Object.entries(res.headers || {}).map(([name, value]) => ({ name, value: String(value) })),
          content: {
            size: res.size || 0,
            mimeType: res.headers?.['content-type'] || 'text/html',
            text: res.data || ''
          },
          redirectURL: res.headers?.location || '',
          headersSize: -1,
          bodySize: res.size || 0
        },
        cache: {},
        timings: { send: 0, wait: req.duration || 0, receive: 0 }
      });
    }

    return har;
  }

  saveHar(har, filePath) {
    const fs = require('fs');
    fs.writeFileSync(filePath, JSON.stringify(har, null, 2));
    logger.info('HAR exported to ' + filePath);
  }

  parseQueryString(url) {
    try {
      const urlObj = new URL(url);
      return Array.from(urlObj.searchParams.entries()).map(([name, value]) => ({ name, value }));
    } catch {
      return [];
    }
  }

  // Import HAR
  importHar(filePath) {
    const fs = require('fs');
    const har = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    const requests = [];
    const responses = [];

    for (const entry of har.log.entries) {
      requests.push({
        url: entry.request.url,
        method: entry.request.method,
        headers: Object.fromEntries(entry.request.headers.map(h => [h.name, h.value])),
        timestamp: new Date(entry.startedDateTime)
      });

      responses.push({
        status: entry.response.status,
        headers: Object.fromEntries(entry.response.headers.map(h => [h.name, h.value])),
        data: entry.response.content.text,
        size: entry.response.content.size
      });
    }

    return { requests, responses };
  }

  // Burp payload generator
  generateBurpPayload(vuln) {
    const payloads = {
      'XSS': [
        '<script>alert(1)</script>',
        '<img src=x onerror=alert(1)>',
        '"><script>alert(1)</script>',
        "';alert(1)//"
      ],
      'SQLi': [
        "' OR '1'='1",
        "' UNION SELECT NULL--",
        "1; DROP TABLE users--",
        "' OR 1=1#"
      ],
      'LFI': [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32\\config\\sam',
        '....//....//....//etc/passwd',
        '/etc/passwd%00'
      ]
    };

    return payloads[vuln.type] || [];
  }

  // Generate curl command
  generateCurl(request) {
    let cmd = 'curl';
    cmd += ' -X ' + (request.method || 'GET');
    
    for (const [name, value] of Object.entries(request.headers || {})) {
      cmd += ` -H '${name}: ${value}'`;
    }

    if (request.body) {
      cmd += ` -d '${request.body}'`;
    }

    cmd += ` '${request.url}'`;
    return cmd;
  }

  // Generate Burp XML
  toBurpXml(request) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<item>
  <url>${this.escapeXml(request.url)}</url>
  <method>${request.method || 'GET'}</method>
  <host>${new URL(request.url).hostname}</host>
  <port>${new URL(request.url).port || 80}</port>
  <protocol>${new URL(request.url).protocol.replace(':', '')}</protocol>
  <request base64="false">${this.escapeXml(this.generateCurl(request))}</request>
  <status>${request.status || 0}</status>
  <responselength>${request.size || 0}</responselength>
  <mimetype>${request.mimeType || 'text/html'}</mimetype>
</item>`;
  }

  escapeXml(str) {
    return str.replace(/[<>&'"]/g, c => ({
      '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;'
    })[c]);
  }
}

module.exports = IntegrationManager;
