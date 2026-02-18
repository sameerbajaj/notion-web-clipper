// popup.js — Notion Clipper extension popup logic

const $ = id => document.getElementById(id);

let state = {
  token: null,
  databaseId: null,
  databases: [],
  pageData: null,
  tags: [],
  selectedPageId: null,
  savedPageUrl: null,
  dbSchema: null,        // { customProps: [...] }
  extraProperties: {},   // user-selected values for dynamic props
};

// ─── INIT ───────────────────────────────────────────────────────────────────

async function init() {
  // Load stored settings
  const stored = await chrome.storage.sync.get(['notionToken', 'databaseId']);
  state.token = stored.notionToken || null;
  state.databaseId = stored.databaseId || null;

  if (!state.token) {
    showScreen('setup');
    return;
  }

  showScreen('clip');
  await loadPageData();
  loadDatabases();
}

// ─── SCREEN MANAGEMENT ──────────────────────────────────────────────────────

function showScreen(name) {
  $('setup-screen').style.display = 'none';
  $('clip-screen').style.display = 'none';
  $('success-screen').style.display = 'none';

  if (name === 'setup') $('setup-screen').style.display = 'flex';
  if (name === 'clip') $('clip-screen').style.display = 'flex';
  if (name === 'success') $('success-screen').style.display = 'flex';
}

// ─── PAGE DATA ───────────────────────────────────────────────────────────────

async function loadPageData() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    let data = null;
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'getPageData' });
      if (response?.success) data = response.data;
    } catch (e) {
      // Content script may not be injected yet — try injecting
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js'],
      });
      const response2 = await chrome.tabs.sendMessage(tab.id, { action: 'getPageData' });
      if (response2?.success) data = response2.data;
    }

    if (!data) {
      // Fallback to tab info
      data = {
        title: tab.title || '',
        url: tab.url || '',
        description: '',
        author: '',
        publishedDate: '',
        coverImage: tab.favIconUrl || '',
        siteName: new URL(tab.url || 'https://example.com').hostname.replace('www.', ''),
        keywords: [],
        content: [],
        type: 'webpage',
      };
    }

    state.pageData = data;
    populateForm(data);
  } catch (err) {
    console.error('Failed to load page data:', err);
    showToast('Could not extract page data. ' + err.message);
  }
}

function populateForm(data) {
  // Title
  $('title-input').value = data.title || '';

  // URL
  $('source-url').textContent = truncateUrl(data.url || '');
  $('source-url').title = data.url || '';

  // Author
  $('author-input').value = data.author || '';

  // Published date
  if (data.publishedDate) {
    try {
      const d = new Date(data.publishedDate);
      if (!isNaN(d.getTime())) {
        $('published-input').value = d.toISOString().split('T')[0];
      }
    } catch (_) {}
  }

  // Description
  $('desc-input').value = data.description || '';

  // Tags from keywords
  if (data.keywords?.length) {
    data.keywords.slice(0, 5).forEach(k => addTag(k));
  }

  // Cover image
  if (data.coverImage) {
    const img = $('cover-img');
    img.src = data.coverImage;
    img.style.display = 'block';
    $('cover-no-image').style.display = 'none';
    img.onerror = () => {
      img.style.display = 'none';
      $('cover-no-image').style.display = 'flex';
    };
  }

  // Type badge
  $('type-badge').textContent = data.type || 'webpage';
}
function truncateUrl(url) {
  try {
    const u = new URL(url);
    let path = u.hostname + u.pathname;
    if (path.length > 42) path = path.slice(0, 40) + '…';
    return path;
  } catch {
    return url.slice(0, 42);
  }
}

// ─── TAGS ────────────────────────────────────────────────────────────────────

function addTag(name) {
  name = name.trim().toLowerCase();
  if (!name || state.tags.includes(name)) return;
  state.tags.push(name);
  renderTags();
}

function removeTag(name) {
  state.tags = state.tags.filter(t => t !== name);
  renderTags();
}

function renderTags() {
  const area = $('tags-area');
  const input = $('tag-input');

  // Remove old tags
  area.querySelectorAll('.tag').forEach(t => t.remove());

  // Insert before input
  state.tags.forEach(tag => {
    const el = document.createElement('span');
    el.className = 'tag';
    el.innerHTML = `
      ${escapeHtml(tag)}
      <button class="tag-remove" title="Remove tag">
        <svg viewBox="0 0 12 12" stroke-width="2">
          <line x1="2" y1="2" x2="10" y2="10"/>
          <line x1="10" y1="2" x2="2" y2="10"/>
        </svg>
      </button>`;
    el.querySelector('.tag-remove').addEventListener('click', () => removeTag(tag));
    area.insertBefore(el, input);
  });
}

$('tag-input').addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    addTag(e.target.value);
    e.target.value = '';
  }
  if (e.key === 'Backspace' && !e.target.value && state.tags.length) {
    removeTag(state.tags[state.tags.length - 1]);
  }
});

$('tag-input').addEventListener('blur', e => {
  if (e.target.value.trim()) {
    addTag(e.target.value);
    e.target.value = '';
  }
});

// ─── DATABASES ───────────────────────────────────────────────────────────────

async function loadDatabases() {
  const sel = $('db-select');
  sel.innerHTML = '<option value="">Loading…</option>';

  try {
    const res = await chrome.runtime.sendMessage({
      action: 'getDatabases',
      token: state.token,
    });

    if (!res.success) throw new Error(res.error);
    state.databases = res.result;

    if (!state.databases.length) {
      sel.innerHTML = '<option value="">No databases found — create one</option>';
      return;
    }

    sel.innerHTML = state.databases.map(db =>
      `<option value="${db.id}">${escapeHtml(db.name)}</option>`
    ).join('');

    // Restore previously selected DB
    if (state.databaseId && state.databases.find(d => d.id === state.databaseId)) {
      sel.value = state.databaseId;
    } else {
      state.databaseId = state.databases[0].id;
      sel.value = state.databaseId;
    }

    // Load schema for the selected DB
    loadDatabaseSchema(state.databaseId);

  } catch (err) {
    sel.innerHTML = '<option value="">Failed to load — check token</option>';
    showToast('Could not load Notion databases. ' + err.message);
  }
}

$('db-select').addEventListener('change', e => {
  state.databaseId = e.target.value;
  chrome.storage.sync.set({ databaseId: state.databaseId });
  if (state.databaseId) loadDatabaseSchema(state.databaseId);
});

// ─── DYNAMIC DB SCHEMA ───────────────────────────────────────────────────────

async function loadDatabaseSchema(databaseId) {
  const container = $('dyn-props-container');
  const section = $('dyn-props-section');
  state.extraProperties = {};

  if (!databaseId || !state.token) {
    section.style.display = 'none';
    return;
  }

  container.innerHTML = '<div class="dyn-loading">Loading properties…</div>';
  section.style.display = 'flex';

  try {
    const res = await chrome.runtime.sendMessage({
      action: 'getDatabase',
      token: state.token,
      databaseId,
    });

    if (!res.success) throw new Error(res.error);
    state.dbSchema = res.result;

    if (!res.result.customProps.length) {
      section.style.display = 'none';
      return;
    }

    renderDynamicProps(res.result.customProps);

  } catch (err) {
    section.style.display = 'none';
    console.warn('Could not load DB schema:', err.message);
  }
}

function renderDynamicProps(props) {
  const container = $('dyn-props-container');
  container.innerHTML = '';

  props.forEach(prop => {
    const isMulti = prop.type === 'multi_select';

    const el = document.createElement('div');
    el.className = 'dyn-prop';
    el.innerHTML = `
      <div class="dyn-prop-header">
        <span class="dyn-prop-icon">${isMulti ? '⋱' : '▽'}</span>
        <span class="dyn-prop-name">${escapeHtml(prop.name)}</span>
        <span class="dyn-prop-type">${isMulti ? 'multi' : 'select'}</span>
      </div>
      <div class="options-grid" data-prop="${escapeHtml(prop.name)}" data-multi="${isMulti}"></div>
    `;

    const grid = el.querySelector('.options-grid');

    prop.options.forEach(opt => {
      const chip = document.createElement('span');
      chip.className = 'opt-chip' + (isMulti ? ' multi' : '');
      chip.textContent = opt.name;
      chip.dataset.value = opt.name;
      chip.dataset.color = opt.color || 'default';

      chip.addEventListener('click', () => {
        if (isMulti) {
          chip.classList.toggle('selected');
          const cur = state.extraProperties[prop.name] || [];
          if (chip.classList.contains('selected')) {
            state.extraProperties[prop.name] = [...cur, opt.name];
          } else {
            state.extraProperties[prop.name] = cur.filter(v => v !== opt.name);
          }
        } else {
          // single select — deselect others
          grid.querySelectorAll('.opt-chip').forEach(c => c.classList.remove('selected'));
          const alreadySelected = state.extraProperties[prop.name] === opt.name;
          if (alreadySelected) {
            chip.classList.remove('selected');
            state.extraProperties[prop.name] = null;
          } else {
            chip.classList.add('selected');
            state.extraProperties[prop.name] = opt.name;
          }
        }
      });

      grid.appendChild(chip);
    });

    container.appendChild(el);
  });
}

// ─── SAVE ────────────────────────────────────────────────────────────────────

$('save-btn').addEventListener('click', async () => {
  if (!state.token) { showToast('No Notion token set. Open settings.'); return; }
  if (!state.databaseId) { showToast('Please select or create a database.'); return; }

  const saveBtn = $('save-btn');
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<div class="spinner"></div> Saving…';

  try {
    const payload = {
      token: state.token,
      databaseId: state.databaseId,
      pageData: {
        ...state.pageData,
        title: $('title-input').value || state.pageData?.title || 'Untitled',
        author: $('author-input').value,
        publishedDate: $('published-input').value,
        description: $('desc-input').value,
        tags: state.tags,
        url: state.pageData?.url || '',
        content: $('save-content-toggle').checked ? state.pageData?.content : [],
      },
      extraProperties: state.extraProperties,
    };

    const res = await chrome.runtime.sendMessage({
      action: 'saveToNotion',
      payload,
    });

    if (!res.success) throw new Error(res.error);

    // Save the URL of created page
    state.savedPageUrl = res.result?.url || null;

    // Show success
    showSuccessScreen();

  } catch (err) {
    saveBtn.disabled = false;
    saveBtn.innerHTML = `
      <svg viewBox="0 0 16 16" stroke-width="2" stroke="currentColor" fill="none">
        <path d="M2 8l4 4 8-8"/>
      </svg>
      Save to Notion`;
    showToast(err.message || 'Failed to save. Please try again.');
  }
});

function showSuccessScreen() {
  const title = $('title-input').value || 'Untitled';
  $('success-sub').textContent = `"${title.slice(0, 50)}" saved to Notion.`;

  if (state.savedPageUrl) {
    $('success-notion-link').href = state.savedPageUrl;
    $('success-notion-link').style.display = 'inline-flex';
  } else {
    $('success-notion-link').style.display = 'none';
  }

  showScreen('success');
}

// ─── CREATE DATABASE MODAL ───────────────────────────────────────────────────

let pageSearchTimer = null;

$('create-db-btn').addEventListener('click', () => {
  $('modal-overlay').style.display = 'flex';
  $('modal-page-search').focus();
  searchPages('');
});

$('modal-cancel').addEventListener('click', () => {
  $('modal-overlay').style.display = 'none';
  state.selectedPageId = null;
});

$('modal-overlay').addEventListener('click', e => {
  if (e.target === $('modal-overlay')) {
    $('modal-overlay').style.display = 'none';
    state.selectedPageId = null;
  }
});

$('modal-page-search').addEventListener('input', e => {
  clearTimeout(pageSearchTimer);
  pageSearchTimer = setTimeout(() => searchPages(e.target.value), 300);
});

async function searchPages(query) {
  const results = $('page-search-results');
  results.innerHTML = '<div style="color: var(--text-muted); font-size:12px; padding:8px; text-align:center;">Searching…</div>';

  try {
    const res = await chrome.runtime.sendMessage({
      action: 'searchPages',
      token: state.token,
      query,
    });

    if (!res.success) throw new Error(res.error);

    const pages = res.result;
    if (!pages.length) {
      results.innerHTML = '<div style="color: var(--text-muted); font-size:12px; padding:8px; text-align:center;">No pages found</div>';
      return;
    }

    results.innerHTML = '';
    pages.forEach(page => {
      const el = document.createElement('div');
      el.className = 'page-result';
      el.innerHTML = `<span class="page-result-icon">📄</span>${escapeHtml(page.name)}`;
      el.addEventListener('click', () => {
        state.selectedPageId = page.id;
        results.querySelectorAll('.page-result').forEach(p => p.classList.remove('selected'));
        el.classList.add('selected');
        $('modal-create-btn').disabled = false;
      });
      results.appendChild(el);
    });

  } catch (err) {
    results.innerHTML = `<div style="color:var(--error); font-size:12px; padding:8px;">Error: ${escapeHtml(err.message)}</div>`;
  }
}

$('modal-create-btn').addEventListener('click', async () => {
  if (!state.selectedPageId) return;

  const btn = $('modal-create-btn');
  btn.disabled = true;
  btn.textContent = 'Creating…';

  try {
    const res = await chrome.runtime.sendMessage({
      action: 'createDatabase',
      payload: {
        token: state.token,
        parentPageId: state.selectedPageId,
        databaseName: $('modal-db-name').value || 'Web Clippings',
      },
    });

    if (!res.success) throw new Error(res.error);

    const newDb = {
      id: res.result.id,
      name: res.result.title?.[0]?.plain_text || $('modal-db-name').value || 'Web Clippings',
    };

    state.databases.unshift(newDb);
    state.databaseId = newDb.id;
    chrome.storage.sync.set({ databaseId: state.databaseId });

    // Update selector
    const sel = $('db-select');
    const opt = document.createElement('option');
    opt.value = newDb.id;
    opt.textContent = newDb.name;
    sel.insertBefore(opt, sel.firstChild);
    sel.value = newDb.id;

    $('modal-overlay').style.display = 'none';
    state.selectedPageId = null;

    // Load schema for new DB
    loadDatabaseSchema(newDb.id);

  } catch (err) {
    showToast(err.message || 'Failed to create database');
    btn.disabled = false;
    btn.textContent = 'Create Database';
  }
});

// ─── SETTINGS / REFRESH ─────────────────────────────────────────────────────

$('settings-btn').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

$('open-setup-btn').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

$('refresh-btn').addEventListener('click', async () => {
  state.tags = [];
  renderTags();
  const img = $('cover-img');
  img.style.display = 'none';
  $('cover-no-image').style.display = 'flex';
  await loadPageData();
});

// ─── UTILS ───────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showToast(message, duration = 4000) {
  const toast = $('error-toast');
  toast.textContent = message;
  toast.style.display = 'block';
  setTimeout(() => { toast.style.display = 'none'; }, duration);
}

// ─── TITLE AUTO-RESIZE ───────────────────────────────────────────────────────

$('title-input').addEventListener('input', function() {
  this.style.height = 'auto';
  this.style.height = this.scrollHeight + 'px';
});

// ─── START ───────────────────────────────────────────────────────────────────

init();
