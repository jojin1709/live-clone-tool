const WebSocket = require('ws');
const logger = require('./logger');
const EventEmitter = require('eventemitter3');

class WebSocketProxy extends EventEmitter {
  constructor() {
    super();
    this.servers = new Map();
    this.connections = new Map();
    this.messageLog = [];
    this.enabled = true;
  }

  // Create a proxy server
  createServer(options = {}) {
    const {
      port = 8081,
      target = null,
      path = '/',
      onMessage = null,
      onConnect = null,
      onDisconnect = null,
      transform = null
    } = options;

    const wss = new WebSocket.Server({ port, path });

    wss.on('connection', (ws, req) => {
      const connectionId = Date.now().toString();
      const clientIp = req.socket.remoteAddress;
      
      logger.info(`WebSocket connection: ${clientIp}`);
      this.emit('connection', { id: connectionId, ip: clientIp });

      // Store connection
      this.connections.set(connectionId, {
        ws,
        ip: clientIp,
        connectedAt: new Date(),
        messagesSent: 0,
        messagesReceived: 0
      });

      // Connect to target if specified
      let targetWs = null;
      if (target) {
        try {
          targetWs = new WebSocket(target);
          
          targetWs.on('open', () => {
            logger.info(`Connected to target: ${target}`);
          });

          targetWs.on('message', (data) => {
            const message = data.toString();
            this.logMessage('incoming', message, connectionId, target);
            
            // Transform message if transformer provided
            const transformedMessage = transform ? transform(message, 'incoming') : message;
            
            ws.send(transformedMessage);
            this.emit('message:incoming', { id: connectionId, message: transformedMessage });

            const conn = this.connections.get(connectionId);
            if (conn) conn.messagesReceived++;
          });

          targetWs.on('error', (error) => {
            logger.error('Target WebSocket error', { error: error.message });
          });

          targetWs.on('close', () => {
            logger.info('Target WebSocket closed');
            ws.close();
          });
        } catch (error) {
          logger.error('Failed to connect to target', { error: error.message });
        }
      }

      // Handle incoming messages from client
      ws.on('message', (data) => {
        const message = data.toString();
        this.logMessage('outgoing', message, connectionId, clientIp);
        
        // Transform message if transformer provided
        const transformedMessage = transform ? transform(message, 'outgoing') : message;
        
        // Forward to target
        if (targetWs && targetWs.readyState === WebSocket.OPEN) {
          targetWs.send(transformedMessage);
        }

        this.emit('message:outgoing', { id: connectionId, message: transformedMessage });

        const conn = this.connections.get(connectionId);
        if (conn) conn.messagesSent++;

        // Call custom handler
        if (onMessage) {
          onMessage(message, connectionId, ws);
        }
      });

      ws.on('close', () => {
        logger.info(`WebSocket disconnected: ${connectionId}`);
        this.connections.delete(connectionId);
        this.emit('disconnect', { id: connectionId });

        if (onDisconnect) {
          onDisconnect(connectionId);
        }

        if (targetWs) {
          targetWs.close();
        }
      });

      ws.on('error', (error) => {
        logger.error('WebSocket error', { error: error.message, connectionId });
      });

      // Call custom connect handler
      if (onConnect) {
        onConnect(connectionId, ws);
      }
    });

    this.servers.set(port, wss);
    logger.info(`WebSocket server started on port ${port}`);
    
    return wss;
  }

  // Log messages
  logMessage(direction, message, connectionId, remoteAddress) {
    const entry = {
      timestamp: new Date(),
      direction,
      connectionId,
      remoteAddress,
      length: message.length,
      preview: message.substring(0, 100)
    };

    this.messageLog.push(entry);
    this.emit('message:logged', entry);

    // Keep only last 1000 messages
    if (this.messageLog.length > 1000) {
      this.messageLog = this.messageLog.slice(-1000);
    }
  }

  // Get connection info
  getConnection(id) {
    return this.connections.get(id);
  }

  // Get all connections
  getConnections() {
    return Array.from(this.connections.entries()).map(([id, conn]) => ({
      id,
      ip: conn.ip,
      connectedAt: conn.connectedAt,
      messagesSent: conn.messagesSent,
      messagesReceived: conn.messagesReceived
    }));
  }

  // Get message log
  getMessageLog(options = {}) {
    let logs = this.messageLog;

    if (options.direction) {
      logs = logs.filter(l => l.direction === options.direction);
    }

    if (options.connectionId) {
      logs = logs.filter(l => l.connectionId === options.connectionId);
    }

    if (options.limit) {
      logs = logs.slice(-options.limit);
    }

    return logs;
  }

  // Broadcast to all connections
  broadcast(message) {
    for (const [id, conn] of this.connections) {
      if (conn.ws.readyState === WebSocket.OPEN) {
        conn.ws.send(message);
        this.logMessage('broadcast', message, id, 'server');
      }
    }
    logger.info(`Broadcast sent to ${this.connections.size} clients`);
  }

  // Send to specific connection
  send(connectionId, message) {
    const conn = this.connections.get(connectionId);
    if (conn && conn.ws.readyState === WebSocket.OPEN) {
      conn.ws.send(message);
      this.logMessage('direct', message, connectionId, conn.ip);
      return true;
    }
    return false;
  }

  // Close connection
  closeConnection(connectionId, code = 1000, reason = 'Server closed') {
    const conn = this.connections.get(connectionId);
    if (conn) {
      conn.ws.close(code, reason);
      return true;
    }
    return false;
  }

  // Close all connections
  closeAllConnections(code = 1000, reason = 'Server shutting down') {
    for (const [id, conn] of this.connections) {
      conn.ws.close(code, reason);
    }
    this.connections.clear();
    logger.info('All connections closed');
  }

  // Stop server
  stop(port) {
    const wss = this.servers.get(port);
    if (wss) {
      this.closeAllConnections();
      wss.close(() => {
        this.servers.delete(port);
        logger.info(`WebSocket server on port ${port} stopped`);
      });
      return true;
    }
    return false;
  }

  // Stop all servers
  stopAll() {
    for (const [port, wss] of this.servers) {
      this.stop(port);
    }
  }

  // Get statistics
  getStats() {
    let totalMessagesSent = 0;
    let totalMessagesReceived = 0;

    for (const conn of this.connections.values()) {
      totalMessagesSent += conn.messagesSent;
      totalMessagesReceived += conn.messagesReceived;
    }

    return {
      activeConnections: this.connections.size,
      totalServers: this.servers.size,
      totalMessagesLogged: this.messageLog.length,
      totalMessagesSent,
      totalMessagesReceived
    };
  }

  // Export logs
  exportLogs(filePath, format = 'json') {
    let content;
    if (format === 'json') {
      content = JSON.stringify(this.messageLog, null, 2);
    } else {
      content = this.messageLog.map(l => 
        `${l.timestamp.toISOString()} | ${l.direction} | ${l.connectionId} | ${l.remoteAddress} | ${l.length} bytes`
      ).join('\n');
    }

    require('fs').writeFileSync(filePath, content, 'utf8');
    logger.info(`WebSocket logs exported to ${filePath}`);
  }

  // Clear logs
  clearLogs() {
    this.messageLog = [];
  }

  // Clean up
  cleanup() {
    this.stopAll();
    this.connections.clear();
    this.messageLog = [];
    logger.debug('WebSocket proxy cleaned up');
  }
}

module.exports = WebSocketProxy;
