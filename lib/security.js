const axios = require('axios');
const logger = require('./logger');

const WAF_SIGNATURES = {
  'Cloudflare': ['cf-ray', 'cf-cache-status', '__cfduid', 'cloudflare'],
  'Akamai': ['x-akamai-transformed', 'akamai-origin-hop', 'x-akamai-request-id'],
  'AWS WAF': ['x-amzn-waf', 'x-amzn-requestid', 'x-amz-cf-id'],
  'ModSecurity': ['mod_security', 'modsecurity', 'NOYB'],
  'Imperva': ['x-iinfo', 'incap_ses', 'visid_incap'],
  'F5 BIG-IP': ['bigip', 'bigipconnect', 'tsavi'],
  'Sucuri': ['sucuri', 'x-sucuri-id'],
  'Wordfence': ['wordfence', 'wfds'],
  'Barracuda': ['barra_counter_session', 'bam_boobang'],
  'DenyAll': ['denyall-', 'conditionist'],
  'FortiWeb': ['fortiweb', 'fwb'],
  'Radware': ['radware', 'rdwr'],
  'StackPath': ['stackpath', 'sp-edge'],
  'Fastly': ['fastly-debug-digest', 'x-served-by', 'x-cache'],
  'Varnish': ['x-varnish', 'via: varnish'],
  'Nginx': ['nginx'],
  'Apache': ['apache'],
  'IIS': ['microsoft-iis', 'x-powered-by: asp']
};

const TECH_SIGNATURES = {
  'WordPress': {
    headers: ['x-powered-by: wordpress'],
    html: ['wp-content', 'wp-includes', 'wordpress'],
    cookies: ['wordpress_', 'wp-settings-']
  },
  'Drupal': {
    headers: ['x-drupal-cache', 'x-generator: drupal'],
    html: ['drupal.js', 'drupal.css', 'sites/default/files'],
    cookies: ['SESS', 'drupal_']
  },
  'Joomla': {
    headers: ['x-content-encoded-by: joomla'],
    html: ['/components/com_', '/modules/mod_', 'joomla'],
    cookies: ['joomla_']
  },
  'Laravel': {
    headers: ['x-powered-by: laravel'],
    html: [],
    cookies: ['laravel_session', 'XSRF-TOKEN']
  },
  'Django': {
    headers: ['x-frame-options: deny'],
    html: ['csrfmiddlewaretoken', 'django'],
    cookies: ['csrftoken', 'sessionid']
  },
  'Express': {
    headers: ['x-powered-by: express'],
    html: [],
    cookies: ['connect.sid']
  },
  'Ruby on Rails': {
    headers: ['x-powered-by: phusion_passenger', 'x-request-id'],
    html: ['csrf-token'],
    cookies: ['_session_id']
  },
  'Spring': {
    headers: ['x-application-context'],
    html: ['spring', 'thymeleaf'],
    cookies: ['JSESSIONID']
  },
  'Angular': {
    headers: [],
    html: ['ng-version', 'ng-app', 'angular'],
    cookies: []
  },
  'React': {
    headers: [],
    html: ['react', '_reactroot', 'data-reactroot'],
    cookies: []
  },
  'Vue.js': {
    headers: [],
    html: ['vue', 'data-v-', 'v-bind', 'v-on'],
    cookies: []
  },
  'jQuery': {
    headers: [],
    html: ['jquery', 'jquery.min.js'],
    cookies: []
  },
  'Bootstrap': {
    headers: [],
    html: ['bootstrap.min.css', 'bootstrap.min.js', 'bootstrap/'],
    cookies: []
  },
  'PHP': {
    headers: ['x-powered-by: php'],
    html: ['.php'],
    cookies: ['PHPSESSID']
  },
  'ASP.NET': {
    headers: ['x-powered-by: asp.net', 'x-aspnet-version'],
    html: ['__VIEWSTATE', '__EVENTVALIDATION'],
    cookies: ['ASP.NET_SessionId', '.ASPXAUTH']
  },
  'Node.js': {
    headers: ['x-powered-by: express'],
    html: [],
    cookies: ['connect.sid']
  },
  'Python': {
    headers: ['x-powered-by: python', 'server: gunicorn'],
    html: ['python', 'flask', 'django'],
    cookies: []
  },
  'Ruby': {
    headers: ['x-powered-by: phusion_passenger'],
    html: ['ruby', 'rails'],
    cookies: []
  },
  'Java': {
    headers: ['x-powered-by: servlet'],
    html: ['.jsp', '.java', 'tomcat'],
    cookies: ['JSESSIONID']
  },
  'Nginx': {
    headers: ['server: nginx'],
    html: [],
    cookies: []
  },
  'Apache': {
    headers: ['server: apache'],
    html: [],
    cookies: []
  },
  'IIS': {
    headers: ['server: microsoft-iis'],
    html: [],
    cookies: []
  },
  'LiteSpeed': {
    headers: ['server: litespeed'],
    html: [],
    cookies: []
  },
  'Caddy': {
    headers: ['server: caddy'],
    html: [],
    cookies: []
  }
};

const VULN_PATTERNS = {
  'XSS': [
    /<script[^>]*>.*?<\/script>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
    /eval\s*\(/gi,
    /document\.write/gi,
    /innerHTML\s*=/gi
  ],
  'SQLi': [
    /union\s+select/gi,
    /select\s+.*\s+from/gi,
    /insert\s+into/gi,
    /drop\s+table/gi,
    /or\s+1\s*=\s*1/gi,
    /'\s+or\s+'/gi,
    /--$/gm,
    /\/\*.*?\*\//g
  ],
  'LFI': [
    /\.\.\/\.\.\//g,
    /\.\.\\\.\\\//g,
    /etc\/passwd/gi,
    /etc\/shadow/gi,
    /proc\/self/gi,
    /windows\/system32/gi
  ],
  'SSI': [
    /<!--#exec/gi,
    /<!--#include/gi,
    /<!--#config/gi
  ],
  'Template Injection': [
    /\{\{.*?\}\}/g,
    /\{%.*?%\}/g,
    /\$\{.*?\}/g,
    /<%.*?%>/g
  ],
  'Open Redirect': [
    /redirect\s*=\s*https?:\/\//gi,
    /url\s*=\s*https?:\/\//gi,
    /next\s*=\s*https?:\/\//gi,
    /return\s*=\s*https?:\/\//gi
  ]
};

class SecurityScanner {
  constructor(config = {}) {
    this.config = config;
    this.results = {};
  }

  async scan(url) {
    logger.info('Running security scan on: ' + url);
    const startTime = Date.now();

    try {
      const response = await axios.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        timeout: 15000,
        maxRedirects: 5
      });

      const html = response.data;
      const headers = response.headers;

      this.results = {
        url,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        waf: this.detectWAF(headers, html),
        technologies: this.detectTechnologies(headers, html),
        vulnerabilities: this.scanVulnerabilities(html, url),
        headers: this.analyzeHeaders(headers),
        ssl: await this.checkSSL(url),
        cookies: this.analyzeCookies(headers),
        forms: this.analyzeForms(html),
        score: 0
      };

      this.results.score = this.calculateScore(this.results);

      logger.info('Security scan completed');
      return this.results;

    } catch (error) {
      logger.error('Security scan failed: ' + error.message);
      throw error;
    }
  }

  detectWAF(headers, html) {
    const detected = [];
    const headerStr = JSON.stringify(headers).toLowerCase();
    const htmlLower = html.toLowerCase();

    for (const [waf, signatures] of Object.entries(WAF_SIGNATURES)) {
      for (const sig of signatures) {
        if (headerStr.includes(sig.toLowerCase()) || htmlLower.includes(sig.toLowerCase())) {
          detected.push({ name: waf, signature: sig, confidence: 'high' });
          break;
        }
      }
    }

    return { detected, hasWAF: detected.length > 0 };
  }

  detectTechnologies(headers, html) {
    const detected = [];
    const headerStr = JSON.stringify(headers).toLowerCase();
    const htmlLower = html.toLowerCase();

    for (const [tech, signatures] of Object.entries(TECH_SIGNATURES)) {
      let score = 0;
      
      for (const sig of (signatures.headers || [])) {
        if (headerStr.includes(sig.toLowerCase())) score += 3;
      }
      for (const sig of (signatures.html || [])) {
        if (htmlLower.includes(sig.toLowerCase())) score += 2;
      }
      for (const sig of (signatures.cookies || [])) {
        if (headerStr.includes(sig.toLowerCase())) score += 2;
      }

      if (score > 0) {
        detected.push({ name: tech, confidence: Math.min(score * 10, 100) });
      }
    }

    detected.sort((a, b) => b.confidence - a.confidence);
    return detected;
  }

  scanVulnerabilities(html, url) {
    const findings = [];

    for (const [vulnType, patterns] of Object.entries(VULN_PATTERNS)) {
      for (const pattern of patterns) {
        const matches = html.match(pattern);
        if (matches && matches.length > 0) {
          findings.push({
            type: vulnType,
            pattern: pattern.source,
            occurrences: matches.length,
            samples: matches.slice(0, 3),
            severity: this.getSeverity(vulnType)
          });
        }
      }
    }

    return findings;
  }

  analyzeHeaders(headers) {
    const securityHeaders = {
      'strict-transport-security': { name: 'HSTS', present: false, recommendations: ['max-age=31536000', 'includeSubDomains', 'preload'] },
      'x-content-type-options': { name: 'X-Content-Type-Options', present: false, recommendations: ['nosniff'] },
      'x-frame-options': { name: 'X-Frame-Options', present: false, recommendations: ['DENY', 'SAMEORIGIN'] },
      'x-xss-protection': { name: 'X-XSS-Protection', present: false, recommendations: ['1; mode=block'] },
      'content-security-policy': { name: 'CSP', present: false, recommendations: [] },
      'x-permitted-cross-domain-policies': { name: 'Cross-Domain Policy', present: false, recommendations: ['none'] },
      'referrer-policy': { name: 'Referrer-Policy', present: false, recommendations: ['strict-origin-when-cross-origin'] },
      'permissions-policy': { name: 'Permissions-Policy', present: false, recommendations: [] },
      'cross-origin-embedder-policy': { name: 'COEP', present: false, recommendations: ['require-corp'] },
      'cross-origin-opener-policy': { name: 'COOP', present: false, recommendations: ['same-origin'] },
      'cross-origin-resource-policy': { name: 'CORP', present: false, recommendations: ['same-origin'] }
    };

    const missing = [];
    const present = [];
    const insecure = [];

    for (const [header, info] of Object.entries(securityHeaders)) {
      const value = headers[header] || headers[header.toLowerCase()];
      if (value) {
        info.present = true;
        info.value = value;
        present.push(info);
        
        if (header === 'strict-transport-security' && !value.includes('max-age')) {
          insecure.push({ header, issue: 'Missing max-age directive' });
        }
      } else {
        missing.push(info);
      }
    }

    // Check for insecure headers
    if (headers['x-powered-by']) {
      insecure.push({ header: 'x-powered-by', issue: 'Server technology exposed', value: headers['x-powered-by'] });
    }
    if (headers['server'] && !headers['server'].includes('cloudflare')) {
      insecure.push({ header: 'server', issue: 'Server version exposed', value: headers['server'] });
    }

    return { missing, present, insecure, total: Object.keys(securityHeaders).length };
  }

  async checkSSL(url) {
    if (!url.startsWith('https')) {
      return { valid: false, issue: 'Not using HTTPS' };
    }

    try {
      const https = require('https');
      const urlObj = new URL(url);
      
      return new Promise((resolve) => {
        const req = https.get({
          hostname: urlObj.hostname,
          port: 443,
          rejectUnauthorized: false
        }, (res) => {
          const cert = res.socket.getPeerCertificate();
          resolve({
            valid: res.socket.authorized,
            subject: cert.subject?.CN,
            issuer: cert.issuer?.CN,
            validFrom: cert.valid_from,
            validTo: cert.valid_to,
            daysLeft: Math.floor((new Date(cert.valid_to) - new Date()) / (1000 * 60 * 60 * 24))
          });
        });
        req.on('error', () => resolve({ valid: false, error: 'Connection failed' }));
        req.setTimeout(5000, () => { req.destroy(); resolve({ valid: false, error: 'Timeout' }); });
      });
    } catch (e) {
      return { valid: false, error: e.message };
    }
  }

  analyzeCookies(headers) {
    const cookies = headers['set-cookie'] || [];
    const analysis = [];

    for (const cookie of (Array.isArray(cookies) ? cookies : [cookies])) {
      const parts = cookie.split(';').map(p => p.trim());
      const [nameValue] = parts;
      const name = nameValue.split('=')[0];

      const flags = {
        httpOnly: parts.some(p => p.toLowerCase() === 'httponly'),
        secure: parts.some(p => p.toLowerCase() === 'secure'),
        sameSite: parts.find(p => p.toLowerCase().startsWith('samesite='))?.split('=')[1] || 'None'
      };

      analysis.push({ name, flags, issues: this.getCookieIssues(flags) });
    }

    return analysis;
  }

  getCookieIssues(flags) {
    const issues = [];
    if (!flags.httpOnly) issues.push('Missing HttpOnly flag');
    if (!flags.secure) issues.push('Missing Secure flag');
    if (flags.sameSite === 'None') issues.push('SameSite is None');
    return issues;
  }

  analyzeForms(html) {
    const cheerio = require('cheerio');
    const $ = cheerio.load(html);
    const forms = [];

    $('form').each((i, el) => {
      const form = $(el);
      forms.push({
        action: form.attr('action') || 'current page',
        method: (form.attr('method') || 'GET').toUpperCase(),
        fields: form.find('input, textarea, select').map((j, field) => ({
          name: $(field).attr('name'),
          type: $(field).attr('type') || 'text',
          required: $(field).attr('required') !== undefined
        })).get()
      });
    });

    return forms;
  }

  getSeverity(type) {
    const severities = { 'XSS': 'high', 'SQLi': 'critical', 'LFI': 'critical', 'SSI': 'high', 'Template Injection': 'high', 'Open Redirect': 'medium' };
    return severities[type] || 'info';
  }

  calculateScore(results) {
    let score = 100;
    
    // Deduct for missing security headers
    score -= results.headers.missing.length * 5;
    
    // Deduct for vulnerabilities
    score -= results.vulnerabilities.length * 10;
    
    // Deduct for insecure headers
    score -= results.headers.insecure.length * 3;
    
    // Deduct for cookie issues
    for (const cookie of results.cookies) {
      score -= cookie.issues.length * 2;
    }
    
    // Bonus for WAF
    if (results.waf.hasWAF) score += 5;
    
    // Bonus for HTTPS
    if (results.ssl.valid) score += 5;

    return Math.max(0, Math.min(100, score));
  }

  generateReport() {
    const r = this.results;
    return `
# Security Scan Report

**URL:** ${r.url}
**Date:** ${r.timestamp}
**Score:** ${r.score}/100

## WAF Detection
${r.waf.hasWAF ? 'WAF Detected: ' + r.waf.detected.map(w => w.name).join(', ') : 'No WAF detected'}

## Technologies Detected
${r.technologies.map(t => `- ${t.name} (${t.confidence}% confidence)`).join('\n') || 'None detected'}

## Security Headers
### Present
${r.headers.present.map(h => `- ${h.name}: ${h.value}`).join('\n') || 'None'}

### Missing
${r.headers.missing.map(h => `- ${h.name}`).join('\n') || 'None'}

### Insecure
${r.headers.insecure.map(h => `- ${h.header}: ${h.issue}`).join('\n') || 'None'}

## Vulnerabilities Found
${r.vulnerabilities.map(v => `- ${v.type} (${v.severity}): ${v.occurrences} occurrences`).join('\n') || 'None'}

## SSL
- Valid: ${r.ssl.valid}
${r.ssl.subject ? `- Subject: ${r.ssl.subject}` : ''}
${r.ssl.daysLeft ? `- Days Left: ${r.ssl.daysLeft}` : ''}

## Cookies
${r.cookies.map(c => `- ${c.name}: ${c.issues.length > 0 ? c.issues.join(', ') : 'OK'}`).join('\n') || 'None'}
`;
  }
}

module.exports = SecurityScanner;
