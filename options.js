// options.js — Settings page logic

const $ = id => document.getElementById(id);

async function init() {
  const stored = await chrome.storage.sync.get(['notionToken', 'databaseId']);

  if (stored.notionToken) {
    $('token-input').value = stored.notionToken;
    setConnectionStatus('connected');
    loadDatabases(stored.notionToken, stored.databaseId);
  }
}

// ─── TOKEN ───────────────────────────────────────────────────────────────────

$('save-token-btn').addEventListener('click', async () => {
  const token = $('token-input').value.trim();
  if (!token) { showToast('Please enter a token.', 'error'); return; }

  await chrome.storage.sync.set({ notionToken: token });
  showToast('Token saved!', 'success');
  setConnectionStatus('connected');
  loadDatabases(token, null);
});

$('verify-btn').addEventListener('click', async () => {
  const token = $('token-input').value.trim();
  if (!token) { showToast('Enter a token first.', 'error'); return; }

  const btn = $('verify-btn');
  btn.innerHTML = '<div class="spinner"></div>';
  btn.disabled = true;

  try {
    const res = await chrome.runtime.sendMessage({
      action: 'getDatabases',
      token,
    });

    if (res.success) {
      setConnectionStatus('connected');
      showToast(`Connected! Found ${res.result.length} database(s).`, 'success');
      await chrome.storage.sync.set({ notionToken: token });
      loadDatabases(token, null);
    } else {
      throw new Error(res.error);
    }
  } catch (err) {
    setConnectionStatus('disconnected');
    showToast('Connection failed: ' + err.message, 'error');
  } finally {
    btn.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 16 16" stroke="currentColor" fill="none" stroke-width="1.8">
        <path d="M13 3L6 10l-3-3"/>
      </svg>
      Verify`;
    btn.disabled = false;
  }
});

// ─── SHOW/HIDE TOKEN ─────────────────────────────────────────────────────────

let tokenVisible = false;

$('toggle-vis-btn').addEventListener('click', () => {
  tokenVisible = !tokenVisible;
  $('token-input').type = tokenVisible ? 'text' : 'password';
  $('eye-icon').innerHTML = tokenVisible
    ? `<path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z"/>
       <circle cx="8" cy="8" r="2"/>
       <line x1="2" y1="2" x2="14" y2="14"/>`
    : `<path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z"/>
       <circle cx="8" cy="8" r="2"/>`;
});

// ─── DATABASES ───────────────────────────────────────────────────────────────

async function loadDatabases(token, selectedId) {
  const sel = $('db-select');
  sel.innerHTML = '<option value="">Loading…</option>';

  try {
    const res = await chrome.runtime.sendMessage({
      action: 'getDatabases',
      token,
    });

    if (!res.success) throw new Error(res.error);
    const dbs = res.result;

    if (!dbs.length) {
      sel.innerHTML = '<option value="">No databases found. Create one from the popup.</option>';
      return;
    }

    sel.innerHTML = dbs.map(db =>
      `<option value="${db.id}">${escapeHtml(db.name)}</option>`
    ).join('');

    const stored = await chrome.storage.sync.get('databaseId');
    const current = selectedId || stored.databaseId;
    if (current && dbs.find(d => d.id === current)) {
      sel.value = current;
    }

  } catch (err) {
    sel.innerHTML = '<option value="">Failed to load databases</option>';
    showToast('Could not load databases: ' + err.message, 'error');
  }
}

$('refresh-dbs-btn').addEventListener('click', async () => {
  const stored = await chrome.storage.sync.get('notionToken');
  if (!stored.notionToken) { showToast('Save a token first.', 'error'); return; }
  loadDatabases(stored.notionToken, null);
});

$('save-db-btn').addEventListener('click', async () => {
  const val = $('db-select').value;
  if (!val) { showToast('Select a database first.', 'error'); return; }
  await chrome.storage.sync.set({ databaseId: val });
  showToast('Default database saved!', 'success');
});

// ─── STATUS ──────────────────────────────────────────────────────────────────

function setConnectionStatus(state) {
  const el = $('connection-status');
  if (state === 'connected') {
    el.innerHTML = `<div class="status connected"><div class="status-dot"></div>Connected</div>`;
  } else {
    el.innerHTML = `<div class="status disconnected"><div class="status-dot"></div>Not connected</div>`;
  }
}

// ─── UTILS ───────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showToast(message, type = 'success', duration = 4000) {
  const toast = $('toast');
  toast.textContent = message;
  toast.className = `toast ${type}`;
  toast.style.display = 'block';
  setTimeout(() => { toast.style.display = 'none'; }, duration);
}

// ─── START ───────────────────────────────────────────────────────────────────

init();
