const logger = require('./logger');
const fs = require('fs');
const path = require('path');

class BrowserCloner {
  constructor(config = {}) {
    this.config = config;
    this.browser = null;
    this.page = null;
    this.puppeteer = null;
  }

  async init() {
    try {
      this.puppeteer = require('puppeteer');
      return true;
    } catch (e) {
      logger.warn('Puppeteer not installed. Run: npm install puppeteer');
      return false;
    }
  }

  async launch(options = {}) {
    if (!this.puppeteer) await this.init();
    
    this.browser = await this.puppeteer.launch({
      headless: options.headless !== false ? 'new' : false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu',
        ...(options.proxy ? [`--proxy-server=${options.proxy}`] : []),
        ...(options.args || [])
      ],
      defaultViewport: { width: options.width || 1920, height: options.height || 1080 }
    });

    this.page = await this.browser.newPage();
    
    // Set user agent
    await this.page.setUserAgent(options.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Set extra headers
    if (options.headers) {
      await this.page.setExtraHTTPHeaders(options.headers);
    }

    // Emulate device
    if (options.emulate) {
      const devices = require('puppeteer').KnownDevices;
      if (devices[options.emulate]) {
        await this.page.emulate(devices[options.emulate]);
      }
    }

    // Set viewport
    if (options.width && options.height) {
      await this.page.setViewport({ width: options.width, height: options.height });
    }

    // Cookie support
    if (options.cookies && options.cookies.length > 0) {
      await this.page.setCookie(...options.cookies);
    }

    logger.info('Browser launched');
    return this;
  }

  async clone(url, options = {}) {
    const {
      waitFor = 3000,
      waitUntil = 'networkidle2',
      scroll = false,
      clickElements = [],
      fillForms = {},
      screenshot = false,
      extractData = false
    } = options;

    const startTime = Date.now();
    logger.info('Cloning with browser: ' + url);

    try {
      // Navigate to page
      await this.page.goto(url, { waitUntil, timeout: options.timeout || 30000 });

      // Wait for content
      if (typeof waitFor === 'number') {
        await this.delay(waitFor);
      } else if (typeof waitFor === 'string') {
        try {
          await this.page.waitForSelector(waitFor, { timeout: 10000 });
        } catch (e) {
          logger.debug('Wait selector timeout: ' + waitFor);
        }
      }

      // Scroll to load lazy content
      if (scroll) {
        await this.autoScroll();
      }

      // Click elements
      for (const selector of clickElements) {
        try {
          await this.page.click(selector);
          await this.delay(500);
        } catch (e) {
          logger.debug('Click failed: ' + selector);
        }
      }

      // Fill forms
      for (const [selector, value] of Object.entries(fillForms)) {
        try {
          await this.page.type(selector, value);
        } catch (e) {
          logger.debug('Type failed: ' + selector);
        }
      }

      // Wait for network idle
      await this.page.waitForNetworkIdle({ timeout: 5000 }).catch(() => {});

      // Get page content
      const html = await this.page.content();
      
      // Get all resources
      const resources = await this.page.evaluate(() => {
        const res = [];
        document.querySelectorAll('link[href]').forEach(el => {
          res.push({ type: 'css', url: el.href });
        });
        document.querySelectorAll('script[src]').forEach(el => {
          res.push({ type: 'js', url: el.src });
        });
        document.querySelectorAll('img[src]').forEach(el => {
          res.push({ type: 'image', url: el.src });
        });
        return res;
      });

      // Take screenshot
      let screenshotPath = null;
      if (screenshot) {
        screenshotPath = path.join(options.outputDir || '.', 'screenshot.png');
        await this.page.screenshot({ path: screenshotPath, fullPage: true });
      }

      // Extract data
      let extractedData = null;
      if (extractData) {
        extractedData = await this.extractPageData();
      }

      // Get cookies
      const cookies = await this.page.cookies();

      // Get console logs
      const consoleLogs = [];
      this.page.on('console', msg => consoleLogs.push(msg.text()));

      // Get network requests
      const networkRequests = [];
      this.page.on('request', req => {
        networkRequests.push({ url: req.url(), method: req.method() });
      });

      const duration = Date.now() - startTime;

      return {
        url,
        html,
        resources,
        cookies,
        screenshotPath,
        extractedData,
        consoleLogs,
        networkRequests,
        duration,
        title: await this.page.title(),
        viewport: this.page.viewport()
      };

    } catch (error) {
      logger.error('Browser clone failed: ' + error.message);
      throw error;
    }
  }

  async autoScroll() {
    await this.page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        const distance = 100;
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;
          if (totalHeight >= scrollHeight) {
            clearInterval(timer);
            resolve();
          }
        }, 100);
      });
    });
  }

  async extractPageData() {
    return await this.page.evaluate(() => {
      const data = {};
      
      // Meta tags
      data.meta = {};
      document.querySelectorAll('meta').forEach(meta => {
        const name = meta.getAttribute('name') || meta.getAttribute('property');
        if (name) data.meta[name] = meta.getAttribute('content');
      });

      // Title
      data.title = document.title;

      // Links
      data.links = Array.from(document.querySelectorAll('a[href]')).map(a => ({
        text: a.textContent.trim(),
        href: a.href
      }));

      // Images
      data.images = Array.from(document.querySelectorAll('img')).map(img => ({
        src: img.src,
        alt: img.alt,
        width: img.naturalWidth,
        height: img.naturalHeight
      }));

      // Forms
      data.forms = Array.from(document.querySelectorAll('form')).map(form => ({
        action: form.action,
        method: form.method,
        fields: Array.from(form.elements).map(el => ({
          name: el.name,
          type: el.type,
          required: el.required
        }))
      }));

      // Text content
      data.text = document.body.innerText.substring(0, 5000);

      // Scripts
      data.scripts = Array.from(document.querySelectorAll('script[src]')).map(s => s.src);

      // Styles
      data.styles = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(l => l.href);

      return data;
    });
  }

  async interceptRequests(handler) {
    await this.page.setRequestInterception(true);
    this.page.on('request', request => {
      const result = handler(request);
      if (result === false) {
        request.abort();
      } else if (result) {
        request.continue(result);
      } else {
        request.continue();
      }
    });
  }

  async setCookies(cookies) {
    await this.page.setCookie(...cookies);
  }

  async getCookies() {
    return await this.page.cookies();
  }

  async evaluate(fn) {
    return await this.page.evaluate(fn);
  }

  async screenshot(options = {}) {
    return await this.page.screenshot(options);
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      logger.info('Browser closed');
    }
  }
}

module.exports = BrowserCloner;
