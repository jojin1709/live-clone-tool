const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const THEMES = {
  dark: { name: 'Dark', background: '#1a1a2e', cardBg: '#16213e', accentBg: '#0f3460', primary: '#e94560', text: '#eaeaea', muted: '#888' },
  light: { name: 'Light', background: '#f5f5f5', cardBg: '#ffffff', accentBg: '#e0e0e0', primary: '#1976d2', text: '#333333', muted: '#666666' },
  hacker: { name: 'Hacker', background: '#0d0d0d', cardBg: '#1a1a1a', accentBg: '#003300', primary: '#00ff00', text: '#00ff00', muted: '#008800' },
  cyberpunk: { name: 'Cyberpunk', background: '#0a0a0f', cardBg: '#1a1a2e', accentBg: '#16213e', primary: '#ff00ff', text: '#00ffff', muted: '#888888' }
};

class ReportGenerator {
  constructor(config = {}) {
    this.config = config;
    this.theme = THEMES[config.theme || 'dark'];
  }

  setTheme(name) { if (THEMES[name]) this.theme = THEMES[name]; }
  getThemes() { return Object.keys(THEMES); }

  analyzeSEO(html, url) {
    const cheerio = require('cheerio');
    const $ = cheerio.load(html);
    const analysis = { score: 0, issues: [], meta: {} };

    const title = $('title').text().trim();
    analysis.meta.title = title;
    if (!title) analysis.issues.push({ type: 'error', message: 'Missing title tag' });
    else if (title.length < 30) analysis.issues.push({ type: 'warning', message: 'Title too short' });
    else if (title.length > 60) analysis.issues.push({ type: 'warning', message: 'Title too long' });
    else analysis.score += 20;

    const desc = $('meta[name="description"]').attr('content') || '';
    analysis.meta.description = desc;
    if (!desc) analysis.issues.push({ type: 'error', message: 'Missing meta description' });
    else if (desc.length < 120) analysis.issues.push({ type: 'warning', message: 'Description too short' });
    else analysis.score += 20;

    if ($('meta[name="viewport"]').attr('content')) analysis.score += 10;
    else analysis.issues.push({ type: 'error', message: 'Missing viewport' });

    if ($('link[rel="canonical"]').attr('href')) analysis.score += 10;
    if ($('meta[property="og:title"]').attr('content')) analysis.score += 15;
    if ($('meta[name="twitter:card"]').attr('content')) analysis.score += 5;

    const h1Count = $('h1').length;
    if (h1Count === 0) analysis.issues.push({ type: 'error', message: 'No H1 tag' });
    else if (h1Count > 1) analysis.issues.push({ type: 'warning', message: 'Multiple H1 tags' });
    else analysis.score += 10;

    const imgNoAlt = $('img:not([alt])').length;
    if (imgNoAlt > 0) analysis.issues.push({ type: 'warning', message: imgNoAlt + ' images missing alt' });
    else if ($('img').length > 0) analysis.score += 5;

    if ($('script[type="application/ld+json"]').length > 0) analysis.score += 5;
    analysis.score = Math.min(100, analysis.score);
    return analysis;
  }

  analyzePerformance(data) {
    const m = { loadTime: data.duration || 0, size: data.size || 0, score: 100, issues: [], resources: { css: data.cssCount || 0, js: data.jsCount || 0, images: data.imageCount || 0 } };
    if (m.size > 3000000) { m.issues.push({ type: 'error', message: 'Page too large (>3MB)' }); m.score -= 20; }
    else if (m.size > 1000000) { m.issues.push({ type: 'warning', message: 'Page large (>1MB)' }); m.score -= 10; }
    if (m.loadTime > 5000) { m.issues.push({ type: 'error', message: 'Slow load (>5s)' }); m.score -= 20; }
    else if (m.loadTime > 3000) { m.issues.push({ type: 'warning', message: 'Slow load (>3s)' }); m.score -= 10; }
    if (m.resources.js > 20) { m.issues.push({ type: 'warning', message: 'Too many JS files' }); m.score -= 10; }
    m.score = Math.max(0, m.score);
    return m;
  }

  calculateVulnScore(vulns) {
    const w = { critical: 10, high: 7, medium: 4, low: 1, info: 0 };
    let total = 0;
    const summary = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    for (const v of vulns) { const s = v.severity || 'info'; summary[s] = (summary[s] || 0) + 1; total += w[s] || 0; }
    const risk = total > 30 ? 'Critical' : total > 20 ? 'High' : total > 10 ? 'Medium' : total > 0 ? 'Low' : 'None';
    return { totalScore: total, riskLevel: risk, summary, details: vulns };
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024, s = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + s[i];
  }

  generateReport(data, options = {}) {
    const { format = 'html', theme = 'dark' } = options;
    if (theme) this.setTheme(theme);
    switch (format) {
      case 'html': return this.generateHtmlReport(data);
      case 'json': return JSON.stringify(data, null, 2);
      case 'markdown': return this.generateMarkdownReport(data);
      default: return this.generateHtmlReport(data);
    }
  }

  generateMarkdownReport(data) {
    let md = '# Living Clone Report\n\n';
    md += '**URL:** ' + data.url + '\n';
    md += '**Date:** ' + new Date().toLocaleString() + '\n\n';
    md += '## Summary\n';
    md += '- Pages: ' + (data.pagesCount || 0) + '\n';
    md += '- Size: ' + this.formatBytes(data.totalSize || 0) + '\n';
    md += '- Duration: ' + (data.duration || 'N/A') + '\n\n';
    if (data.security) {
      md += '## Security Score: ' + data.security.score + '/100\n';
      if (data.security.vulnerabilities?.length > 0) {
        md += '### Vulnerabilities\n';
        data.security.vulnerabilities.forEach(v => { md += '- [' + v.severity.toUpperCase() + '] ' + v.type + ': ' + v.occurrences + '\n'; });
      }
    }
    if (data.seo) { md += '\n## SEO Score: ' + data.seo.score + '/100\n'; }
    if (data.pages?.length > 0) {
      md += '\n## Pages\n';
      data.pages.forEach(p => { md += '- ' + p.url + ' (' + p.status + ')\n'; });
    }
    return md;
  }

  generateHtmlReport(data) {
    const t = this.theme;
    const css = `*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',system-ui,sans-serif;background:${t.background};color:${t.text}}.c{max-width:1400px;margin:0 auto;padding:20px}.hd{text-align:center;padding:40px 0;border-bottom:2px solid ${t.accentBg}}.hd h1{font-size:2.5em;color:${t.primary};margin-bottom:10px}.sub{color:${t.muted}}.g{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:20px;margin:20px 0}.card{background:${t.cardBg};border-radius:12px;padding:25px;box-shadow:0 4px 20px rgba(0,0,0,.3)}.card h2{color:${t.primary};margin-bottom:15px;font-size:1.3em;border-bottom:1px solid ${t.accentBg};padding-bottom:10px}.sb{text-align:center;padding:20px;background:${t.accentBg};border-radius:8px}.sv{font-size:2.5em;color:${t.primary};font-weight:700}.sl{color:${t.muted};margin-top:5px}.sr{width:120px;height:120px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;font-size:2em;font-weight:700}.sg{background:linear-gradient(135deg,#00c853,#00e676);color:#000}.sw{background:linear-gradient(135deg,#ffd600,#ffab00);color:#000}.sb2{background:linear-gradient(135deg,#ff1744,#d50000);color:#fff}.badge{display:inline-block;padding:3px 8px;border-radius:4px;font-size:.85em;font-weight:700}.bc{background:#d50000;color:#fff}.bh{background:#ff6d00;color:#fff}.bm{background:#ffd600;color:#000}.bl{background:#00c853;color:#000}.bi{background:#2979ff;color:#fff}table{width:100%;border-collapse:collapse}th,td{padding:12px;text-align:left;border-bottom:1px solid ${t.accentBg}}th{background:${t.accentBg};color:${t.primary}}.ft{text-align:center;padding:30px;color:${t.muted};margin-top:40px;border-top:1px solid ${t.accentBg}}`;
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Report - ${data.url||'Unknown'}</title><style>${css}</style></head><body><div class="c"><div class="hd"><h1>Living Clone Report</h1><p class="sub">${data.url||''} | ${new Date().toLocaleString()}</p></div><div class="g"><div class="sb"><div class="sv">${data.pagesCount||0}</div><div class="sl">Pages</div></div><div class="sb"><div class="sv">${this.formatBytes(data.totalSize||0)}</div><div class="sl">Size</div></div><div class="sb"><div class="sv">${data.duration||'N/A'}</div><div class="sl">Duration</div></div><div class="sb"><div class="sv">${data.errors||0}</div><div class="sl">Errors</div></div></div>${data.security?`<div class="card"><h2>Security (${data.security.score}/100)</h2><div class="sr ${data.security.score>=80?'sg':data.security.score>=50?'sw':'sb2'}">${data.security.score}</div>${data.security.vulnerabilities?.length>0?`<ul>${data.security.vulnerabilities.map(v=>`<li><span class="badge ${v.severity==='critical'?'bc':v.severity==='high'?'bh':v.severity==='medium'?'bm':'bl'}">${v.severity}</span> ${v.type}: ${v.occurrences}</li>`).join('')}</ul>`:'<p>No vulnerabilities</p>'}</div>`:''}${data.seo?`<div class="card"><h2>SEO (${data.seo.score}/100)</h2>${data.seo.issues?.length>0?`<ul>${data.seo.issues.map(i=>`<li><span class="badge ${i.type==='error'?'bc':'bm'}">${i.type}</span> ${i.message}</li>`).join('')}</ul>`:'<p>Good SEO</p>'}</div>`:''}${data.pages?.length>0?`<div class="card"><h2>Pages</h2><table><thead><tr><th>URL</th><th>Status</th><th>Size</th></tr></thead><tbody>${data.pages.map(p=>`<tr><td>${p.url}</td><td><span class="badge ${p.status<400?'bl':'bh'}">${p.status}</span></td><td>${this.formatBytes(p.size||0)}</td></tr>`).join('')}</tbody></table></div>`:''}<div class="ft">Generated by Living Clone v2.0</div></div></body></html>`;
  }
}

module.exports = ReportGenerator;
