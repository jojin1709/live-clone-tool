const logger = require('./logger');
const EventEmitter = require('eventemitter3');

class Interceptor extends EventEmitter {
  constructor() {
    super();
    this.requestInterceptors = [];
    this.responseInterceptors = [];
    this.requestLog = [];
    this.responseLog = [];
    this.networkLog = [];
  }

  // Request interception
  addRequestInterceptor(interceptor) {
    const id = Date.now().toString();
    const wrappedInterceptor = {
      id,
      name: interceptor.name || 'unnamed',
      handler: interceptor.handler,
      priority: interceptor.priority || 0,
      enabled: interceptor.enabled !== false,
      match: interceptor.match || null
    };
    
    this.requestInterceptors.push(wrappedInterceptor);
    this.requestInterceptors.sort((a, b) => b.priority - a.priority);
    
    logger.debug(`Request interceptor added: ${wrappedInterceptor.name}`);
    this.emit('interceptor:added', { type: 'request', interceptor: wrappedInterceptor });
    
    return id;
  }

  removeRequestInterceptor(id) {
    const index = this.requestInterceptors.findIndex(i => i.id === id);
    if (index !== -1) {
      const removed = this.requestInterceptors.splice(index, 1)[0];
      logger.debug(`Request interceptor removed: ${removed.name}`);
      this.emit('interceptor:removed', { type: 'request', interceptor: removed });
      return true;
    }
    return false;
  }

  // Response interception
  addResponseInterceptor(interceptor) {
    const id = Date.now().toString();
    const wrappedInterceptor = {
      id,
      name: interceptor.name || 'unnamed',
      handler: interceptor.handler,
      priority: interceptor.priority || 0,
      enabled: interceptor.enabled !== false,
      match: interceptor.match || null
    };
    
    this.responseInterceptors.push(wrappedInterceptor);
    this.responseInterceptors.sort((a, b) => b.priority - a.priority);
    
    logger.debug(`Response interceptor added: ${wrappedInterceptor.name}`);
    this.emit('interceptor:added', { type: 'response', interceptor: wrappedInterceptor });
    
    return id;
  }

  removeResponseInterceptor(id) {
    const index = this.responseInterceptors.findIndex(i => i.id === id);
    if (index !== -1) {
      const removed = this.responseInterceptors.splice(index, 1)[0];
      logger.debug(`Response interceptor removed: ${removed.name}`);
      this.emit('interceptor:removed', { type: 'response', interceptor: removed });
      return true;
    }
    return false;
  }

  // Process request through interceptors
  async processRequest(request) {
    let modifiedRequest = { ...request };
    
    // Log original request
    this.requestLog.push({
      timestamp: new Date(),
      url: request.url,
      method: request.method,
      headers: { ...request.headers },
      body: request.body
    });

    for (const interceptor of this.requestInterceptors) {
      if (!interceptor.enabled) continue;
      
      // Check match pattern
      if (interceptor.match && !this.matchesPattern(request.url, interceptor.match)) {
        continue;
      }

      try {
        const result = await interceptor.handler(modifiedRequest);
        
        if (result === false) {
          logger.debug(`Request blocked by interceptor: ${interceptor.name}`);
          this.emit('request:blocked', { request: modifiedRequest, interceptor: interceptor.name });
          return null;
        }
        
        if (result && typeof result === 'object') {
          modifiedRequest = { ...modifiedRequest, ...result };
        }
        
        this.emit('request:modified', { request: modifiedRequest, interceptor: interceptor.name });
      } catch (error) {
        logger.error(`Interceptor error: ${interceptor.name}`, { error: error.message });
      }
    }

    return modifiedRequest;
  }

  // Process response through interceptors
  async processResponse(response) {
    let modifiedResponse = { ...response };
    
    // Log original response
    this.responseLog.push({
      timestamp: new Date(),
      url: response.url,
      status: response.status,
      headers: { ...response.headers },
      size: response.data ? Buffer.byteLength(response.data) : 0
    });

    for (const interceptor of this.responseInterceptors) {
      if (!interceptor.enabled) continue;
      
      // Check match pattern
      if (interceptor.match && !this.matchesPattern(response.url, interceptor.match)) {
        continue;
      }

      try {
        const result = await interceptor.handler(modifiedResponse);
        
        if (result === false) {
          logger.debug(`Response blocked by interceptor: ${interceptor.name}`);
          this.emit('response:blocked', { response: modifiedResponse, interceptor: interceptor.name });
          return null;
        }
        
        if (result && typeof result === 'object') {
          modifiedResponse = { ...modifiedResponse, ...result };
        }
        
        this.emit('response:modified', { response: modifiedResponse, interceptor: interceptor.name });
      } catch (error) {
        logger.error(`Interceptor error: ${interceptor.name}`, { error: error.message });
      }
    }

    return modifiedResponse;
  }

  // Network logging
  logNetworkActivity(activity) {
    const entry = {
      timestamp: new Date(),
      ...activity
    };
    
    this.networkLog.push(entry);
    this.emit('network:activity', entry);
  }

  // Pattern matching
  matchesPattern(url, pattern) {
    if (pattern instanceof RegExp) {
      return pattern.test(url);
    }
    
    if (typeof pattern === 'string') {
      if (pattern.includes('*')) {
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        return regex.test(url);
      }
      return url.includes(pattern);
    }
    
    if (Array.isArray(pattern)) {
      return pattern.some(p => this.matchesPattern(url, p));
    }
    
    return false;
  }

  // Clear logs
  clearLogs() {
    this.requestLog = [];
    this.responseLog = [];
    this.networkLog = [];
    logger.debug('Interceptor logs cleared');
  }

  // Get logs
  getLogs(type = 'all') {
    switch (type) {
      case 'request':
        return this.requestLog;
      case 'response':
        return this.responseLog;
      case 'network':
        return this.networkLog;
      default:
        return {
          requests: this.requestLog,
          responses: this.responseLog,
          network: this.networkLog
        };
    }
  }

  // Export logs
  exportLogs(filePath, format = 'json') {
    const logs = this.getLogs();
    
    let content;
    if (format === 'json') {
      content = JSON.stringify(logs, null, 2);
    } else if (format === 'csv') {
      content = this.logsToCsv(logs);
    } else {
      content = JSON.stringify(logs, null, 2);
    }

    require('fs').writeFileSync(filePath, content, 'utf8');
    logger.info(`Logs exported to ${filePath}`);
  }

  logsToCsv(logs) {
    const lines = ['Timestamp,Type,URL,Method,Status,Size'];
    
    for (const req of logs.requests || []) {
      lines.push(`${req.timestamp.toISOString()},REQUEST,${req.url},${req.method},,`);
    }
    
    for (const res of logs.responses || []) {
      lines.push(`${res.timestamp.toISOString()},RESPONSE,${res.url},,${res.status},${res.size}`);
    }
    
    return lines.join('\n');
  }

  // Get statistics
  getStats() {
    const requests = this.requestLog;
    const responses = this.responseLog;
    
    const stats = {
      totalRequests: requests.length,
      totalResponses: responses.length,
      blockedRequests: 0,
      blockedResponses: 0,
      modifiedRequests: 0,
      modifiedResponses: 0,
      averageResponseSize: 0,
      statusCodes: {},
      domains: {}
    };

    // Count status codes
    for (const res of responses) {
      stats.statusCodes[res.status] = (stats.statusCodes[res.status] || 0) + 1;
    }

    // Count domains
    for (const req of requests) {
      try {
        const domain = new URL(req.url).hostname;
        stats.domains[domain] = (stats.domains[domain] || 0) + 1;
      } catch {}
    }

    // Calculate average response size
    if (responses.length > 0) {
      const totalSize = responses.reduce((sum, res) => sum + (res.size || 0), 0);
      stats.averageResponseSize = Math.round(totalSize / responses.length);
    }

    return stats;
  }

  // Clear all interceptors
  clear() {
    this.requestInterceptors = [];
    this.responseInterceptors = [];
    this.clearLogs();
    logger.debug('All interceptors cleared');
  }
}

// Pre-defined interceptors
Interceptor.presets = {
  // Log all requests
  logger: {
    name: 'logger',
    handler: (request) => {
      logger.debug(`Request: ${request.method} ${request.url}`);
      return request;
    }
  },

  // Block images
  blockImages: {
    name: 'blockImages',
    match: ['*.jpg', '*.jpeg', '*.png', '*.gif', '*.svg', '*.webp'],
    handler: () => false
  },

  // Block tracking scripts
  blockTracking: {
    name: 'blockTracking',
    match: ['*analytics*', '*tracking*', '*facebook*', '*google-analytics*'],
    handler: () => false
  },

  // Add custom header to all requests
  addHeader: (headerName, headerValue) => ({
    name: `addHeader-${headerName}`,
    handler: (request) => {
      request.headers = request.headers || {};
      request.headers[headerName] = headerValue;
      return request;
    }
  }),

  // Modify User-Agent
  setUserAgent: (userAgent) => ({
    name: 'setUserAgent',
    handler: (request) => {
      request.headers = request.headers || {};
      request.headers['User-Agent'] = userAgent;
      return request;
    }
  }),

  // Log all HTML responses
  logHtml: {
    name: 'logHtml',
    match: ['*.html', '*'],
    handler: (response) => {
      if (response.headers && response.headers['content-type']?.includes('text/html')) {
        logger.debug(`HTML Response: ${response.url} (${response.data?.length || 0} bytes)`);
      }
      return response;
    }
  }
};

module.exports = Interceptor;
