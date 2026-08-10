const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DEFAULT_CONFIG = {
  // Crawling
  depth: 1,
  maxPages: 100,
  followLinks: true,
  followExternal: false,
  respectRobots: true,
  excludePatterns: [],
  includePatterns: [],
  
  // Authentication
  auth: {
    type: null, // 'basic', 'cookie', 'token'
    username: null,
    password: null,
    cookies: {},
    token: null,
    tokenHeader: 'Authorization'
  },
  
  // Request settings
  headers: {},
  userAgent: null,
  proxy: null,
  rateLimit: 0, // ms between requests
  timeout: 30000,
  retries: 3,
  
  // Output
  output: 'cloned-site',
  saveImages: true,
  saveCss: true,
  saveJs: true,
  
  // Injection
  injection: {
    code: null,
    file: null,
    position: 'body' // 'body', 'head', 'both'
  },
  
  // Server
  server: {
    enabled: false,
    port: 8080,
    host: 'localhost'
  },
  
  // Logging
  logging: {
    level: 'info', // 'debug', 'info', 'warn', 'error'
    file: null,
    console: true
  },
  
  // Security
  security: {
    rotateUserAgent: false,
    antiFingerprint: false,
    randomizeHeaders: false
  },
  
  // Export
  export: {
    zip: false,
    screenshot: false,
    pdf: false
  }
};

const PRESETS = {
  aggressive: {
    depth: 5,
    maxPages: 500,
    followExternal: true,
    rateLimit: 0,
    retries: 1
  },
  stealth: {
    rateLimit: 2000,
    security: {
      rotateUserAgent: true,
      antiFingerprint: true,
      randomizeHeaders: true
    }
  },
  fast: {
    depth: 1,
    maxPages: 50,
    rateLimit: 0,
    retries: 0,
    saveImages: false,
    saveCss: true,
    saveJs: true
  },
  thorough: {
    depth: 10,
    maxPages: 1000,
    followExternal: false,
    rateLimit: 500
  }
};

class Config {
  constructor() {
    this.config = { ...DEFAULT_CONFIG };
    this.configFile = null;
  }

  load(configPath) {
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf8');
      const ext = path.extname(configPath).toLowerCase();
      
      let loaded;
      if (ext === '.json' || ext === '.jsonc') {
        loaded = JSON.parse(content);
      } else {
        // Try JSON for other extensions
        loaded = JSON.parse(content);
      }
      
      this.config = this.merge(this.config, loaded);
      this.configFile = configPath;
      return true;
    }
    return false;
  }

  loadPreset(presetName) {
    if (PRESETS[presetName]) {
      this.config = this.merge(this.config, PRESETS[presetName]);
      return true;
    }
    return false;
  }

  merge(target, source) {
    const result = { ...target };
    
    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
          result[key] = this.merge(result[key] || {}, source[key]);
        } else {
          result[key] = source[key];
        }
      }
    }
    
    return result;
  }

  set(key, value) {
    const keys = key.split('.');
    let current = this.config;
    
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }
    
    current[keys[keys.length - 1]] = value;
  }

  get(key) {
    const keys = key.split('.');
    let current = this.config;
    
    for (const k of keys) {
      if (current === undefined || current === null) {
        return undefined;
      }
      current = current[k];
    }
    
    return current;
  }

  save(configPath) {
    const content = JSON.stringify(this.config, null, 2);
    fs.writeFileSync(configPath, content, 'utf8');
    this.configFile = configPath;
  }

  generateId() {
    return uuidv4();
  }

  getDefaults() {
    return { ...DEFAULT_CONFIG };
  }

  getPresets() {
    return { ...PRESETS };
  }
}

module.exports = new Config();
