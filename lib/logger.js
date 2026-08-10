const winston = require('winston');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

class Logger {
  constructor() {
    this.logger = null;
    this.logs = [];
  }

  init(options = {}) {
    const transports = [];
    
    // Console transport
    if (options.console !== false) {
      transports.push(new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.timestamp({ format: 'HH:mm:ss' }),
          winston.format.printf(({ timestamp, level, message, ...meta }) => {
            const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
            return `${timestamp} ${level}: ${message}${metaStr}`;
          })
        )
      }));
    }
    
    // File transport
    if (options.file) {
      const logDir = path.dirname(options.file);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      
      transports.push(new winston.transports.File({
        filename: options.file,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json()
        )
      }));
    }
    
    this.logger = winston.createLogger({
      level: options.level || 'info',
      transports
    });
  }

  setLevel(level) {
    if (this.logger) {
      this.logger.level = level;
    }
  }

  log(level, message, meta = {}) {
    if (this.logger) {
      this.logger.log(level, message, meta);
    }
    this.logs.push({ level, message, meta, timestamp: new Date() });
  }

  debug(message, meta) {
    this.log('debug', message, meta);
  }

  info(message, meta) {
    this.log('info', message, meta);
  }

  warn(message, meta) {
    this.log('warn', message, meta);
  }

  error(message, meta) {
    this.log('error', message, meta);
  }

  // Specialized logging methods
  logRequest(url, method = 'GET', headers = {}) {
    this.info(`Request: ${method} ${url}`, { headers });
  }

  logResponse(url, status, size) {
    this.info(`Response: ${status} ${url} (${size} bytes)`);
  }

  logInjection(type, code) {
    this.info(`Injection: ${type}`, { codeLength: code.length });
  }

  logClone(url, depth) {
    this.info(`Cloning: ${url} (depth: ${depth})`);
  }

  logError(error, context = {}) {
    this.error(error.message || error, { stack: error.stack, ...context });
  }

  logProgress(current, total, item) {
    const percent = Math.round((current / total) * 100);
    this.info(`Progress: ${current}/${total} (${percent}%) - ${item}`);
  }

  getLogs() {
    return this.logs;
  }

  exportLogs(filePath) {
    const content = JSON.stringify(this.logs, null, 2);
    fs.writeFileSync(filePath, content, 'utf8');
  }
}

module.exports = new Logger();
