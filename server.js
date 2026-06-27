import http from 'http';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const PORT = 3456;
const __dir = path.dirname(fileURLToPath(import.meta.url));
// Persistent profile dir — stores full browser state (cookies + localStorage + IndexedDB)
// This means login survives across restarts, just like a real browser profile.
const PROFILE_DIR = path.join(__dir, 'browser-profile');

let loginBrowser = null, loginPage = null;
let stopRequested = false;

function profileExists() {
  // Profile is valid if the directory exists and has some content
  return existsSync(PROFILE_DIR) && existsSync(path.join(PROFILE_DIR, 'Default'));
}

const GENERIC = /^(info|hello|support|contact|sales|admin|marketing|security|hr|careers|team|office|hey|hi|help|noreply|no-reply|mail|connect|gro|bd|press|media|legal|billing|ops|operations|enquiries?|enquiry|feedback|ethics|compliance|privacy|press|ir|invest)@/i;

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Tracxn Scraper</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f0f2f5; min-height: 100vh; padding: 32px 20px; }
  .wrap { max-width: 980px; margin: 0 auto; }
  h1 { font-size: 20px; font-weight: 700; color: #111; margin-bottom: 4px; }
  .sub { color: #888; font-size: 13px; margin-bottom: 24px; }
  .card { background: white; border-radius: 12px; padding: 28px; box-shadow: 0 1px 8px rgba(0,0,0,0.07); margin-bottom: 20px; }
  .row { display: flex; gap: 12px; align-items: flex-end; }
  .field { flex: 1; }
  .field.small { flex: 0 0 140px; }
  label { display: block; font-size: 12px; font-weight: 600; color: #555; margin-bottom: 5px; text-transform: uppercase; letter-spacing: .4px; }
  input { width: 100%; padding: 9px 12px; border: 1.5px solid #e0e0e0; border-radius: 8px; font-size: 14px; outline: none; transition: border-color .15s; }
  input:focus { border-color: #6366f1; }
  button.primary { padding: 9px 22px; background: #6366f1; color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; white-space: nowrap; }
  button.primary:hover:not(:disabled) { background: #4f46e5; }
  button.primary:disabled { background: #c7d2fe; cursor: not-allowed; }
  button.danger { padding: 9px 22px; background: #ef4444; color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; white-space: nowrap; display: none; }
  button.danger:hover { background: #dc2626; }
  button.danger.show { display: inline-block; }
  .session { display: flex; align-items: center; gap: 8px; font-size: 13px; margin-bottom: 20px; padding: 9px 14px; border-radius: 8px; }
  .session.ok  { background: #f0fdf4; color: #15803d; }
  .session.bad { background: #fef2f2; color: #dc2626; }
  .dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .dot.green { background: #16a34a; } .dot.red { background: #dc2626; }
  button.login-btn { margin-left: auto; padding: 5px 14px; background: #6366f1; color: white; border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; }
  button.login-btn:hover { background: #4f46e5; }
  button.login-btn:disabled { background: #c7d2fe; cursor: not-allowed; }
  .login-note { font-size: 12px; color: #64748b; margin-top: 10px; padding: 8px 12px; background: #f8fafc; border-radius: 6px; display: none; }
  .login-note.show { display: block; }
  .login-actions { display: none; gap: 10px; margin-top: 10px; margin-bottom: 16px; }
  .login-actions.show { display: flex; }
  /* Progress */
  .progress { display: none; align-items: center; gap: 12px; margin-top: 16px; }
  .progress.show { display: flex; }
  .bar-wrap { flex: 1; height: 6px; background: #e2e8f0; border-radius: 99px; overflow: hidden; }
  .bar { height: 100%; background: #6366f1; border-radius: 99px; transition: width .4s; width: 0%; }
  .pct { font-size: 12px; color: #64748b; min-width: 44px; text-align: right; }
  /* Log */
  .log-box { background: #0f172a; border-radius: 8px; padding: 14px 16px; font-family: monospace; font-size: 12px; line-height: 1.7; height: 200px; overflow-y: auto; display: none; margin-top: 14px; }
  .log-box.show { display: block; }
  .log-line { display: block; white-space: nowrap; }
  .log-line.ok   { color: #4ade80; }
  .log-line.skip { color: #475569; }
  .log-line.err  { color: #f87171; }
  .log-line.info { color: #94a3b8; }
  /* Actions */
  .actions { display: none; gap: 10px; margin-top: 16px; }
  .actions.show { display: flex; }
  a.dl { padding: 9px 22px; background: #16a34a; color: white; border-radius: 8px; font-size: 14px; font-weight: 600; text-decoration: none; }
  a.dl:hover { background: #15803d; }
  button.ghost { padding: 9px 22px; background: white; color: #64748b; border: 1.5px solid #e0e0e0; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
  button.ghost:hover { background: #f8fafc; }
  /* Table */
  .tbl-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
  .summary { font-size: 13px; color: #64748b; }
  .summary b { color: #1e293b; }
  .tbl-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; padding: 9px 12px; background: #f8fafc; color: #64748b; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; border-bottom: 1px solid #e2e8f0; white-space: nowrap; }
  td { padding: 9px 12px; border-bottom: 1px solid #f1f5f9; color: #1e293b; vertical-align: top; max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: #fafafa; }
  td a { color: #6366f1; text-decoration: none; font-size: 12px; }
  td a:hover { text-decoration: underline; }
  .badge { display: inline-block; font-size: 11px; padding: 2px 8px; border-radius: 99px; background: #f0fdf4; color: #15803d; font-weight: 600; }
  .no-data { text-align: center; padding: 40px; color: #94a3b8; font-size: 14px; }
</style>
</head>
<body>
<div class="wrap">
  <h1>Tracxn People Scraper</h1>
  <p class="sub">Paste a Tracxn feed or search URL, set how many companies you want, and download a CSV of people with emails and LinkedIn.</p>

  <div class="card">
    <!-- Session -->
    <div class="session" id="sess">
      <div class="dot" id="dot"></div>
      <span id="sessText">Checking session...</span>
      <button class="login-btn" id="loginBtn" onclick="startLogin()">Open Tracxn</button>
    </div>
    <div class="login-note" id="loginNote">A browser window has opened — log in with Google, then click <b>Save Session</b>. The window stays open so you can browse Tracxn and copy any URL to paste here.</div>
    <div class="login-actions" id="loginActions">
      <button class="primary" onclick="saveSession()">Save Session</button>
      <button class="ghost" onclick="cancelLogin()">Cancel</button>
    </div>

    <!-- Controls -->
    <div class="row">
      <div class="field">
        <label>Tracxn URL</label>
        <input id="urlInput" type="text" placeholder="https://platform.tracxn.com/a/s/feed/..." />
      </div>
      <div class="field small">
        <label>Companies with emails</label>
        <input id="targetInput" type="number" value="50" min="1" max="500" />
      </div>
      <button class="primary" id="scrapeBtn" onclick="startScrape()" disabled>Scrape</button>
      <button class="danger" id="stopBtn" onclick="stopScrape()">Stop</button>
    </div>

    <!-- Progress -->
    <div class="progress" id="progressWrap">
      <div class="bar-wrap"><div class="bar" id="bar"></div></div>
      <span class="pct" id="pct">0%</span>
    </div>

    <!-- Log -->
    <div class="log-box" id="log"></div>

    <!-- Post-scrape actions -->
    <div class="actions" id="actions">
      <a class="dl" id="dlBtn" href="/download" download="people.csv">Download CSV</a>
      <button class="ghost" onclick="clearAll()">Clear</button>
    </div>
  </div>

  <!-- Live results table -->
  <div class="card" id="resultsCard" style="display:none">
    <div class="tbl-header">
      <div class="summary" id="summary">0 people</div>
    </div>
    <div class="tbl-wrap">
      <table>
        <thead>
          <tr><th>#</th><th>Company</th><th>Person</th><th>Title</th><th>Email</th><th>LinkedIn</th></tr>
        </thead>
        <tbody id="tbody"></tbody>
      </table>
      <div class="no-data" id="noData" style="display:none">No results yet.</div>
    </div>
  </div>
</div>

<script>
  let allRows = [], rowCount = 0, target = 50;

  // ── Session ──────────────────────────────────────────────────────────────────
  async function checkSession() {
    const r = await fetch('/session-status').then(r => r.json());
    const dot = document.getElementById('dot');
    const text = document.getElementById('sessText');
    const sess = document.getElementById('sess');
    if (r.ok) {
      dot.className = 'dot green'; sess.className = 'session ok';
      text.textContent = 'Logged in — ready to scrape';
      document.getElementById('scrapeBtn').disabled = false;
    } else {
      dot.className = 'dot red'; sess.className = 'session bad';
      text.textContent = 'Not logged in';
      document.getElementById('scrapeBtn').disabled = true;
    }
  }
  checkSession();

  async function startLogin() {
    document.getElementById('loginBtn').disabled = true;
    document.getElementById('loginBtn').textContent = 'Opening...';
    await fetch('/login-open', { method: 'POST' });
    document.getElementById('loginNote').className = 'login-note show';
    document.getElementById('loginActions').className = 'login-actions show';
    document.getElementById('loginBtn').textContent = 'Open Tracxn';
  }
  async function saveSession() {
    document.getElementById('loginActions').className = 'login-actions';
    document.getElementById('loginNote').textContent = 'Saving...';
    const r = await fetch('/login-save', { method: 'POST' }).then(r => r.json());
    document.getElementById('loginNote').className = 'login-note';
    document.getElementById('loginBtn').disabled = false;
    r.ok ? checkSession() : alert('Error: ' + r.error);
  }
  async function cancelLogin() {
    await fetch('/login-cancel', { method: 'POST' });
    document.getElementById('loginNote').className = 'login-note';
    document.getElementById('loginActions').className = 'login-actions';
    document.getElementById('loginBtn').disabled = false;
  }

  // ── Log ──────────────────────────────────────────────────────────────────────
  function log(text, type) {
    const box = document.getElementById('log');
    const line = document.createElement('span');
    line.className = 'log-line ' + (type || 'info');
    line.textContent = text;
    box.appendChild(line);
    box.scrollTop = box.scrollHeight;
  }

  // ── Progress ─────────────────────────────────────────────────────────────────
  function setProgress(done, total) {
    const pct = total ? Math.min(100, Math.round((done / total) * 100)) : 0;
    document.getElementById('bar').style.width = pct + '%';
    document.getElementById('pct').textContent = done + '/' + total;
  }

  // ── Table: append one row live ────────────────────────────────────────────────
  function appendRow(p) {
    rowCount++;
    allRows.push(p);
    document.getElementById('resultsCard').style.display = 'block';
    const tbody = document.getElementById('tbody');
    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td style="color:#94a3b8">' + rowCount + '</td>' +
      '<td>' + esc(p.company) + '</td>' +
      '<td><b>' + esc(p.person_name) + '</b></td>' +
      '<td style="color:#64748b">' + esc(p.title) + '</td>' +
      '<td>' + (p.email ? '<span class="badge">' + esc(p.email) + '</span>' : '<span style="color:#cbd5e1">—</span>') + '</td>' +
      '<td>' + (p.linkedin ? '<a href="' + esc(p.linkedin) + '" target="_blank">View →</a>' : '') + '</td>';
    tbody.appendChild(tr);

    const withEmail = allRows.filter(r => r.email).length;
    const withLi = allRows.filter(r => r.linkedin).length;
    document.getElementById('summary').innerHTML =
      '<b>' + allRows.length + '</b> people &nbsp;·&nbsp; <b>' + withEmail + '</b> emails &nbsp;·&nbsp; <b>' + withLi + '</b> LinkedIn';
  }

  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── Scrape ───────────────────────────────────────────────────────────────────
  async function startScrape() {
    const url = document.getElementById('urlInput').value.trim();
    target = parseInt(document.getElementById('targetInput').value) || 50;
    if (!url) { alert('Paste a Tracxn URL first.'); return; }

    // Reset UI
    allRows = []; rowCount = 0;
    document.getElementById('scrapeBtn').disabled = true;
    document.getElementById('stopBtn').className = 'danger show';
    document.getElementById('log').className = 'log-box show';
    document.getElementById('log').innerHTML = '';
    document.getElementById('progressWrap').className = 'progress show';
    document.getElementById('actions').className = 'actions';
    document.getElementById('resultsCard').style.display = 'none';
    document.getElementById('tbody').innerHTML = '';
    setProgress(0, target);

    const res = await fetch('/scrape', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url, target }),
    });

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\\n');
        buf = lines.pop();
        for (const line of lines) {
          if (!line) continue;
          if (line.startsWith('ROW:')) {
            try { appendRow(JSON.parse(line.slice(4))); } catch {}
          } else if (line.startsWith('PROGRESS:')) {
            const [d, t] = line.slice(9).split('/').map(Number);
            setProgress(d, t);
          } else if (line.includes('✓')) {
            log(line, 'ok');
          } else if (line.includes('skip')) {
            log(line, 'skip');
          } else if (line.includes('ERROR') || line.includes('Stopped')) {
            log(line, 'err');
          } else {
            log(line, 'info');
          }
        }
      }
    } catch (e) {
      log('Connection ended: ' + e.message, 'err');
    }

    setProgress(target, target);
    document.getElementById('scrapeBtn').disabled = false;
    document.getElementById('stopBtn').className = 'danger';
    document.getElementById('actions').className = 'actions show';
  }

  async function stopScrape() {
    document.getElementById('stopBtn').disabled = true;
    document.getElementById('stopBtn').textContent = 'Stopping...';
    await fetch('/stop', { method: 'POST' });
    document.getElementById('stopBtn').disabled = false;
    document.getElementById('stopBtn').textContent = 'Stop';
  }

  function clearAll() {
    allRows = []; rowCount = 0;
    document.getElementById('log').className = 'log-box';
    document.getElementById('progressWrap').className = 'progress';
    document.getElementById('actions').className = 'actions';
    document.getElementById('resultsCard').style.display = 'none';
    document.getElementById('tbody').innerHTML = '';
    document.getElementById('urlInput').value = '';
  }
</script>
</body>
</html>`;

// ── Scrape logic ──────────────────────────────────────────────────────────────
function saveCSV(people) {
  const headers = ['company', 'company_website', 'person_name', 'title', 'email', 'linkedin'];
  const rows = [headers.join(',')];
  for (const p of people) {
    rows.push(headers.map(h => '"' + String(p[h] || '').replace(/"/g, '""') + '"').join(','));
  }
  writeFileSync('people.csv', rows.join('\n'));
}

async function runScrape(url, target, write) {
  stopRequested = false;

  if (!profileExists()) {
    write('ERROR: Not logged in — click Re-login in the UI\n'); return;
  }
  // Use persistent context so Google SSO session stays alive long-term
  const browser = await chromium.launchPersistentContext(PROFILE_DIR, { headless: true });
  const page = browser.pages()[0] || await browser.newPage();

  let interceptedBody = null;
  page.on('request', (req) => {
    if (req.url().includes('/api/4.0/companies') && req.method() === 'POST'
      && !req.url().includes('count') && !req.url().includes('aggregation') && !interceptedBody) {
      try {
        const body = JSON.parse(req.postData() || '{}');
        if (!body.filter?.id) interceptedBody = body;
      } catch {}
    }
  });

  write('Loading page...\n');
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  // Check if we got redirected to login
  const currentUrl = page.url();
  if (currentUrl.includes('login') || currentUrl.includes('signin') || currentUrl.includes('accounts.google')) {
    write('ERROR: Session expired — click Re-login in the UI to log in again.\n');
    await browser.close(); return;
  }

  // If no API call was intercepted, the page may not have loaded the table yet — try scrolling
  if (!interceptedBody) {
    write('Waiting for table to load...\n');
    await page.evaluate(() => window.scrollTo(0, 300));
    await page.waitForTimeout(3000);
  }

  if (!interceptedBody) {
    write('ERROR: Could not detect a company list on this page.\n');
    write('Make sure the URL points to a Tracxn company table (feed, sector, search results).\n');
    await browser.close(); return;
  }
  write('Filter detected. Starting scrape...\n');

  async function apiPost(path, body) {
    const r = await page.evaluate(async ({ path, body }) => {
      const res = await fetch('https://platform.tracxn.com' + path, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      });
      return { status: res.status, text: await res.text() };
    }, { path, body });
    if (r.status !== 200) throw new Error(path + ' → HTTP ' + r.status + ': ' + r.text.substring(0, 200));
    return JSON.parse(r.text);
  }

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const BATCH = 10;
  const allPeople = [];
  let companiesWithEmail = 0, companiesChecked = 0, from = 0, totalInFeed = null;

  outer: while (companiesWithEmail < target) {
    if (stopRequested) break;

    const data = await apiPost('/api/4.0/companies', { ...interceptedBody, size: BATCH, from });
    const batch = data.result || [];
    if (totalInFeed === null) totalInFeed = data.total_count ?? 9999;
    if (!batch.length) { write('No more companies in feed.\n'); break; }
    from += batch.length;

    for (const c of batch) {
      if (companiesWithEmail >= target || stopRequested) break outer;
      companiesChecked++;
      const company = { id: c.id, name: c.name || c.id, website: c.website?.[0]?.url || '' };
      write('[' + companiesWithEmail + '/' + target + ' | #' + companiesChecked + '] ' + company.name + ' ... ');

      try {
        const peopleData = await apiPost('/api/4.0/people', {
          dataset: 'query',
          filter: { or: [
            { companyWorkExperienceHasFounded: true, companyId: [company.id] },
            { companyId: [company.id], companyWorkExperienceIsKeyWorkExperience: true },
          ]},
          size: 100,
        });
        const people = peopleData.result || [];
        if (!people.length) { write('skip (no people)\n'); await sleep(300); continue; }

        const wxData = await apiPost('/api/4.0/workexperience', {
          dataset: 'query',
          filter: { workExperienceCompanyId: [company.id], peopleId: people.map(p => p.id) },
          sort: [{ sortField: 'createdDate', order: 'DEFAULT' }],
          size: 100,
        });

        const emailMap = {};
        for (const p of people) { const e = p.contact?.emails?.[0]; if (e) emailMap[p.id] = e; }
        for (const wx of wxData.result || []) {
          const pid = wx.people?.id, email = wx.contact?.emails?.[0];
          if (pid && email && !emailMap[pid]) emailMap[pid] = email;
        }
        for (const [pid, email] of Object.entries(emailMap)) {
          if (GENERIC.test(email)) delete emailMap[pid];
        }

        if (!Object.keys(emailMap).length) { write('skip (no personal emails)\n'); await sleep(300); continue; }

        companiesWithEmail++;
        write('PROGRESS:' + companiesWithEmail + '/' + target + '\n');

        let emailCount = 0;
        for (const p of people) {
          const email = emailMap[p.id] || '';
          if (email) emailCount++;
          const person = {
            company: company.name, company_website: company.website,
            person_name: ((p.name?.firstName || '') + ' ' + (p.name?.lastName || '')).trim(),
            title: p.summary || p.currentKeyWorkExperience?.[0]?.designation || '',
            email, linkedin: p.socialMediaProfiles?.linkedin?.[0] || '',
          };
          allPeople.push(person);
          write('ROW:' + JSON.stringify(person) + '\n');
        }
        write('✓ ' + people.length + ' people, ' + emailCount + ' emails\n');
      } catch (err) { write('ERROR: ' + err.message + '\n'); }
      await sleep(300);
    }
    if (from >= totalInFeed) { write('Reached end of feed.\n'); break; }
  }

  if (stopRequested) write('Stopped. Saving collected data...\n');

  await browser.close(); // persistent context flushes profile to disk on close
  saveCSV(allPeople);

  const withEmail = allPeople.filter(p => p.email).length;
  write('\nDone — ' + allPeople.length + ' people across ' + companiesWithEmail + ' companies | ' + withEmail + ' emails\n');
}

// ── HTTP server ───────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {

  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'content-type': 'text/html' }); res.end(HTML);

  } else if (req.method === 'GET' && req.url === '/session-status') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: profileExists() }));

  } else if (req.method === 'POST' && req.url === '/login-open') {
    if (loginBrowser) { try { await loginBrowser.close(); } catch {} }
    mkdirSync(PROFILE_DIR, { recursive: true });
    // launchPersistentContext saves full browser state to disk automatically
    loginBrowser = await chromium.launchPersistentContext(PROFILE_DIR, { headless: false });
    loginPage = loginBrowser.pages()[0] || await loginBrowser.newPage();
    await loginPage.goto('https://platform.tracxn.com', { waitUntil: 'domcontentloaded' });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));

  } else if (req.method === 'POST' && req.url === '/login-save') {
    try {
      if (!loginBrowser) throw new Error('No login browser open');
      // Flush profile to disk without closing — user keeps browsing in same window
      await loginBrowser.storageState({ path: path.join(PROFILE_DIR, 'state.json') }).catch(() => {});
      // Mark profile as valid by ensuring Default dir exists
      mkdirSync(path.join(PROFILE_DIR, 'Default'), { recursive: true });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }

  } else if (req.method === 'POST' && req.url === '/login-cancel') {
    if (loginBrowser) { try { await loginBrowser.close(); } catch {} loginBrowser = null; loginPage = null; }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));

  } else if (req.method === 'POST' && req.url === '/stop') {
    stopRequested = true;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));

  } else if (req.method === 'POST' && req.url === '/scrape') {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', async () => {
      let parsed;
      try { parsed = JSON.parse(body); } catch { res.writeHead(400); res.end('Bad request'); return; }
      const { url, target } = parsed;
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'transfer-encoding': 'chunked' });
      try {
        await runScrape(url, target || 50, t => { if (!res.writableEnded) res.write(t); });
      } catch (err) {
        if (!res.writableEnded) res.write('ERROR: ' + err.message + '\n');
      }
      if (!res.writableEnded) res.end();
    });

  } else if (req.method === 'GET' && req.url === '/download') {
    if (!existsSync('people.csv')) { res.writeHead(404); res.end('No file yet'); return; }
    res.writeHead(200, { 'content-type': 'text/csv', 'content-disposition': 'attachment; filename="people.csv"' });
    res.end(readFileSync('people.csv'));

  } else { res.writeHead(404); res.end(); }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('Port ' + PORT + ' already in use. Run: lsof -ti:' + PORT + ' | xargs kill -9');
  } else {
    console.error('Server error:', err.message);
  }
  process.exit(1);
});

server.listen(PORT, () => {
  console.log('\nTracxn Scraper → http://localhost:' + PORT + '\n');
});
