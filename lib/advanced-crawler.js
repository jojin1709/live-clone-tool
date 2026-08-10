const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

class AdvancedCrawler {
  constructor(config = {}) {
    this.config = config;
    this.visited = new Map();
    this.queue = [];
    this.cache = new Map();
    this.brokenLinks = [];
    this.stateFile = config.stateFile || '.crawl-state.json';
    this.cacheDir = config.cacheDir || '.crawl-cache';
    this.concurrency = config.concurrency || 5;
    this.activeRequests = 0;
    this.paused = false;
  }

  // Parallel crawling with concurrency control
  async crawlParallel(urls, handler) {
    const results = [];
    const queue = [...urls];

    const worker = async () => {
      while (queue.length > 0 && !this.paused) {
        if (this.activeRequests >= this.concurrency) {
          await this.delay(100);
          continue;
        }

        const url = queue.shift();
        if (!url || this.visited.has(url)) continue;

        this.activeRequests++;
        try {
          const result = await handler(url);
          this.visited.set(url, result);
          results.push(result);
        } catch (error) {
          logger.error('Crawl failed: ' + url);
        } finally {
          this.activeRequests--;
        }
      }
    };

    const workers = [];
    for (let i = 0; i < this.concurrency; i++) {
      workers.push(worker());
    }

    await Promise.all(workers);
    return results;
  }

  // Save crawl state for resume
  saveState() {
    const state = {
      visited: Object.fromEntries(this.visited),
      brokenLinks: this.brokenLinks,
      timestamp: new Date().toISOString()
    };
    fs.writeFileSync(this.stateFile, JSON.stringify(state, null, 2));
    logger.info('Crawl state saved');
  }

  // Load crawl state
  loadState() {
    if (fs.existsSync(this.stateFile)) {
      const state = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
      this.visited = new Map(Object.entries(state.visited));
      this.brokenLinks = state.brokenLinks || [];
      logger.info('Crawl state loaded: ' + this.visited.size + ' pages');
      return true;
    }
    return false;
  }

  // Clear state
  clearState() {
    this.visited.clear();
    this.brokenLinks = [];
    if (fs.existsSync(this.stateFile)) {
      fs.unlinkSync(this.stateFile);
    }
  }

  // Response caching
  getCacheKey(url, options = {}) {
    return url + JSON.stringify(options);
  }

  getFromCache(url, options = {}) {
    if (!this.config.useCache) return null;
    const key = this.getCacheKey(url, options);
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < (this.config.cacheTTL || 3600000)) {
      return cached.data;
    }
    return null;
  }

  setCache(url, data, options = {}) {
    if (!this.config.useCache) return;
    const key = this.getCacheKey(url, options);
    this.cache.set(key, { data, timestamp: Date.now() });

    // Save to disk
    if (this.cacheDir) {
      if (!fs.existsSync(this.cacheDir)) fs.mkdirSync(this.cacheDir, { recursive: true });
      const cacheFile = path.join(this.cacheDir, this.sanitizeFilename(key) + '.json');
      fs.writeFileSync(cacheFile, JSON.stringify({ url, data, timestamp: Date.now() }));
    }
  }

  loadCacheFromDisk() {
    if (!this.cacheDir || !fs.existsSync(this.cacheDir)) return;
    const files = fs.readdirSync(this.cacheDir);
    for (const file of files) {
      try {
        const content = JSON.parse(fs.readFileSync(path.join(this.cacheDir, file), 'utf8'));
        const key = content.url + '{}';
        this.cache.set(key, { data: content.data, timestamp: content.timestamp });
      } catch (e) {}
    }
    logger.info('Cache loaded: ' + this.cache.size + ' entries');
  }

  sanitizeFilename(name) {
    return name.replace(/[^a-z0-9]/gi, '_').substring(0, 100);
  }

  // Broken link detection
  async checkBrokenLinks(urls) {
    const results = [];
    const concurrency = this.concurrency || 10;
    const queue = [...urls];
    const checking = new Set();

    const check = async (url) => {
      if (checking.has(url)) return;
      checking.add(url);

      try {
        const response = await axios.head(url, {
          timeout: 10000,
          validateStatus: () => true,
          maxRedirects: 5
        });

        const result = {
          url,
          status: response.status,
          ok: response.status >= 200 && response.status < 400,
          redirectUrl: response.headers.location || null
        };

        if (!result.ok) {
          this.brokenLinks.push(result);
          logger.warn('Broken link: ' + url + ' (' + response.status + ')');
        }

        results.push(result);
      } catch (error) {
        const result = { url, status: 0, ok: false, error: error.message };
        this.brokenLinks.push(result);
        results.push(result);
      }
    };

    // Process in batches
    while (queue.length > 0) {
      const batch = queue.splice(0, concurrency);
      await Promise.all(batch.map(check));
    }

    return results;
  }

  // Get all links from HTML
  extractAllLinks(html, baseUrl) {
    const $ = cheerio.load(html);
    const links = new Set();

    $('a[href]').each((i, el) => {
      const href = $(el).attr('href');
      if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
        try {
          const fullUrl = new URL(href, baseUrl).href;
          links.add(fullUrl);
        } catch {}
      }
    });

    $('img[src], script[src], link[href]').each((i, el) => {
      const src = $(el).attr('src') || $(el).attr('href');
      if (src) {
        try {
          const fullUrl = new URL(src, baseUrl).href;
          links.add(fullUrl);
        } catch {}
      }
    });

    return Array.from(links);
  }

  // Crawl with all features
  async crawl(startUrl, options = {}) {
    const { maxPages = 100, depth = 1, resume = false, checkBroken = true } = options;

    if (resume) {
      this.loadState();
    }

    this.loadCacheFromDisk();
    
    const startTime = Date.now();
    const toVisit = [{ url: startUrl, depth: 0 }];
    const results = [];

    while (toVisit.length > 0 && this.visited.size < maxPages) {
      const { url, depth: currentDepth } = toVisit.shift();

      if (this.visited.has(url) || currentDepth > depth) continue;

      logger.info('Crawling: ' + url + ' (depth: ' + currentDepth + ')');

      // Check cache
      let response = this.getFromCache(url);
      if (!response) {
        try {
          const axiosConfig = {};
          if (this.config.proxy) axiosConfig.proxy = { host: this.config.proxy };
          if (this.config.timeout) axiosConfig.timeout = this.config.timeout;

          const res = await axios.get(url, {
            ...axiosConfig,
            headers: {
              'User-Agent': this.config.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          });

          response = { url, status: res.status, data: res.data, headers: res.headers };
          this.setCache(url, response);
        } catch (error) {
          logger.error('Failed to fetch: ' + url);
          this.visited.set(url, { error: error.message });
          continue;
        }
      }

      // Parse and extract links
      const links = this.extractAllLinks(response.data, url);
      
      for (const link of links) {
        if (!this.visited.has(link) && this.visited.size < maxPages) {
          toVisit.push({ url: link, depth: currentDepth + 1 });
        }
      }

      this.visited.set(url, {
        status: response.status,
        links: links.length,
        size: Buffer.byteLength(response.data, 'utf8'),
        depth: currentDepth
      });

      results.push({ url, ...this.visited.get(url) });

      // Rate limiting
      if (this.config.rateLimit) {
        await this.delay(this.config.rateLimit);
      }

      // Save state periodically
      if (this.visited.size % 10 === 0) {
        this.saveState();
      }
    }

    // Check broken links
    if (checkBroken) {
      const allLinks = [];
      for (const [url, data] of this.visited) {
        if (data.links) {
          allLinks.push(url);
        }
      }
      await this.checkBrokenLinks(allLinks.slice(0, 50));
    }

    const duration = Date.now() - startTime;
    logger.info('Crawl completed: ' + this.visited.size + ' pages in ' + (duration / 1000).toFixed(2) + 's');

    return {
      pages: results,
      brokenLinks: this.brokenLinks,
      stats: {
        total: this.visited.size,
        broken: this.brokenLinks.length,
        duration: duration
      }
    };
  }

  // Pause/Resume
  pause() {
    this.paused = true;
    logger.info('Crawler paused');
  }

  resume() {
    this.paused = false;
    logger.info('Crawler resumed');
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = AdvancedCrawler;
