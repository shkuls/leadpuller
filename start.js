#!/usr/bin/env node
const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO_URL = 'https://github.com/shkuls/leadpuller.git';
const APP_DIR = path.join(__dirname, 'leadpuller');

function run(cmd, opts = {}) {
  console.log('> ' + cmd);
  execSync(cmd, { stdio: 'inherit', ...opts });
}

function installed(cmd) {
  try { execSync(cmd, { stdio: 'ignore' }); return true; }
  catch { return false; }
}

function getPlaywrightDir() {
  if (process.platform === 'win32')
    return path.join(process.env.LOCALAPPDATA || '', 'ms-playwright');
  if (process.platform === 'darwin')
    return path.join(process.env.HOME || '', 'Library', 'Caches', 'ms-playwright');
  return path.join(process.env.HOME || '', '.cache', 'ms-playwright');
}

// 1. Git check
if (!installed('git --version')) {
  console.error('\nGit is not installed.');
  console.error('Download from: https://git-scm.com/download\n');
  process.exit(1);
}

// 2. Clone or pull
if (!fs.existsSync(path.join(APP_DIR, '.git'))) {
  console.log('\nDownloading LeadPuller...');
  run(`git clone "${REPO_URL}" "${APP_DIR}"`);
} else {
  console.log('\nUpdating LeadPuller...');
  run(`git -C "${APP_DIR}" pull --ff-only`);
}

// 3. npm install
if (!fs.existsSync(path.join(APP_DIR, 'node_modules'))) {
  console.log('\nInstalling packages...');
  run('npm install', { cwd: APP_DIR });
}

// 4. Playwright chromium
const playwrightDir = getPlaywrightDir();
const chromiumInstalled = fs.existsSync(playwrightDir) &&
  fs.readdirSync(playwrightDir).some(d => d.startsWith('chromium'));

if (!chromiumInstalled) {
  console.log('\nInstalling browser (one-time, may take a minute)...');
  run('npx playwright install chromium', { cwd: APP_DIR });
}

// 5. Start server + open browser
console.log('\n✓ Starting LeadPuller at http://localhost:3456\n');

setTimeout(() => {
  const openCmd = process.platform === 'win32' ? 'start ""' :
                  process.platform === 'darwin' ? 'open' : 'xdg-open';
  spawn(openCmd + ' http://localhost:3456', [], { shell: true, detached: true, stdio: 'ignore' }).unref();
}, 2000);

const server = spawn('node', ['server.js'], { cwd: APP_DIR, stdio: 'inherit' });
server.on('exit', code => process.exit(code || 0));
