<div align="center">

# Living Clone

**Advanced Website Cloning & Security Testing Tool**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-16%2B-green.svg)](https://nodejs.org/)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20Linux-blue.svg)]()

---

**Living Clone** is a powerful, cross-platform CLI tool for cloning websites and comprehensive security testing. It supports deep crawling, vulnerability scanning (XSS, SQLi, CSRF, XXE, SSRF, LFI, Command Injection, Path Traversal, and more), browser automation for SPAs, and extensive customization.

**This tool is for educational and authorized security testing purposes only.**

</div>

---

## Table of Contents

- [Features](#features)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Usage](#usage)
- [Commands](#commands)
- [Configuration](#configuration)
- [Modules](#modules)
- [Examples](#examples)
- [Contributing](#contributing)
- [License](#license)
- [Disclaimer](#disclaimer)
- [Developer](#developer)

## Features

### Core Features
- **Deep Crawling** - Crawl entire websites with configurable depth and page limits
- **JavaScript Injection** - Inject custom XSS payloads into cloned pages
- **Local Server** - Built-in server to view and test cloned sites
- **Session Management** - Save and restore cookies, localStorage, sessionStorage

### Browser Automation (Puppeteer)
- **SPA Support** - Clone JavaScript-rendered single-page applications
- **Headless Chrome** - Run browser automation in headless mode
- **Dynamic Content** - Wait for async loading, auto-scroll, click elements
- **Device Emulation** - Test mobile/tablet views

### Security Testing
- **WAF Detection** - Identify Cloudflare, Akamai, AWS WAF, and 15+ other WAFs
- **Technology Fingerprinting** - Detect CMS, frameworks, server software
- **Vulnerability Scanning** - Find XSS, SQLi, CSRF, XXE, SSRF, LFI, Command Injection, Path Traversal, Insecure Deserialization, and more
- **Header Analysis** - Check security headers (HSTS, CSP, X-Frame-Options, etc.)
- **SSL Analysis** - Certificate validation and expiry checking
- **Cookie Security** - Analyze HttpOnly, Secure, SameSite flags

### Advanced Crawling
- **Parallel Crawling** - Multi-threaded crawling with concurrency control
- **Resume Support** - Save and resume interrupted crawls
- **Response Caching** - Cache responses for faster re-runs
- **Broken Link Detection** - Find and report broken links

### Batch Operations
- **Batch Clone** - Clone multiple URLs from a file
- **Watch Mode** - Monitor URLs for changes with notifications
- **Comparison** - Diff two clones to find changes

### Integration
- **REST API** - Programmatic access to all features
- **Burp Suite** - Send requests to Burp for further testing
- **OWASP ZAP** - Integration with ZAP security scanner
- **Webhooks** - Slack, Discord, custom webhook notifications
- **HAR Export** - Export/Import HTTP Archive format

### Reports & Analysis
- **SEO Analysis** - Meta tags, headings, Open Graph, schema markup
- **Performance Metrics** - Page size, load time, resource counts
- **Vulnerability Scoring** - CVSS-style risk assessment
- **Multiple Themes** - Dark, Light, Hacker, Cyberpunk report themes
- **Export Formats** - HTML, PDF, JSON, Markdown, ZIP

### Developer Experience
- **Cross-Platform** - Works on Windows, Linux, and macOS
- **Plugin System** - Extend functionality with custom plugins
- **Configuration Files** - JSON config with preset profiles
- **Detailed Logging** - Winston-based logging with file output
- **Web Dashboard** - Real-time monitoring UI

## Quick Start

### Prerequisites

- **Node.js 16+** - [Download Node.js](https://nodejs.org/)
- **Git** (optional) - For cloning the repository
- **Puppeteer** (optional) - For browser automation features

### Installation

```bash
# Clone the repository
git clone https://github.com/jojinjohn/living-clone.git

# Navigate to directory
cd living-clone

# Install dependencies
npm install
```

### Basic Usage

```bash
# Clone a website
node clone.js clone https://example.com

# Clone with custom injection
node clone.js clone https://example.com -j "alert('XSS')"

# Clone with pre-built payload
node clone.js clone https://example.com -f payloads/xss-default.js

# Run security scan
node clone.js security https://example.com

# Start web dashboard
node clone.js dashboard
```

## Commands

| Command | Description |
|---------|-------------|
| `clone <url>` | Clone a website with injection |
| `security <url>` | Run security scan |
| `browser <url>` | Clone with Puppeteer (SPA support) |
| `batch <file>` | Batch clone from URL file |
| `watch <urls>` | Monitor URLs for changes |
| `compare <dir1> <dir2>` | Compare two clones |
| `serve [folder]` | Serve a cloned site |
| `session` | Manage sessions |
| `export <folder>` | Export clone data |
| `api` | Start REST API server |
| `dashboard` | Start web dashboard |
| `config` | Manage configuration |
| `payloads` | List available payloads |
| `themes` | List report themes |
| `har` | Export/Import HAR files |
| `webhook` | Send notifications |
| `integrations` | Manage integrations |
| `crawl-state` | Manage crawl state |

### Clone Options

| Option | Description |
|--------|-------------|
| `-o, --output <folder>` | Output folder (default: cloned-site) |
| `-j, --inject <js>` | JavaScript code to inject |
| `-f, --inject-file <file>` | JavaScript file to inject |
| `-s, --serve` | Start server after cloning |
| `-p, --port <port>` | Server port (default: 8080) |
| `-d, --depth <level>` | Crawl depth (default: 1) |
| `--max-pages <num>` | Max pages to crawl |
| `--proxy <url>` | HTTP/SOCKS5 proxy |
| `--rate-limit <ms>` | Delay between requests |
| `--user-agent <ua>` | Custom User-Agent |
| `--rotate-ua` | Rotate User-Agent |
| `--basic-auth <user:pass>` | Basic authentication |
| `--token <token>` | Bearer token |
| `--cookie <name=value>` | Add cookie |
| `--header <name:value>` | Add header |
| `--config <file>` | Config file |
| `--preset <name>` | Preset profile |
| `--export-zip` | Export as ZIP |
| `--export-pdf` | Generate PDF report |
| `--export-html` | Generate HTML report |
| `--export-json` | Generate JSON report |

## Configuration

### Generate Config File

```bash
node clone.js config --init
```

### Config File Example

```json
{
  "depth": 3,
  "maxPages": 100,
  "rateLimit": 1000,
  "proxy": null,
  "auth": {
    "type": "basic",
    "username": "user",
    "password": "pass"
  },
  "security": {
    "rotateUserAgent": true,
    "antiFingerprint": true
  },
  "injection": {
    "position": "body"
  }
}
```

### Preset Profiles

| Preset | Description |
|--------|-------------|
| `aggressive` | Deep crawl, many pages, no delay |
| `stealth` | Slow, rotating UA, anti-fingerprint |
| `fast` | Quick scan, skip images |
| `thorough` | Maximum depth and pages |

```bash
node clone.js clone https://example.com --preset stealth
```

## Modules

| Module | Description |
|--------|-------------|
| `lib/browser.js` | Puppeteer browser automation |
| `lib/security.js` | Security scanning engine |
| `lib/crawler.js` | Web crawler |
| `lib/advanced-crawler.js` | Parallel crawl, resume, cache |
| `lib/session.js` | Session management |
| `lib/interceptor.js` | Request/response interception |
| `lib/plugin.js` | Plugin system |
| `lib/export.js` | Export (ZIP, PDF, HTML) |
| `lib/batch.js` | Batch operations, watch |
| `lib/api.js` | REST API server |
| `lib/integration.js` | Burp, ZAP, webhooks, HAR |
| `lib/reports.js` | Report generation |
| `lib/dashboard.js` | Web dashboard |
| `lib/config.js` | Configuration management |
| `lib/logger.js` | Logging system |
| `lib/websocket.js` | WebSocket proxy |

## Examples

### Clone with Authentication

```bash
# Basic auth
node clone.js clone https://app.example.com --basic-auth admin:password123

# Bearer token
node clone.js clone https://api.example.com --token eyJhbGciOiJIUzI1NiIs...

# With cookies
node clone.js clone https://app.example.com --cookie session=abc123 --cookie token=xyz789
```

### Stealth Mode

```bash
node clone.js clone https://target.com --preset stealth --proxy socks5://127.0.0.1:1080
```

### Deep Crawl with Export

```bash
node clone.js clone https://example.com -d 5 --max-pages 500 --export-zip --export-html --export-pdf
```

### Security Scan

```bash
# Basic scan
node clone.js security https://example.com

# Save report
node clone.js security https://example.com --output report.html
```

### Browser Automation (SPA)

```bash
# Clone React/Vue/Angular app
node clone.js browser https://spa.example.com --wait 5000 --scroll --screenshot

# With device emulation
node clone.js browser https://example.com --emulate "iPhone 12"
```

### Batch Operations

```bash
# Create URL file
echo "https://example.com
https://test.com
https://demo.com" > urls.txt

# Batch clone
node clone.js batch urls.txt -c 5 --delay 2000 --export results.json
```

### Watch Mode

```bash
# Monitor for changes
node clone.js watch "https://example.com,https://news.com" --interval 3600000
```

### REST API

```bash
# Start API server
node clone.js api -p 3000

# Use API
curl -X POST http://localhost:3000/api/clone -H "Content-Type: application/json" -d '{"url": "https://example.com"}'
```

### Web Dashboard

```bash
# Start dashboard
node clone.js dashboard -p 9090

# Open http://localhost:9090
```

## Payloads

| Payload | Description |
|---------|-------------|
| `xss-default.js` | Visual indicator + activity logging |
| `cookie-stealer.js` | Cookie monitoring |
| `form-grabber.js` | Form submission capture |

### Custom Payload Example

```javascript
// Save as custom-payload.js
(function() {
  console.log('[XSS] Payload active on:', window.location.href);
  
  // Visual indicator
  var div = document.createElement('div');
  div.innerHTML = '<div style="position:fixed;top:10px;right:10px;background:red;color:white;padding:10px;z-index:99999">XSS TEST</div>';
  document.body.appendChild(div);
  
  // Log clicks
  document.addEventListener('click', function(e) {
    console.log('Click:', e.target);
  });
  
  // Log forms
  document.querySelectorAll('form').forEach(function(f) {
    f.addEventListener('submit', function() {
      console.log('Form submitted:', f.action);
    });
  });
})();
```

```bash
node clone.js clone https://example.com -f custom-payload.js
```

## Platform Support

### Windows
```powershell
# PowerShell
node clone.js clone https://example.com

# Or using npx
npx living-clone clone https://example.com
```

### Linux (Ubuntu/Kali)
```bash
# Make executable
chmod +x clone.js

# Run
./clone.js clone https://example.com

# Or
node clone.js clone https://example.com
```

### macOS
```bash
node clone.js clone https://example.com
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Security

See [SECURITY.md](SECURITY.md) for reporting vulnerabilities.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Disclaimer

**WARNING**: This tool is for educational and authorized security testing purposes only. Always obtain proper authorization before testing on any website you don't own. The developer is not responsible for any misuse of this tool.

## Developer

<div align="center">

**Developed by JOJIN JOHN**

[![GitHub](https://img.shields.io/badge/GitHub-jojinjohn-181717?style=for-the-badge&logo=github)](https://github.com/jojinjohn)

</div>

---

<div align="center">

**Made with ❤️ for the Security Community**

</div>
