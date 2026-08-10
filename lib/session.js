const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const logger = require('./logger');

class Session {
  constructor(options = {}) {
    this.sessionId = options.sessionId || uuidv4();
    this.cookies = {};
    this.localStorage = {};
    this.sessionStorage = {};
    this.metadata = {
      created: new Date(),
      lastAccessed: new Date(),
      userAgent: null,
      proxy: null
    };
    this.filePath = options.filePath || null;
  }

  // Cookie management
  setCookie(name, value, options = {}) {
    const cookie = {
      name,
      value,
      domain: options.domain || '.example.com',
      path: options.path || '/',
      expires: options.expires || null,
      httpOnly: options.httpOnly || false,
      secure: options.secure || false,
      sameSite: options.sameSite || 'Lax',
      setAt: new Date()
    };

    const key = `${cookie.domain}:${cookie.path}:${cookie.name}`;
    this.cookies[key] = cookie;
    this.metadata.lastAccessed = new Date();
    
    logger.debug(`Cookie set: ${cookie.name}`, { domain: cookie.domain });
    return cookie;
  }

  getCookie(name, domain = null, path = '/') {
    for (const key in this.cookies) {
      const cookie = this.cookies[key];
      if (cookie.name === name) {
        if (domain && cookie.domain !== domain && !domain.endsWith(cookie.domain)) {
          continue;
        }
        if (cookie.path !== path && !path.startsWith(cookie.path)) {
          continue;
        }
        // Check expiry
        if (cookie.expires && new Date(cookie.expires) < new Date()) {
          delete this.cookies[key];
          continue;
        }
        return cookie;
      }
    }
    return null;
  }

  getCookiesForDomain(domain) {
    const result = [];
    for (const key in this.cookies) {
      const cookie = this.cookies[key];
      if (domain.endsWith(cookie.domain) || cookie.domain.endsWith(domain)) {
        if (cookie.expires && new Date(cookie.expires) < new Date()) {
          delete this.cookies[key];
          continue;
        }
        result.push(cookie);
      }
    }
    return result;
  }

  deleteCookie(name, domain = null) {
    for (const key in this.cookies) {
      const cookie = this.cookies[key];
      if (cookie.name === name) {
        if (domain && cookie.domain !== domain) {
          continue;
        }
        delete this.cookies[key];
        logger.debug(`Cookie deleted: ${name}`);
        return true;
      }
    }
    return false;
  }

  clearCookies() {
    this.cookies = {};
    logger.debug('All cookies cleared');
  }

  // LocalStorage management
  setLocalStorage(key, value) {
    this.localStorage[key] = {
      value,
      setAt: new Date()
    };
    this.metadata.lastAccessed = new Date();
    logger.debug(`LocalStorage set: ${key}`);
  }

  getLocalStorage(key) {
    if (this.localStorage[key]) {
      return this.localStorage[key].value;
    }
    return null;
  }

  removeLocalStorage(key) {
    if (this.localStorage[key]) {
      delete this.localStorage[key];
      logger.debug(`LocalStorage removed: ${key}`);
      return true;
    }
    return false;
  }

  clearLocalStorage() {
    this.localStorage = {};
    logger.debug('LocalStorage cleared');
  }

  // SessionStorage management
  setSessionStorage(key, value) {
    this.sessionStorage[key] = {
      value,
      setAt: new Date()
    };
    this.metadata.lastAccessed = new Date();
    logger.debug(`SessionStorage set: ${key}`);
  }

  getSessionStorage(key) {
    if (this.sessionStorage[key]) {
      return this.sessionStorage[key].value;
    }
    return null;
  }

  removeSessionStorage(key) {
    if (this.sessionStorage[key]) {
      delete this.sessionStorage[key];
      logger.debug(`SessionStorage removed: ${key}`);
      return true;
    }
    return false;
  }

  clearSessionStorage() {
    this.sessionStorage = {};
    logger.debug('SessionStorage cleared');
  }

  // Parse Set-Cookie header
  parseSetCookie(header) {
    const cookies = [];
    const parts = header.split(',');
    
    for (const part of parts) {
      const cookieParts = part.split(';');
      const [nameValue] = cookieParts;
      const [name, value] = nameValue.split('=');
      
      const cookie = {
        name: name.trim(),
        value: value ? value.trim() : '',
        domain: null,
        path: '/',
        expires: null,
        httpOnly: false,
        secure: false,
        sameSite: 'Lax'
      };

      for (let i = 1; i < cookieParts.length; i++) {
        const option = cookieParts[i].trim().toLowerCase();
        
        if (option.startsWith('domain=')) {
          cookie.domain = cookieParts[i].trim().substring(7);
        } else if (option.startsWith('path=')) {
          cookie.path = cookieParts[i].trim().substring(5);
        } else if (option.startsWith('expires=')) {
          cookie.expires = cookieParts[i].trim().substring(8);
        } else if (option === 'httponly') {
          cookie.httpOnly = true;
        } else if (option === 'secure') {
          cookie.secure = true;
        } else if (option.startsWith('samesite=')) {
          cookie.sameSite = cookieParts[i].trim().substring(9);
        }
      }

      cookies.push(cookie);
    }

    return cookies;
  }

  // Parse Cookie header from request
  parseCookieHeader(header) {
    const cookies = {};
    if (!header) return cookies;
    
    const parts = header.split(';');
    for (const part of parts) {
      const [name, value] = part.split('=');
      if (name && value) {
        cookies[name.trim()] = value.trim();
      }
    }
    
    return cookies;
  }

  // Generate Cookie header string
  generateCookieHeader(domain) {
    const cookies = this.getCookiesForDomain(domain);
    return cookies.map(c => `${c.name}=${c.value}`).join('; ');
  }

  // Save session to file
  save(filePath = null) {
    const path = filePath || this.filePath;
    if (!path) {
      logger.warn('No file path specified for session save');
      return false;
    }

    const data = {
      sessionId: this.sessionId,
      cookies: this.cookies,
      localStorage: this.localStorage,
      sessionStorage: this.sessionStorage,
      metadata: this.metadata
    };

    const dir = require('path').dirname(path);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(path, JSON.stringify(data, null, 2), 'utf8');
    logger.info(`Session saved to ${path}`);
    return true;
  }

  // Load session from file
  load(filePath) {
    if (!fs.existsSync(filePath)) {
      logger.warn(`Session file not found: ${filePath}`);
      return false;
    }

    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      this.sessionId = data.sessionId;
      this.cookies = data.cookies || {};
      this.localStorage = data.localStorage || {};
      this.sessionStorage = data.sessionStorage || {};
      this.metadata = data.metadata || this.metadata;
      this.filePath = filePath;
      logger.info(`Session loaded from ${filePath}`);
      return true;
    } catch (error) {
      logger.logError(error, { action: 'loadSession' });
      return false;
    }
  }

  // Export session in various formats
  export(format = 'json') {
    switch (format) {
      case 'json':
        return JSON.stringify({
          sessionId: this.sessionId,
          cookies: this.cookies,
          localStorage: this.localStorage,
          sessionStorage: this.sessionStorage,
          metadata: this.metadata
        }, null, 2);
      
      case 'netscape':
        return this.exportNetscapeFormat();
      
      case 'curl':
        return this.exportCurlFormat();
      
      default:
        return null;
    }
  }

  exportNetscapeFormat() {
    let output = '# Netscape HTTP Cookie File\n';
    for (const key in this.cookies) {
      const cookie = this.cookies[key];
      const expires = cookie.expires ? Math.floor(new Date(cookie.expires).getTime() / 1000) : 0;
      output += `${cookie.domain}\tTRUE\t${cookie.path}\t${cookie.secure ? 'TRUE' : 'FALSE'}\t${expires}\t${cookie.name}\t${cookie.value}\n`;
    }
    return output;
  }

  exportCurlFormat() {
    const cookiesByDomain = {};
    for (const key in this.cookies) {
      const cookie = this.cookies[key];
      if (!cookiesByDomain[cookie.domain]) {
        cookiesByDomain[cookie.domain] = [];
      }
      cookiesByDomain[cookie.domain].push(cookie);
    }

    let output = '';
    for (const domain in cookiesByDomain) {
      const cookieHeader = cookiesByDomain[domain].map(c => `${c.name}=${c.value}`).join('; ');
      output += `curl -b "${cookieHeader}" https://${domain}/\n`;
    }
    return output;
  }

  // Get session summary
  getSummary() {
    return {
      sessionId: this.sessionId,
      cookiesCount: Object.keys(this.cookies).length,
      localStorageCount: Object.keys(this.localStorage).length,
      sessionStorageCount: Object.keys(this.sessionStorage).length,
      created: this.metadata.created,
      lastAccessed: this.metadata.lastAccessed
    };
  }

  // Clear all session data
  clear() {
    this.cookies = {};
    this.localStorage = {};
    this.sessionStorage = {};
    this.metadata.lastAccessed = new Date();
    logger.debug('Session cleared');
  }

  // Merge another session into this one
  merge(otherSession) {
    Object.assign(this.cookies, otherSession.cookies);
    Object.assign(this.localStorage, otherSession.localStorage);
    Object.assign(this.sessionStorage, otherSession.sessionStorage);
    this.metadata.lastAccessed = new Date();
    logger.debug('Sessions merged');
  }
}

module.exports = Session;
