const express = require('express');
const path = require('path');
const logger = require('./logger');

class Dashboard {
  constructor(config = {}) {
    this.config = config;
    this.app = express();
    this.server = null;
    this.data = { clones: [], scans: [], stats: {} };
    this.setupRoutes();
  }

  setupRoutes() {
    this.app.use(express.json());
    this.app.use(express.static(path.join(__dirname, '../dashboard')));

    this.app.get('/api/status', (req, res) => {
      res.json({ status: 'ok', uptime: process.uptime(), ...this.data.stats });
    });

    this.app.get('/api/clones', (req, res) => {
      res.json(this.data.clones);
    });

    this.app.post('/api/clones', (req, res) => {
      const clone = { id: Date.now(), ...req.body, timestamp: new Date() };
      this.data.clones.push(clone);
      res.json(clone);
    });

    this.app.get('/api/scans', (req, res) => {
      res.json(this.data.scans);
    });

    this.app.post('/api/scans', (req, res) => {
      const scan = { id: Date.now(), ...req.body, timestamp: new Date() };
      this.data.scans.push(scan);
      res.json(scan);
    });

    this.app.get('/', (req, res) => {
      res.send(this.getDashboardHtml());
    });
  }

  updateStats(stats) {
    this.data.stats = { ...this.data.stats, ...stats, lastUpdate: new Date() };
  }

  addClone(clone) {
    this.data.clones.push({ id: Date.now(), ...clone, timestamp: new Date() });
  }

  addScan(scan) {
    this.data.scans.push({ id: Date.now(), ...scan, timestamp: new Date() });
  }

  start(port = 9090) {
    return new Promise((resolve) => {
      this.server = this.app.listen(port, () => {
        logger.info('Dashboard running at http://localhost:' + port);
        resolve(this.server);
      });
    });
  }

  stop() {
    return new Promise((resolve) => {
      if (this.server) this.server.close(resolve);
      else resolve();
    });
  }

  getDashboardHtml() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Living Clone Dashboard</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',system-ui,sans-serif;background:#0f0f23;color:#eaeaea;min-height:100vh}
.header{background:linear-gradient(135deg,#1a1a3e,#0f3460);padding:30px;text-align:center;border-bottom:3px solid #e94560}
.header h1{font-size:2.5em;color:#e94560;margin-bottom:10px}
.header p{color:#888;font-size:1.1em}
.container{max-width:1400px;margin:0 auto;padding:20px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:20px;margin:20px 0}
.card{background:#16213e;border-radius:12px;padding:25px;box-shadow:0 4px 20px rgba(0,0,0,.4)}
.card h2{color:#e94560;margin-bottom:15px;font-size:1.3em;border-bottom:1px solid #0f3460;padding-bottom:10px}
.stat{text-align:center;padding:20px}
.stat .value{font-size:3em;color:#e94560;font-weight:bold}
.stat .label{color:#888;margin-top:5px}
.btn{background:#e94560;color:#fff;border:none;padding:12px 24px;border-radius:8px;cursor:pointer;font-size:1em;transition:all .3s}
.btn:hover{background:#d63851;transform:translateY(-2px)}
.btn-group{display:flex;gap:10px;flex-wrap:wrap;margin:15px 0}
.input{width:100%;padding:12px;border:1px solid #0f3460;border-radius:8px;background:#0a0a1a;color:#eaeaea;font-size:1em;margin:5px 0}
.input:focus{outline:none;border-color:#e94560}
.table{width:100%;border-collapse:collapse;margin-top:15px}
.table th,.table td{padding:12px;text-align:left;border-bottom:1px solid #0f3460}
.table th{background:#0f3460;color:#e94560}
.table tr:hover{background:#1a1a3e}
.badge{display:inline-block;padding:3px 8px;border-radius:4px;font-size:.85em;font-weight:bold}
.badge-ok{background:#00c853;color:#000}
.badge-err{background:#ff1744;color:#fff}
.badge-warn{background:#ffd600;color:#000}
.progress{height:10px;background:#0f3460;border-radius:5px;overflow:hidden;margin:10px 0}
.progress-bar{height:100%;background:linear-gradient(90deg,#e94560,#ff6b6b);transition:width .3s}
.log{background:#0a0a1a;border-radius:8px;padding:15px;max-height:300px;overflow-y:auto;font-family:monospace;font-size:.9em;margin-top:10px}
.log-entry{padding:5px 0;border-bottom:1px solid #16213e}
.log-time{color:#888}
.log-info{color:#00c853}
.log-error{color:#ff1744}
</style>
</head>
<body>
<div class="header">
<h1>Living Clone Dashboard</h1>
<p>Advanced Website Cloning & Security Testing</p>
</div>
<div class="container">
<div class="grid">
<div class="card"><div class="stat"><div class="value" id="clones">0</div><div class="label">Total Clones</div></div></div>
<div class="card"><div class="stat"><div class="value" id="scans">0</div><div class="label">Security Scans</div></div></div>
<div class="card"><div class="stat"><div class="value" id="vulns">0</div><div class="label">Vulnerabilities Found</div></div></div>
</div>

<div class="card">
<h2>Quick Actions</h2>
<div class="btn-group">
<button class="btn" onclick="quickClone()">Quick Clone</button>
<button class="btn" onclick="quickScan()">Security Scan</button>
<button class="btn" onclick="refreshData()">Refresh</button>
<button class="btn" onclick="exportData()">Export</button>
</div>
<div style="margin-top:15px">
<input type="text" class="input" id="urlInput" placeholder="Enter URL to clone or scan...">
</div>
</div>

<div class="card">
<h2>Recent Activity</h2>
<table class="table">
<thead><tr><th>Time</th><th>Action</th><th>URL</th><th>Status</th></tr></thead>
<tbody id="activityTable"></tbody>
</table>
</div>

<div class="card">
<h2>System Status</h2>
<div class="progress"><div class="progress-bar" id="progressBar" style="width:0%"></div></div>
<div class="log" id="logContainer">
<div class="log-entry"><span class="log-time">--:--:--</span> <span class="log-info">Dashboard ready</span></div>
</div>
</div>
</div>

<script>
function quickClone(){
  const url=document.getElementById('urlInput').value;
  if(!url){alert('Enter a URL');return}
  addLog('info','Cloning: '+url);
  fetch('/api/clones',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url,status:'started'})})
  .then(r=>r.json()).then(d=>{addLog('info','Clone started: '+url);refreshData()});
}
function quickScan(){
  const url=document.getElementById('urlInput').value;
  if(!url){alert('Enter a URL');return}
  addLog('info','Scanning: '+url);
  fetch('/api/scans',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url,status:'started'})})
  .then(r=>r.json()).then(d=>{addLog('info','Scan started: '+url);refreshData()});
}
function refreshData(){
  fetch('/api/status').then(r=>r.json()).then(d=>{
    document.getElementById('clones').textContent=d.totalClones||0;
    document.getElementById('scans').textContent=d.totalScans||0;
  });
  fetch('/api/clones').then(r=>r.json()).then(d=>{
    const tb=document.getElementById('activityTable');
    tb.innerHTML=d.slice(-10).reverse().map(c=>'<tr><td>'+new Date(c.timestamp).toLocaleTimeString()+'</td><td>Clone</td><td>'+c.url+'</td><td><span class="badge badge-ok">'+(c.status||'done')+'</span></td></tr>').join('');
  });
}
function addLog(type,msg){
  const log=document.getElementById('logContainer');
  const time=new Date().toLocaleTimeString();
  log.innerHTML+='<div class="log-entry"><span class="log-time">'+time+'</span> <span class="log-'+type+'">'+msg+'</span></div>';
  log.scrollTop=log.scrollHeight;
}
function exportData(){
  fetch('/api/clones').then(r=>r.json()).then(d=>{
    const blob=new Blob([JSON.stringify(d,null,2)],{type:'application/json'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='living-clone-data.json';a.click();
  });
}
refreshData();
setInterval(refreshData,30000);
</script>
</body></html>`;
  }
}

module.exports = Dashboard;
