const fs = require('fs');
const path = require('path');
const logger = require('./logger');

class BatchManager {
  constructor(config = {}) {
    this.config = config;
    this.watches = new Map();
    this.results = [];
  }

  // Load URLs from file
  loadUrls(filePath) {
    if (!fs.existsSync(filePath)) {
      logger.error('URL file not found: ' + filePath);
      return [];
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const urls = content.split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'));

    logger.info('Loaded ' + urls.length + ' URLs from ' + filePath);
    return urls;
  }

  // Save URLs to file
  saveUrls(urls, filePath) {
    fs.writeFileSync(filePath, urls.join('\n'), 'utf8');
    logger.info('Saved ' + urls.length + ' URLs to ' + filePath);
  }

  // Batch clone multiple URLs
  async batchClone(urls, handler, options = {}) {
    const { concurrency = 3, delay = 1000, onProgress = null } = options;
    const results = [];
    const queue = [...urls];
    let completed = 0;

    const worker = async () => {
      while (queue.length > 0) {
        const url = queue.shift();
        if (!url) continue;

        try {
          logger.info('Batch processing: ' + url);
          const result = await handler(url);
          results.push({ url, success: true, ...result });
        } catch (error) {
          results.push({ url, success: false, error: error.message });
        }

        completed++;
        if (onProgress) onProgress(completed, urls.length, url);

        if (delay > 0) {
          await new Promise(r => setTimeout(r, delay));
        }
      }
    };

    const workers = [];
    for (let i = 0; i < Math.min(concurrency, urls.length); i++) {
      workers.push(worker());
    }

    await Promise.all(workers);
    this.results = results;

    const successful = results.filter(r => r.success).length;
    logger.info('Batch complete: ' + successful + '/' + urls.length + ' successful');

    return results;
  }

  // Watch mode - re-crawl on interval
  startWatch(urls, handler, options = {}) {
    const { interval = 3600000, onChange = null } = options;
    
    const watchId = Date.now().toString();
    
    const watch = {
      id: watchId,
      urls,
      handler,
      interval,
      onChange,
      lastRun: null,
      results: new Map(),
      timer: null
    };

    // Initial crawl
    this.runWatch(watch);

    // Set up interval
    watch.timer = setInterval(() => this.runWatch(watch), interval);

    this.watches.set(watchId, watch);
    logger.info('Watch started: ' + watchId + ' (interval: ' + (interval / 1000) + 's)');

    return watchId;
  }

  async runWatch(watch) {
    logger.info('Running watch: ' + watch.id);
    const newResults = new Map();

    for (const url of watch.urls) {
      try {
        const result = await watch.handler(url);
        newResults.set(url, result);

        // Check for changes
        const prevResult = watch.results.get(url);
        if (prevResult && this.detectChanges(prevResult, result)) {
          logger.info('Change detected: ' + url);
          if (watch.onChange) watch.onChange(url, result, prevResult);
        }
      } catch (error) {
        logger.error('Watch error: ' + url);
      }
    }

    watch.results = newResults;
    watch.lastRun = new Date();
  }

  detectChanges(oldResult, newResult) {
    if (!oldResult || !newResult) return true;
    
    // Compare sizes
    if (oldResult.size !== newResult.size) return true;
    
    // Compare hashes
    if (oldResult.hash !== newResult.hash) return true;
    
    // Compare status
    if (oldResult.status !== newResult.status) return true;

    return false;
  }

  stopWatch(watchId) {
    const watch = this.watches.get(watchId);
    if (watch) {
      clearInterval(watch.timer);
      this.watches.delete(watchId);
      logger.info('Watch stopped: ' + watchId);
      return true;
    }
    return false;
  }

  stopAllWatches() {
    for (const [id, watch] of this.watches) {
      clearInterval(watch.timer);
    }
    this.watches.clear();
    logger.info('All watches stopped');
  }

  // Compare two clones
  compare(clone1Path, clone2Path) {
    const diff = {
      timestamp: new Date().toISOString(),
      clone1: clone1Path,
      clone2: clone2Path,
      files: { added: [], removed: [], modified: [] },
      stats: {}
    };

    const getFiles = (dir) => {
      const files = new Map();
      if (!fs.existsSync(dir)) return files;
      
      const walk = (currentDir) => {
        const items = fs.readdirSync(currentDir);
        for (const item of items) {
          const fullPath = path.join(currentDir, item);
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            walk(fullPath);
          } else {
            const relativePath = path.relative(dir, fullPath);
            files.set(relativePath, { size: stat.size, mtime: stat.mtime });
          }
        }
      };

      walk(dir);
      return files;
    };

    const files1 = getFiles(clone1Path);
    const files2 = getFiles(clone2Path);

    // Find added files
    for (const [file, info] of files2) {
      if (!files1.has(file)) {
        diff.files.added.push({ file, ...info });
      }
    }

    // Find removed files
    for (const [file, info] of files1) {
      if (!files2.has(file)) {
        diff.files.removed.push({ file, ...info });
      }
    }

    // Find modified files
    for (const [file, info2] of files2) {
      const info1 = files1.get(file);
      if (info1) {
        if (info1.size !== info2.size || info1.mtime.getTime() !== info2.mtime.getTime()) {
          diff.files.modified.push({ file, old: info1, new: info2 });
        }
      }
    }

    // Stats
    diff.stats = {
      totalFiles1: files1.size,
      totalFiles2: files2.size,
      added: diff.files.added.length,
      removed: diff.files.removed.length,
      modified: diff.files.modified.length
    };

    return diff;
  }

  // Generate comparison report
  generateDiffReport(diff, format = 'text') {
    if (format === 'json') {
      return JSON.stringify(diff, null, 2);
    }

    let report = `
# Clone Comparison Report

**Date:** ${diff.timestamp}
**Clone 1:** ${diff.clone1}
**Clone 2:** ${diff.clone2}

## Summary
- Total Files (Clone 1): ${diff.stats.totalFiles1}
- Total Files (Clone 2): ${diff.stats.totalFiles2}
- Files Added: ${diff.stats.added}
- Files Removed: ${diff.stats.removed}
- Files Modified: ${diff.stats.modified}

## Added Files
${diff.files.added.map(f => `- ${f.file} (${f.size} bytes)`).join('\n') || 'None'}

## Removed Files
${diff.files.removed.map(f => `- ${f.file} (${f.size} bytes)`).join('\n') || 'None'}

## Modified Files
${diff.files.modified.map(f => `- ${f.file}`).join('\n') || 'None'}
`;
    return report;
  }

  // Export results
  exportResults(filePath, format = 'json') {
    let content;
    if (format === 'json') {
      content = JSON.stringify(this.results, null, 2);
    } else if (format === 'csv') {
      const headers = ['url', 'success', 'status', 'size', 'error'];
      const rows = this.results.map(r => headers.map(h => r[h] || '').join(','));
      content = [headers.join(','), ...rows].join('\n');
    } else {
      content = this.results.map(r => r.url + ' | ' + (r.success ? 'OK' : r.error)).join('\n');
    }

    fs.writeFileSync(filePath, content, 'utf8');
    logger.info('Results exported to ' + filePath);
  }
}

module.exports = BatchManager;
