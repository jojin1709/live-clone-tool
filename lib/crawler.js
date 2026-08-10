const axios = require('axios');
const cheerio = require('cheerio');
const url = require('url');
const path = require('path');
const logger = require('./logger');

class Crawler {
  constructor(config) {
    this.config = config;
    this.visited = new Set();
    this.queue = [];
    this.pages = [];
    this.cookies = {};
    this.userAgent = this.getUserAgent();
  }

  getUserAgent() {
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 OPR/106.0.0.0'
    ];
    return userAgents[Math.floor(Math.random() * userAgents.length)];
  }

  getHeaders() {
    const headers = {
      'User-Agent': this.config.security?.rotateUserAgent ? this.getUserAgent() : (this.config.userAgent || this.userAgent),
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1'
    };

    // Merge custom headers
    if (this.config.headers) {
      Object.assign(headers, this.config.headers);
    }

    // Randomize headers if anti-fingerprint enabled
    if (this.config.security?.randomizeHeaders) {
      headers['Accept-Language'] = this.getRandomAcceptLanguage();
    }

    // Add auth headers
    if (this.config.auth?.type === 'basic') {
      const auth = Buffer.from(`${this.config.auth.username}:${this.config.auth.password}`).toString('base64');
      headers['Authorization'] = `Basic ${auth}`;
    } else if (this.config.auth?.type === 'token' && this.config.auth.token) {
      headers[this.config.auth.tokenHeader || 'Authorization'] = `Bearer ${this.config.auth.token}`;
    }

    return headers;
  }

  getRandomAcceptLanguage() {
    const languages = [
      'en-US,en;q=0.9',
      'en-GB,en;q=0.9',
      'en-AU,en;q=0.9',
      'fr-FR,fr;q=0.9',
      'de-DE,de;q=0.9',
      'es-ES,es;q=0.9',
      'pt-BR,pt;q=0.9',
      'ja-JP,ja;q=0.9',
      'ko-KR,ko;q=0.9',
      'zh-CN,zh;q=0.9'
    ];
    return languages[Math.floor(Math.random() * languages.length)];
  }

  async fetch(targetUrl) {
    const startTime = Date.now();
    logger.logRequest(targetUrl, 'GET');

    try {
      const response = await axios({
        method: 'GET',
        url: targetUrl,
        headers: this.getHeaders(),
        timeout: this.config.timeout || 30000,
        responseType: 'text',
        maxRedirects: 5,
        validateStatus: (status) => status < 500
      });

      const duration = Date.now() - startTime;
      const size = Buffer.byteLength(response.data, 'utf8');
      
      logger.logResponse(targetUrl, response.status, size);

      // Store cookies
      if (response.headers['set-cookie']) {
        this.storeCookies(targetUrl, response.headers['set-cookie']);
      }

      return {
        url: targetUrl,
        status: response.status,
        headers: response.headers,
        data: response.data,
        size,
        duration
      };
    } catch (error) {
      logger.logError(error, { url: targetUrl });
      throw error;
    }
  }

  storeCookies(urlStr, setCookieHeaders) {
    const parsed = new URL(urlStr);
    const domain = parsed.hostname;
    
    if (!this.cookies[domain]) {
      this.cookies[domain] = {};
    }

    for (const cookie of setCookieHeaders) {
      const parts = cookie.split(';')[0].split('=');
      if (parts.length >= 2) {
        const name = parts[0].trim();
        const value = parts.slice(1).join('=').trim();
        this.cookies[domain][name] = value;
      }
    }
  }

  getCookiesForDomain(domain) {
    if (!this.cookies[domain]) {
      return '';
    }
    return Object.entries(this.cookies[domain])
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
  }

  shouldCrawl(pageUrl, currentUrl) {
    // Check if already visited
    if (this.visited.has(pageUrl)) {
      return false;
    }

    // Check max pages
    if (this.config.maxPages && this.visited.size >= this.config.maxPages) {
      return false;
    }

    const parsed = new URL(pageUrl);
    const current = new URL(currentUrl);

    // Check if external
    if (parsed.hostname !== current.hostname) {
      if (!this.config.followExternal) {
        return false;
      }
    }

    // Check include patterns
    if (this.config.includePatterns && this.config.includePatterns.length > 0) {
      const matches = this.config.includePatterns.some(pattern => {
        if (pattern instanceof RegExp) {
          return pattern.test(pageUrl);
        }
        return pageUrl.includes(pattern);
      });
      if (!matches) {
        return false;
      }
    }

    // Check exclude patterns
    if (this.config.excludePatterns && this.config.excludePatterns.length > 0) {
      const matches = this.config.excludePatterns.some(pattern => {
        if (pattern instanceof RegExp) {
          return pattern.test(pageUrl);
        }
        return pageUrl.includes(pattern);
      });
      if (matches) {
        return false;
      }
    }

    // Check file extensions
    const excludeExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.ico', '.pdf', '.zip', '.exe'];
    if (excludeExtensions.some(ext => pageUrl.toLowerCase().endsWith(ext))) {
      return false;
    }

    return true;
  }

  extractLinks(html, baseUrl) {
    const $ = cheerio.load(html);
    const links = new Set();

    // Extract from anchor tags
    $('a[href]').each((i, el) => {
      const href = $(el).attr('href');
      if (href) {
        const fullUrl = this.resolveUrl(baseUrl, href);
        if (fullUrl) {
          links.add(fullUrl);
        }
      }
    });

    // Extract from script tags (for dynamic content hints)
    $('script[src]').each((i, el) => {
      const src = $(el).attr('src');
      if (src) {
        const fullUrl = this.resolveUrl(baseUrl, src);
        if (fullUrl) {
          links.add(fullUrl);
        }
      }
    });

    // Extract from link tags
    $('link[href]').each((i, el) => {
      const href = $(el).attr('href');
      if (href) {
        const fullUrl = this.resolveUrl(baseUrl, href);
        if (fullUrl) {
          links.add(fullUrl);
        }
      }
    });

    return Array.from(links);
  }

  resolveUrl(baseUrl, relativeUrl) {
    try {
      return new URL(relativeUrl, baseUrl).href;
    } catch {
      return null;
    }
  }

  async crawl(startUrl, depth = 0) {
    if (depth > (this.config.depth || 1)) {
      return this.pages;
    }

    if (!this.shouldCrawl(startUrl, startUrl)) {
      return this.pages;
    }

    this.visited.add(startUrl);
    logger.logClone(startUrl, depth);

    try {
      const response = await this.fetch(startUrl);
      
      // Store page info
      const pageInfo = {
        url: startUrl,
        depth,
        status: response.status,
        size: response.size,
        html: response.data,
        links: []
      };

      // Extract links if we need to crawl deeper
      if (depth < (this.config.depth || 1)) {
        const links = this.extractLinks(response.data, startUrl);
        pageInfo.links = links;

        // Add valid links to queue
        for (const link of links) {
          if (this.shouldCrawl(link, startUrl)) {
            this.queue.push({ url: link, depth: depth + 1 });
          }
        }
      }

      this.pages.push(pageInfo);

      // Process queue
      while (this.queue.length > 0 && this.visited.size < (this.config.maxPages || 100)) {
        const next = this.queue.shift();
        if (!this.visited.has(next.url)) {
          // Rate limiting
          if (this.config.rateLimit && this.config.rateLimit > 0) {
            await this.delay(this.config.rateLimit);
          }
          await this.crawl(next.url, next.depth);
        }
      }

    } catch (error) {
      logger.logError(error, { url: startUrl });
    }

    return this.pages;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getVisitedPages() {
    return this.pages;
  }

  getVisitedUrls() {
    return Array.from(this.visited);
  }

  getCookies() {
    return this.cookies;
  }

  reset() {
    this.visited.clear();
    this.queue = [];
    this.pages = [];
    this.cookies = {};
  }
}

module.exports = Crawler;
