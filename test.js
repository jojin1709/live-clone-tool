#!/usr/bin/env node

const { execSync } = require('child_process');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');

console.log(chalk.green('\n🧪 Living Clone - Test Script\n'));

const testUrl = 'https://example.com';
const testOutput = 'test-clone';

console.log(chalk.blue('Testing with: ' + testUrl));
console.log(chalk.blue('Output folder: ' + testOutput));
console.log('');

try {
  // Test 1: Basic clone
  console.log(chalk.yellow('Test 1: Basic clone...'));
  execSync(`node clone.js clone ${testUrl} -o ${testOutput} -j "console.log('test')"`, { 
    cwd: __dirname,
    stdio: 'inherit'
  });
  
  // Check if files were created
  if (fs.existsSync(path.join(__dirname, testOutput, 'index.html'))) {
    console.log(chalk.green('✅ Basic clone test passed'));
  } else {
    console.log(chalk.red('❌ Basic clone test failed'));
  }
  
  // Clean up
  fs.rmSync(path.join(__dirname, testOutput), { recursive: true, force: true });
  console.log(chalk.blue('🧹 Cleaned up test files'));
  
  console.log(chalk.green('\n✅ All tests completed!\n'));
  
} catch (error) {
  console.log(chalk.red('\n❌ Test failed: ' + error.message));
  process.exit(1);
}
