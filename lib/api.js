const express = require('express');
const logger = require('./logger');

class APIServer {
  constructor(config = {}) {
    this.config = config;
    this.app = express();
    this.server = null;
    this.routes = [];
    this.middleware = [];

    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // CORS
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      if (req.method === 'OPTIONS') return res.sendStatus(200);
      next();
    });

    // Request logging
    this.app.use((req, res, next) => {
      logger.debug('API Request: ' + req.method + ' ' + req.url);
      next();
    });

    this.setupDefaultRoutes();
  }

  setupDefaultRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // Info
    this.app.get('/info', (req, res) => {
      res.json({
        name: 'Living Clone API',
        version: '2.0.0',
        endpoints: this.routes.map(r => ({ method: r.method, path: r.path, description: r.description }))
      });
    });
  }

  // Add route
  addRoute(config) {
    const { method = 'GET', path, handler, description = '', middleware = [] } = config;
    
    const routeHandler = async (req, res) => {
      try {
        const result = await handler(req, res);
        if (!res.headersSent) {
          res.json(result);
        }
      } catch (error) {
        logger.error('API Error: ' + error.message);
        if (!res.headersSent) {
          res.status(500).json({ error: error.message });
        }
      }
    };

    this.app[method.toLowerCase()](path, ...middleware, routeHandler);
    this.routes.push({ method, path, description, handler });

    logger.debug('API route added: ' + method + ' ' + path);
  }

  // Add middleware
  addMiddleware(middleware) {
    this.app.use(middleware);
    this.middleware.push(middleware);
  }

  // Clone endpoint
  setupCloneEndpoint(crawler) {
    this.addRoute({
      method: 'POST',
      path: '/api/clone',
      description: 'Clone a website',
      handler: async (req, res) => {
        const { url, depth = 1, options = {} } = req.body;
        
        if (!url) {
          return res.status(400).json({ error: 'URL is required' });
        }

        logger.info('API Clone request: ' + url);
        
        const result = await crawler.crawl(url, { depth, ...options });
        return result;
      }
    });
  }

  // Security scan endpoint
  setupSecurityEndpoint(scanner) {
    this.addRoute({
      method: 'POST',
      path: '/api/scan',
      description: 'Run security scan',
      handler: async (req, res) => {
        const { url } = req.body;
        
        if (!url) {
          return res.status(400).json({ error: 'URL is required' });
        }

        logger.info('API Scan request: ' + url);
        
        const result = await scanner.scan(url);
        return result;
      }
    });
  }

  // Batch endpoint
  setupBatchEndpoint(batchManager) {
    this.addRoute({
      method: 'POST',
      path: '/api/batch',
      description: 'Batch clone multiple URLs',
      handler: async (req, res) => {
        const { urls, options = {} } = req.body;
        
        if (!urls || !Array.isArray(urls)) {
          return res.status(400).json({ error: 'URLs array is required' });
        }

        logger.info('API Batch request: ' + urls.length + ' URLs');
        
        const results = await batchManager.batchClone(urls, async (url) => {
          return { url, status: 'processed' };
        }, options);

        return { results, total: urls.length };
      }
    });
  }

  // Session endpoint
  setupSessionEndpoint(session) {
    this.addRoute({
      method: 'GET',
      path: '/api/session',
      description: 'Get session info',
      handler: async () => {
        return session.getSummary();
      }
    });

    this.addRoute({
      method: 'POST',
      path: '/api/session/cookies',
      description: 'Set cookie',
      handler: async (req) => {
        const { name, value, domain, path: cookiePath } = req.body;
        session.setCookie(name, value, { domain, path: cookiePath });
        return { success: true };
      }
    });
  }

  // Export endpoint
  setupExportEndpoint(exportManager) {
    this.addRoute({
      method: 'POST',
      path: '/api/export',
      description: 'Export clone data',
      handler: async (req, res) => {
        const { type, data, outputPath } = req.body;
        
        switch (type) {
          case 'zip':
            return await exportManager.toZip(data.sourceDir, outputPath);
          case 'pdf':
            return await exportManager.toPdf(data, outputPath);
          case 'html':
            return exportManager.toHtml(data, outputPath);
          case 'json':
            return exportManager.toJson(data, outputPath);
          default:
            return res.status(400).json({ error: 'Invalid export type' });
        }
      }
    });
  }

  // Start server
  start(port = 3000, host = '0.0.0.0') {
    return new Promise((resolve) => {
      this.server = this.app.listen(port, host, () => {
        logger.info('API Server running on ' + host + ':' + port);
        resolve(this.server);
      });
    });
  }

  // Stop server
  stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(resolve);
      } else {
        resolve();
      }
    });
  }

  // Get Express app
  getApp() {
    return this.app;
  }
}

module.exports = APIServer;
