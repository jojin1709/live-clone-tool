#!/usr/bin/env node

const chalk = require('chalk');

console.log(chalk.green('\n🔒 Living Clone - XSS Testing Tool\n'));

console.log(chalk.yellow('Available Commands:'));
console.log('  clone <url>     - Clone a website');
console.log('  serve [folder]  - Serve a cloned site');
console.log('');

console.log(chalk.yellow('Clone Options:'));
console.log('  -o, --output       Output folder (default: cloned-site)');
console.log('  -j, --inject       JavaScript code to inject');
console.log('  -f, --inject-file  JavaScript file to inject');
console.log('  -s, --serve        Start server after cloning');
console.log('  -p, --port         Server port (default: 8080)');
console.log('  --no-images        Skip downloading images');
console.log('  --no-css           Skip downloading CSS');
console.log('');

console.log(chalk.yellow('Examples:'));
console.log('  node clone.js clone https://example.com');
console.log('  node clone.js clone https://example.js -j "alert(1)"');
console.log('  node clone.js clone https://example.js -f payloads/xss-default.js');
console.log('  node clone.js serve cloned-site -p 3000');
console.log('');

console.log(chalk.yellow('Available Payloads:'));
console.log('  payloads/xss-default.js   - Basic XSS test payload');
console.log('  payloads/cookie-stealer.js - Cookie monitoring payload');
console.log('  payloads/form-grabber.js   - Form data capture payload');
console.log('');

console.log(chalk.cyan('Legal Disclaimer:'));
console.log('  For educational and authorized testing only!');
console.log('');
