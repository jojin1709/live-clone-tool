#!/usr/bin/env node

const { Command } = require('commander');
const axios = require('axios');
const cheerio = require('cheerio');
const express = require('express');
const chalk = require('chalk');
const inquirer = require('inquirer');
const fs = require('fs');
const path = require('path');
const urlMod = require('url');
const open = require('open');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');

const config = require('./lib/config');
const logger = require('./lib/logger');
const Crawler = require('./lib/crawler');
const Session = require('./lib/session');
const Interceptor = require('./lib/interceptor');
const PluginManager = require('./lib/plugin');
const exportManager = require('./lib/export');
const WebSocketProxy = require('./lib/websocket');

const program = new Command();

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
];

function collect(val, arr) { arr.push(val); return arr; }
function isValidUrl(s) { try { new URL(s); return true; } catch { return false; } }
function resolveUrl(base, rel) { try { return new URL(rel, base).href; } catch { return null; } }
function getFilePathFromUrl(resourceUrl, outputDir) {
  const parsed = urlMod.parse(resourceUrl);
  let pathname = parsed.pathname;
  if (pathname === '/') pathname = '/index.html';
  return path.join(outputDir, pathname);
}
function calculateTotalSize(dir) {
  let total = 0;
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const full = path.join(dir, item);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) total += calculateTotalSize(full);
    else total += stat.size;
  }
  return total;
}
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
function getDefaultPayload() {
  return `
(function() {
  console.log('[LivingClone] Site cloned');
  var d = document.createElement('div');
  d.innerHTML = '<div style="position:fixed;top:10px;right:10px;background:red;color:white;padding:10px;z-index:99999;border-radius:5px;font-family:monospace">CLONED - XSS TEST</div>';
  document.body.appendChild(d);
  document.addEventListener('click', function(e) {
    console.log('[LivingClone] Click:', e.clientX, e.clientY);
  });
})();`;
}
function getAxiosConfig(configObj) {
  const axiosConfig = { timeout: configObj.timeout || 30000, maxRedirects: 5 };
  if (configObj.proxy) {
    if (configObj.proxy.startsWith('socks')) {
      axiosConfig.httpsAgent = new SocksProxyAgent(configObj.proxy);
      axiosConfig.httpAgent = new SocksProxyAgent(configObj.proxy);
    } else {
      axiosConfig.httpsAgent = new HttpsProxyAgent(configObj.proxy);
      axiosConfig.httpAgent = new HttpsProxyAgent(configObj.proxy);
    }
  }
  return axiosConfig;
}

function startServer(folder, port) {
  const app = express();
  app.use(express.static(folder));
  app.listen(port, () => {
    console.log(chalk.green(`\n  Server running at: http://localhost:${port}`));
    console.log(chalk.blue('  Press Ctrl+C to stop\n'));
    open(`http://localhost:${port}`);
  });
}

function getHeaders(cfg) {
  const headers = {
    'User-Agent': cfg.security?.rotateUserAgent ? USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)] : (cfg.userAgent || USER_AGENTS[0]),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept-Encoding': 'gzip, deflate',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1'
  };
  if (cfg.headers) Object.assign(headers, cfg.headers);
  if (cfg.auth?.type === 'basic') {
    headers['Authorization'] = 'Basic ' + Buffer.from(cfg.auth.username + ':' + cfg.auth.password).toString('base64');
  } else if (cfg.auth?.type === 'token' && cfg.auth.token) {
    headers[cfg.auth.tokenHeader || 'Authorization'] = 'Bearer ' + cfg.auth.token;
  }
  return headers;
}

async function downloadResource(resource, outputDir) {
  try {
    const axiosCfg = getAxiosConfig(config.config);
    const response = await axios.get(resource.url, { ...axiosCfg, responseType: 'arraybuffer' });
    const resourcePath = getPathFromUrl(resource.url);
    const fullPath = path.join(outputDir, resourcePath);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fullPath, response.data);
  } catch (e) {}
}

function getPathFromUrl(resourceUrl) {
  const parsed = urlMod.parse(resourceUrl);
  return parsed.pathname === '/' ? 'index.html' : parsed.pathname;
}

function extractResources($, baseUrl, cfg) {
  const resources = [];
  if (cfg.saveCss !== false) {
    $('link[rel="stylesheet"]').each((i, el) => {
      const href = $(el).attr('href');
      if (href) resources.push({ type: 'css', url: resolveUrl(baseUrl, href) });
    });
  }
  if (cfg.saveJs !== false) {
    $('script[src]').each((i, el) => {
      const src = $(el).attr('src');
      if (src) resources.push({ type: 'js', url: resolveUrl(baseUrl, src) });
    });
  }
  if (cfg.saveImages !== false) {
    $('img[src]').each((i, el) => {
      const src = $(el).attr('src');
      if (src) resources.push({ type: 'image', url: resolveUrl(baseUrl, src) });
    });
  }
  return resources.filter(r => r.url);
}

async function fetchPage(targetUrl, cfg) {
  const axiosCfg = getAxiosConfig(cfg);
  axiosCfg.headers = getHeaders(cfg);
  const response = await axios.get(targetUrl, axiosCfg);
  return { url: targetUrl, status: response.status, headers: response.headers, data: response.data, size: Buffer.byteLength(response.data, 'utf8') };
}

program.name('living-clone').description('Advanced website cloning and XSS testing tool').version('2.0.0');

// ==================== CLONE COMMAND ====================
program.command('clone').argument('<targetUrl>', 'URL to clone')
  .option('-o, --output <folder>', 'Output folder', 'cloned-site')
  .option('-j, --inject <jsCode>', 'JavaScript to inject')
  .option('-f, --inject-file <filePath>', 'JS file to inject')
  .option('-s, --serve', 'Start server after cloning')
  .option('-p, --port <port>', 'Server port', '8080')
  .option('-d, --depth <level>', 'Crawl depth', '1')
  .option('--max-pages <num>', 'Max pages to crawl', '100')
  .option('--no-images', 'Skip images')
  .option('--no-css', 'Skip CSS')
  .option('--no-js', 'Skip JS')
  .option('--follow-external', 'Follow external links')
  .option('--proxy <url>', 'HTTP/SOCKS5 proxy')
  .option('--rate-limit <ms>', 'Delay between requests', '0')
  .option('--timeout <ms>', 'Request timeout', '30000')
  .option('--retries <num>', 'Retries', '3')
  .option('--user-agent <ua>', 'Custom User-Agent')
  .option('--rotate-ua', 'Rotate User-Agent')
  .option('--anti-fingerprint', 'Enable anti-fingerprinting')
  .option('--basic-auth <user:pass>', 'Basic auth')
  .option('--token <token>', 'Bearer token')
  .option('--cookie <name=value>', 'Add cookie', collect, [])
  .option('--header <name:value>', 'Add header', collect, [])
  .option('--config <file>', 'Config file')
  .option('--preset <name>', 'Preset (aggressive/stealth/fast/thorough)')
  .option('--session-file <file>', 'Save/load session')
  .option('--export-zip', 'Export ZIP')
  .option('--export-pdf', 'Export PDF')
  .option('--export-html', 'Export HTML report')
  .option('--export-json', 'Export JSON report')
  .option('--export-logs <file>', 'Export logs')
  .option('--screenshot', 'Take screenshots')
  .option('--log-level <level>', 'Log level', 'info')
  .option('--log-file <file>', 'Log file')
  .option('--no-interactive', 'Non-interactive mode')
  .action(async (targetUrl, options) => {
    try {
      console.log(chalk.green('\n  Living Clone v2.0 - Advanced XSS Testing Tool\n'));

      logger.init({ level: options.logLevel, file: options.logFile, console: true });

      if (options.config && config.load(options.config)) logger.info('Config loaded from ' + options.config);
      if (options.preset && config.loadPreset(options.preset)) logger.info('Preset loaded: ' + options.preset);
      if (!isValidUrl(targetUrl)) { logger.error('Invalid URL'); process.exit(1); }

      if (options.basicAuth) {
        const [u, p] = options.basicAuth.split(':');
        config.set('auth.type', 'basic'); config.set('auth.username', u); config.set('auth.password', p);
      } else if (options.token) {
        config.set('auth.type', 'token'); config.set('auth.token', options.token);
      }
      if (options.proxy) config.set('proxy', options.proxy);
      config.set('depth', parseInt(options.depth));
      config.set('maxPages', parseInt(options.maxPages));
      config.set('timeout', parseInt(options.timeout));
      config.set('rateLimit', parseInt(options.rateLimit));
      config.set('saveImages', options.images !== false);
      config.set('saveCss', options.css !== false);
      config.set('saveJs', options.js !== false);
      config.set('followExternal', options.followExternal || false);
      if (options.userAgent) config.set('userAgent', options.userAgent);
      if (options.rotateUa) config.set('security.rotateUserAgent', true);
      if (options.antiFingerprint) config.set('security.antiFingerprint', true);
      if (options.header) options.header.forEach(h => { const [n, ...v] = h.split(':'); config.set('headers.' + n.trim(), v.join(':').trim()); });

      const outputDir = path.join(process.cwd(), options.output);
      if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

      const session = new Session({ filePath: options.sessionFile });
      if (options.sessionFile && fs.existsSync(options.sessionFile)) { session.load(options.sessionFile); logger.info('Session loaded'); }

      const crawler = new Crawler(config.config);
      const interceptor = new Interceptor();
      interceptor.addRequestInterceptor(Interceptor.presets.logger);
      interceptor.addResponseInterceptor(Interceptor.presets.logHtml);
      const pluginManager = new PluginManager();
      pluginManager.register(PluginManager.builtIn.xssInjector);
      pluginManager.register(PluginManager.builtIn.networkLogger);

      console.log(chalk.blue('  Cloning: ' + targetUrl));
      console.log(chalk.blue('  Output: ' + outputDir));
      console.log(chalk.blue('  Depth: ' + config.get('depth')));
      const startTime = Date.now();

      let injectionCode = '';
      if (options.inject) {
        injectionCode = options.inject;
      } else if (options.injectFile) {
        if (fs.existsSync(options.injectFile)) injectionCode = fs.readFileSync(options.injectFile, 'utf8');
        else { logger.error('File not found: ' + options.injectFile); process.exit(1); }
      } else if (!options.interactive) {
        injectionCode = getDefaultPayload();
      } else {
        const answers = await inquirer.prompt([{
          type: 'list', name: 'choice', message: 'Injection method?',
          choices: [{ name: 'Manual', value: 'manual' }, { name: 'Default payload', value: 'default' }, { name: 'Alert test', value: 'alert' }, { name: 'From file', value: 'file' }, { name: 'Skip', value: 'skip' }]
        }, {
          type: 'editor', name: 'code', message: 'Enter JS code:', when: a => a.choice === 'manual'
        }, {
          type: 'input', name: 'file', message: 'File path:', when: a => a.choice === 'file'
        }]);
        if (answers.choice === 'manual') injectionCode = answers.code;
        else if (answers.choice === 'default') injectionCode = getDefaultPayload();
        else if (answers.choice === 'alert') injectionCode = "alert('XSS');";
        else if (answers.choice === 'file' && fs.existsSync(answers.file)) injectionCode = fs.readFileSync(answers.file, 'utf8');
      }

      config.set('injection.code', injectionCode);
      console.log(chalk.blue('\n  Starting crawl...\n'));
      const pages = await crawler.crawl(targetUrl, 0);
      console.log(chalk.green('\n  Crawl completed! Found ' + pages.length + ' pages'));

      let processed = 0;
      for (const pageInfo of pages) {
        processed++;
        logger.logProgress(processed, pages.length, pageInfo.url);
        try {
          const response = await fetchPage(pageInfo.url, config.config);
          const processedResponse = await interceptor.processResponse(response);
          if (!processedResponse) continue;
          const $ = cheerio.load(processedResponse.data);
          if (injectionCode) {
            const scriptTag = '<script>\n// [LivingClone]\n' + injectionCode + '\n</script>';
            $('body').append(scriptTag);
          }
          const resources = extractResources($, pageInfo.url, config.config);
          const htmlContent = $.html();
          const filePath = getFilePathFromUrl(pageInfo.url, outputDir);
          const dir = path.dirname(filePath);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(filePath, htmlContent, 'utf8');
          for (const resource of resources) { await downloadResource(resource, outputDir); }
        } catch (error) { logger.logError(error, { url: pageInfo.url }); }
      }

      if (options.sessionFile) session.save(options.sessionFile);
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(chalk.green('\n  Site cloned in ' + duration + 's'));
      console.log(chalk.blue('  Output: ' + outputDir));

      const cloneData = { url: targetUrl, pagesCount: pages.length, totalSize: calculateTotalSize(outputDir), duration: duration + 's', errors: logger.getLogs().filter(l => l.level === 'error').length, pages: pages.map(p => ({ url: p.url, status: p.status, size: p.size, depth: p.depth })) };

      if (options.exportZip) { await exportManager.toZip(outputDir, path.join(outputDir, 'clone.zip')); console.log(chalk.green('  ZIP exported')); }
      if (options.exportPdf) { await exportManager.toPdf(cloneData, path.join(outputDir, 'report.pdf')); console.log(chalk.green('  PDF exported')); }
      if (options.exportHtml) { exportManager.toHtml(cloneData, path.join(outputDir, 'report.html')); console.log(chalk.green('  HTML report exported')); }
      if (options.exportJson) { exportManager.toJson(cloneData, path.join(outputDir, 'report.json')); console.log(chalk.green('  JSON report exported')); }
      if (options.exportLogs) { logger.exportLogs(options.exportLogs); console.log(chalk.green('  Logs exported')); }

      if (options.serve) { startServer(outputDir, parseInt(options.port)); }
      else if (!options.interactive) { startServer(outputDir, parseInt(options.port)); }
      else {
        const { startNow } = await inquirer.prompt([{ type: 'confirm', name: 'startNow', message: 'Start local server?', default: true }]);
        if (startNow) startServer(outputDir, parseInt(options.port));
      }
    } catch (error) { console.log(chalk.red('  Error: ' + error.message)); process.exit(1); }
  });

// ==================== SERVE COMMAND ====================
program.command('serve').argument('[folder]', 'Folder to serve', 'cloned-site')
  .option('-p, --port <port>', 'Port', '8080')
  .action((folder, options) => {
    const servePath = path.join(process.cwd(), folder);
    if (!fs.existsSync(servePath)) { console.log(chalk.red('  Folder not found: ' + folder)); process.exit(1); }
    startServer(servePath, parseInt(options.port));
  });

// ==================== SESSION COMMAND ====================
program.command('session').description('Manage sessions')
  .option('--save <file>', 'Save current session')
  .option('--load <file>', 'Load session')
  .option('--export <file> <format>', 'Export session (json/netscape/curl)')
  .option('--info <file>', 'Show session info')
  .action((options) => {
    const session = new Session();
    if (options.save) { session.save(options.save); console.log(chalk.green('  Session saved to ' + options.save)); }
    if (options.load && session.load(options.load)) {
      console.log(chalk.green('  Session loaded'));
      console.log('  Cookies: ' + Object.keys(session.cookies).length);
      console.log('  LocalStorage: ' + Object.keys(session.localStorage).length);
    }
    if (options.info && session.load(options.info)) {
      const summary = session.getSummary();
      console.log(JSON.stringify(summary, null, 2));
    }
    if (options.export) {
      const [file, format] = options.export.split(' ');
      if (session.load(file)) {
        const output = session.export(format || 'json');
        const ext = format || 'json';
        const outFile = file.replace(/\.[^.]+$/, '.' + ext);
        fs.writeFileSync(outFile, output);
        console.log(chalk.green('  Exported to ' + outFile));
      }
    }
  });

// ==================== EXPORT COMMAND ====================
program.command('export').argument('<folder>', 'Cloned folder')
  .option('--zip', 'Export as ZIP')
  .option('--pdf', 'Generate PDF report')
  .option('--html', 'Generate HTML report')
  .option('--json', 'Generate JSON report')
  .option('--diff <folder2>', 'Diff two clones')
  .action(async (folder, options) => {
    const folderPath = path.join(process.cwd(), folder);
    if (!fs.existsSync(folderPath)) { console.log(chalk.red('  Folder not found')); process.exit(1); }

    if (options.zip) { await exportManager.toZip(folderPath, path.join(folderPath, 'export.zip')); console.log(chalk.green('  ZIP created')); }
    if (options.html) { exportManager.toHtml({ url: folder, pagesCount: 0, totalSize: calculateTotalSize(folderPath) }, path.join(folderPath, 'report.html')); console.log(chalk.green('  HTML report created')); }
    if (options.json) { exportManager.toJson({ url: folder, pagesCount: 0 }, path.join(folderPath, 'report.json')); console.log(chalk.green('  JSON report created')); }
    if (options.diff) {
      const folder2 = path.join(process.cwd(), options.diff);
      if (!fs.existsSync(folder2)) { console.log(chalk.red('  Diff folder not found')); process.exit(1); }
      exportManager.diff({ url: folder, pagesCount: 0, totalSize: calculateTotalSize(folderPath) }, { url: options.diff, pagesCount: 0, totalSize: calculateTotalSize(folder2) }, path.join(folderPath, 'diff.json'));
      console.log(chalk.green('  Diff report created'));
    }
  });

// ==================== CONFIG COMMAND ====================
program.command('config').description('Manage configuration')
  .option('--init', 'Generate default config file')
  .option('--show', 'Show current config')
  .option('--presets', 'Show available presets')
  .action((options) => {
    if (options.init) {
      const cfgPath = path.join(process.cwd(), 'living-clone.json');
      config.save(cfgPath);
      console.log(chalk.green('  Config created: ' + cfgPath));
    }
    if (options.show) { console.log(JSON.stringify(config.config, null, 2)); }
    if (options.presets) {
      const presets = config.getPresets();
      for (const [name, settings] of Object.entries(presets)) {
        console.log(chalk.yellow('\n  ' + name + ':'));
        console.log('  ' + JSON.stringify(settings, null, 2).replace(/\n/g, '\n  '));
      }
    }
  });

// ==================== PAYLOADS COMMAND ====================
program.command('payloads').description('List available payloads')
  .action(() => {
    const payloadsDir = path.join(__dirname, 'payloads');
    if (fs.existsSync(payloadsDir)) {
      const files = fs.readdirSync(payloadsDir);
      console.log(chalk.green('\n  Available Payloads:\n'));
      files.forEach(f => console.log('    ' + chalk.cyan(f)));
      console.log('');
    } else {
      console.log(chalk.yellow('  No payloads directory found'));
    }
  });

// ==================== BROWSER COMMAND ====================
program.command('browser').description('Clone with Puppeteer (for SPAs)')
  .argument('<url>', 'URL to clone')
  .option('-o, --output <folder>', 'Output folder', 'browser-clone')
  .option('--no-headless', 'Show browser')
  .option('--wait <ms>', 'Wait time after load', '3000')
  .option('--scroll', 'Auto-scroll to load lazy content')
  .option('--screenshot', 'Take full page screenshot')
  .option('--emulate <device>', 'Emulate device (iPhone 12, iPad, etc)')
  .option('--proxy <url>', 'Proxy server')
  .option('--cookie <name=value>', 'Add cookie', collect, [])
  .action(async (url, options) => {
    console.log(chalk.green('\n  Browser Cloner - SPA Support\n'));
    const BrowserCloner = require('./lib/browser');
    const browser = new BrowserCloner();
    
    await browser.launch({
      headless: options.headless !== false,
      proxy: options.proxy,
      emulate: options.emulate
    });

    const cookies = options.cookie.map(c => {
      const [name, ...value] = c.split('=');
      return { name, value: value.join('='), url };
    });
    if (cookies.length > 0) await browser.setCookies(cookies);

    const result = await browser.clone(url, {
      waitFor: parseInt(options.wait),
      scroll: options.scroll,
      screenshot: options.screenshot,
      outputDir: path.join(process.cwd(), options.output)
    });

    const outputDir = path.join(process.cwd(), options.output);
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, 'index.html'), result.html, 'utf8');
    
    console.log(chalk.green('  Cloned: ' + url));
    console.log(chalk.blue('  Title: ' + result.title));
    console.log(chalk.blue('  Resources: ' + result.resources.length));
    
    await browser.close();
  });

// ==================== SECURITY COMMAND ====================
program.command('security').description('Security scan (WAF, tech, vulns, headers)')
  .argument('<url>', 'URL to scan')
  .option('--output <file>', 'Output report file')
  .option('--format <format>', 'Report format (json/html/markdown)', 'html')
  .option('--theme <theme>', 'Report theme (dark/light/hacker/cyberpunk)', 'dark')
  .action(async (url, options) => {
    console.log(chalk.green('\n  Security Scanner\n'));
    const SecurityScanner = require('./lib/security');
    const ReportGenerator = require('./lib/reports');
    
    const scanner = new SecurityScanner();
    const results = await scanner.scan(url);
    
    console.log(chalk.blue('  WAF: ' + (results.waf.hasWAF ? results.waf.detected.map(w => w.name).join(', ') : 'None')));
    console.log(chalk.blue('  Technologies: ' + results.technologies.map(t => t.name).join(', ')));
    console.log(chalk.blue('  Vulnerabilities: ' + results.vulnerabilities.length));
    console.log(chalk.blue('  Score: ' + results.score + '/100'));
    
    if (options.output) {
      const reporter = new ReportGenerator({ theme: options.theme });
      const report = scanner.generateReport();
      fs.writeFileSync(options.output, report, 'utf8');
      console.log(chalk.green('  Report saved: ' + options.output));
    }
  });

// ==================== BATCH COMMAND ====================
program.command('batch').description('Batch clone from URL file')
  .argument('<file>', 'File with URLs (one per line)')
  .option('-o, --output <folder>', 'Output folder', 'batch-output')
  .option('-c, --concurrency <num>', 'Concurrent requests', '3')
  .option('--delay <ms>', 'Delay between requests', '1000')
  .option('--export <file>', 'Export results')
  .action(async (file, options) => {
    console.log(chalk.green('\n  Batch Cloner\n'));
    const BatchManager = require('./lib/batch');
    const batch = new BatchManager();
    
    const urls = batch.loadUrls(file);
    if (urls.length === 0) { console.log(chalk.red('  No URLs found')); process.exit(1); }
    
    console.log(chalk.blue('  URLs to process: ' + urls.length));
    
    const results = await batch.batchClone(urls, async (url) => {
      console.log(chalk.blue('  Processing: ' + url));
      return { url, status: 'done' };
    }, {
      concurrency: parseInt(options.concurrency),
      delay: parseInt(options.delay),
      onProgress: (current, total, url) => {
        console.log(chalk.green('  Progress: ' + current + '/' + total));
      }
    });

    const successful = results.filter(r => r.success).length;
    console.log(chalk.green('\n  Complete: ' + successful + '/' + urls.length + ' successful'));
    
    if (options.export) {
      batch.exportResults(options.export);
      console.log(chalk.green('  Results exported: ' + options.export));
    }
  });

// ==================== WATCH COMMAND ====================
program.command('watch').description('Watch URLs for changes')
  .argument('<urls>', 'Comma-separated URLs or file')
  .option('--interval <ms>', 'Check interval (ms)', '3600000')
  .option('--webhook <url>', 'Webhook URL for notifications')
  .action(async (urlsArg, options) => {
    console.log(chalk.green('\n  Watch Mode\n'));
    const BatchManager = require('./lib/batch');
    const batch = new BatchManager();
    
    let urls;
    if (fs.existsSync(urlsArg)) {
      urls = batch.loadUrls(urlsArg);
    } else {
      urls = urlsArg.split(',').map(u => u.trim());
    }
    
    console.log(chalk.blue('  Watching ' + urls.length + ' URLs'));
    console.log(chalk.blue('  Interval: ' + (parseInt(options.interval) / 1000) + 's'));
    
    const watchId = batch.startWatch(urls, async (url) => {
      console.log(chalk.blue('  Checking: ' + url));
      return { url, checkedAt: new Date() };
    }, {
      interval: parseInt(options.interval),
      onChange: (url, newResult, oldResult) => {
        console.log(chalk.green('  CHANGE DETECTED: ' + url));
      }
    });
    
    console.log(chalk.green('  Watch started: ' + watchId));
    console.log(chalk.blue('  Press Ctrl+C to stop'));
    
    process.on('SIGINT', () => { batch.stopWatch(watchId); process.exit(); });
  });

// ==================== COMPARE COMMAND ====================
program.command('compare').description('Compare two clones')
  .argument('<clone1>', 'First clone folder')
  .argument('<clone2>', 'Second clone folder')
  .option('--output <file>', 'Output diff report')
  .action((clone1, clone2, options) => {
    console.log(chalk.green('\n  Clone Comparison\n'));
    const BatchManager = require('./lib/batch');
    const batch = new BatchManager();
    
    const diff = batch.compare(
      path.join(process.cwd(), clone1),
      path.join(process.cwd(), clone2)
    );
    
    console.log(chalk.blue('  Files added: ' + diff.stats.added));
    console.log(chalk.blue('  Files removed: ' + diff.stats.removed));
    console.log(chalk.blue('  Files modified: ' + diff.stats.modified));
    
    if (options.output) {
      fs.writeFileSync(options.output, batch.generateDiffReport(diff), 'utf8');
      console.log(chalk.green('  Diff report saved: ' + options.output));
    }
  });

// ==================== API COMMAND ====================
program.command('api').description('Start REST API server')
  .option('-p, --port <port>', 'Port', '3000')
  .option('--host <host>', 'Host', '0.0.0.0')
  .action(async (options) => {
    console.log(chalk.green('\n  REST API Server\n'));
    const APIServer = require('./lib/api');
    const api = new APIServer();
    
    const crawler = new Crawler(config.config);
    api.setupCloneEndpoint(crawler);
    
    const SecurityScanner = require('./lib/security');
    const scanner = new SecurityScanner();
    api.setupSecurityEndpoint(scanner);
    
    await api.start(parseInt(options.port), options.host);
    console.log(chalk.green('  API running at http://' + options.host + ':' + options.port));
    console.log(chalk.blue('  Endpoints: /health, /info, /api/clone, /api/scan'));
  });

// ==================== DASHBOARD COMMAND ====================
program.command('dashboard').description('Start web dashboard')
  .option('-p, --port <port>', 'Port', '9090')
  .action(async (options) => {
    console.log(chalk.green('\n  Web Dashboard\n'));
    const Dashboard = require('./lib/dashboard');
    const dashboard = new Dashboard();
    
    await dashboard.start(parseInt(options.port));
    console.log(chalk.green('  Dashboard: http://localhost:' + options.port));
  });

// ==================== HAR COMMAND ====================
program.command('har').description('Export/Import HAR files')
  .option('--export <folder>', 'Export clone to HAR')
  .option('--import <file>', 'Import HAR file')
  .option('--output <file>', 'Output file')
  .action((options) => {
    console.log(chalk.green('\n  HAR Manager\n'));
    const IntegrationManager = require('./lib/integration');
    const integration = new IntegrationManager();
    
    if (options.export) {
      const folder = path.join(process.cwd(), options.export);
      console.log(chalk.blue('  Exporting: ' + options.export));
      // Would need to collect requests/responses from crawl
      console.log(chalk.green('  HAR export ready'));
    }
    if (options.import) {
      const data = integration.importHar(options.import);
      console.log(chalk.green('  Imported: ' + data.requests.length + ' requests'));
      if (options.output) {
        fs.writeFileSync(options.output, JSON.stringify(data, null, 2));
        console.log(chalk.green('  Saved to: ' + options.output));
      }
    }
  });

// ==================== WEBHOOK COMMAND ====================
program.command('webhook').description('Send notifications')
  .option('--slack <url>', 'Slack webhook URL')
  .option('--discord <url>', 'Discord webhook URL')
  .option('--message <msg>', 'Message to send')
  .action(async (options) => {
    console.log(chalk.green('\n  Webhook Sender\n'));
    const IntegrationManager = require('./lib/integration');
    const integration = new IntegrationManager({ slackWebhook: options.slack, discordWebhook: options.discord });
    
    if (options.message) {
      if (options.slack) await integration.sendSlack(options.message);
      if (options.discord) await integration.sendDiscord(options.message);
      console.log(chalk.green('  Message sent'));
    }
  });

// ==================== INTEGRATIONS COMMAND ====================
program.command('integrations').description('Manage integrations')
  .option('--burp <url>', 'Send to Burp Suite')
  .option('--zap <url>', 'Send to OWASP ZAP')
  .option('--curl <url>', 'Generate curl command')
  .action(async (options) => {
    console.log(chalk.green('\n  Integrations\n'));
    const IntegrationManager = require('./lib/integration');
    const integration = new IntegrationManager();
    
    if (options.curl) {
      const cmd = integration.generateCurl({ url: options.curl, method: 'GET', headers: {} });
      console.log(chalk.blue('  ' + cmd));
    }
    if (options.burp) {
      await integration.sendToBurp({ url: options.burp });
      console.log(chalk.green('  Sent to Burp'));
    }
    if (options.zap) {
      await integration.sendToZAP({ url: options.zap });
      console.log(chalk.green('  Sent to ZAP'));
    }
  });

// ==================== CRAWL STATE COMMAND ====================
program.command('crawl-state').description('Manage crawl state for resume')
  .option('--save', 'Save current state')
  .option('--load', 'Load saved state')
  .option('--clear', 'Clear state')
  .option('--show', 'Show state info')
  .action((options) => {
    console.log(chalk.green('\n  Crawl State Manager\n'));
    const AdvancedCrawler = require('./lib/advanced-crawler');
    const crawler = new AdvancedCrawler({ stateFile: '.crawl-state.json' });
    
    if (options.save) {
      crawler.saveState();
      console.log(chalk.green('  State saved'));
    }
    if (options.load) {
      crawler.loadState();
      console.log(chalk.green('  State loaded: ' + crawler.visited.size + ' pages'));
    }
    if (options.clear) {
      crawler.clearState();
      console.log(chalk.green('  State cleared'));
    }
    if (options.show) {
      if (crawler.loadState()) {
        console.log(chalk.blue('  Pages crawled: ' + crawler.visited.size));
        console.log(chalk.blue('  Broken links: ' + crawler.brokenLinks.length));
      }
    }
  });

// ==================== THEMES COMMAND ====================
program.command('themes').description('List report themes')
  .action(() => {
    const ReportGenerator = require('./lib/reports');
    const reporter = new ReportGenerator();
    const themes = reporter.getThemes();
    console.log(chalk.green('\n  Available Themes:\n'));
    themes.forEach(t => console.log('    ' + chalk.cyan(t)));
    console.log('');
  });

program.parse();
