/* ============================================================
   BEV — Shared Presentation Viewer
   Handles ?presentation=TOKEN URLs for anonymous read-only access.
   No auth, no editing, no toolbars.
   ============================================================ */

'use strict';

/* ── Constants ───────────────────────────────────────────── */

const QUERY_KEY        = 'presentation';
const BAR_IDLE_MS      = 2800;   // ms after last mouse move before bar fades
const FIREBASE_CONFIG  = window.BEV_FIREBASE_CONFIG || null;

/* ── State ───────────────────────────────────────────────── */

let _fbApp  = null;
let _fbDb   = null;
let _data   = null;   // raw Firestore payload
let _idleTimer = null;

/* ── URL helpers ─────────────────────────────────────────── */

function getShareToken() {
  try {
    return (new URLSearchParams(window.location.search).get(QUERY_KEY) || '').trim();
  } catch {
    return '';
  }
}

function getBaseAppUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete(QUERY_KEY);
  url.hash = '';
  return url.toString();
}

/* ── Firebase bootstrap (minimal – no auth) ──────────────── */

function initFirebase() {
  if (_fbApp) return true;
  if (!FIREBASE_CONFIG) return false;
  try {
    _fbApp = firebase.apps.length
      ? firebase.apps[0]
      : firebase.initializeApp(FIREBASE_CONFIG);
    _fbDb = firebase.firestore();
    return true;
  } catch {
    return false;
  }
}

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function fetchPresentation(token) {
  const snap = await withTimeout(
    _fbDb.collection('public_presentations').doc(token).get(),
    45000,
    'Request timed out',
  );
  return snap.exists ? snap.data() : null;
}

/* ── HTML escape ─────────────────────────────────────────── */

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ── Status helpers ──────────────────────────────────────── */

const STATUS_SLUG = {
  'In Progress': 'in-progress',
  'On Going':    'on-going',
  'Done':        'done',
  'Cancelled':   'cancelled',
  'Postponed':   'postponed',
  'On Hold':     'on-hold',
};

function statusSlug(s) {
  return STATUS_SLUG[s] || String(s || '').toLowerCase().replace(/\s+/g, '-');
}

/* ── Type helpers (mirrors BEVCore) ──────────────────────── */

function canonicalType(t) {
  return t === 'text' ? 'note' : t;
}

function isTextNote(t) {
  return t === 'note' || t === 'text';
}

function isSharedTextType(t) {
  return ['note', 'text', 'heading', 'frame'].includes(t);
}

/* ── Card rendering ──────────────────────────────────────── */

function renderProjectCard(item) {
  const snap = item.snapshot;
  if (!snap) return null;

  const el = document.createElement('div');
  el.className = 'project-card';
  el.style.cssText = `
    left: ${item.x || 0}px;
    top:  ${item.y || 0}px;
    --card-accent: ${esc(snap.color || '#fff')};
    width: ${Math.max(snap.w || 280, 280)}px;
    cursor: default;
  `;

  const date = snap.created
    ? new Date(snap.created).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';

  el.innerHTML = `
    <div class="card-meta"><span class="card-date">${esc(date)}</span></div>
    <div class="card-title">${esc(snap.name || 'Untitled')}</div>
    ${snap.desc ? `<div class="card-desc">${esc(snap.desc)}</div>` : ''}
    <div class="card-bottom" style="justify-content:flex-start">
      <div class="card-bottom-meta">
        <div class="card-status" data-status="${statusSlug(snap.status)}">
          ${esc(snap.status || 'In Progress')}
        </div>
        <div class="card-stats">
          <div class="card-stat"><span>${snap.nodeCount ?? 0}</span> nodes</div>
          <div class="card-stat"><span>${snap.connectionCount ?? 0}</span> links</div>
        </div>
      </div>
    </div>`;

  return el;
}

/* ── Overlay object rendering ────────────────────────────── */

function renderTextHTML(text) {
  return esc(String(text || '')).replace(/\n/g, '<br>');
}

function renderOverlayObject(obj) {
  const type = canonicalType(obj.type);
  const el = document.createElement('div');
  el.style.cssText = `position:absolute; left:${obj.x || 0}px; top:${obj.y || 0}px;`;

  if (type === 'line') {
    el.innerHTML = `<div class="overview-item-line" style="width:${obj.w || 220}px"></div>`;
    return el;
  }

  if (type === 'frame') {
    el.className = 'overview-item-frame';
    el.style.width  = `${obj.w || 260}px`;
    el.style.height = `${obj.h || 180}px`;
    el.innerHTML = `<div class="content" style="pointer-events:none">${esc(obj.text || 'Group')}</div>`;
    return el;
  }

  if (type === 'heading') {
    el.innerHTML = `<div class="shared-heading-text" style="pointer-events:none">${renderTextHTML(obj.text || '')}</div>`;
    return el;
  }

  if (isTextNote(type)) {
    // render as a read-only node card
    el.className = `node node-${type}`;
    if (obj.w) el.style.width  = `${obj.w}px`;
    if (obj.h) el.style.height = `${obj.h}px`;
    el.innerHTML = `
      <div class="node-accent-line" style="background:#333"></div>
      <div class="node-header">
        <span class="node-type-label">${esc(obj.customTitle || 'Note')}</span>
      </div>
      <div class="node-body">
        <div class="node-content" style="pointer-events:none">${renderTextHTML(obj.text || '')}</div>
      </div>`;
    return el;
  }

  return null;
}

/* ── Main render ─────────────────────────────────────────── */

function renderViewer(data) {
  const world = document.getElementById('viewer-world');
  if (!world) return;
  world.innerHTML = '';

  // Overlay objects (notes, headings, lines, frames)
  const objects = (data.objects || []).filter(o =>
    ['note', 'text', 'heading', 'line', 'frame'].includes(canonicalType(o.type))
  );
  objects.forEach(obj => {
    const el = renderOverlayObject(obj);
    if (el) world.appendChild(el);
  });

  // Project cards
  (data.items || []).forEach(item => {
    const el = renderProjectCard(item);
    if (el) world.appendChild(el);
  });

  // Update bar title
  const titleEl = document.getElementById('viewer-title');
  if (titleEl) titleEl.textContent = data.name || 'Presentation';
}

/* ── Idle-bar logic ──────────────────────────────────────── */

function resetIdleTimer() {
  const bar = document.getElementById('viewer-bar');
  if (!bar) return;
  bar.classList.remove('idle');
  clearTimeout(_idleTimer);
  _idleTimer = setTimeout(() => bar.classList.add('idle'), BAR_IDLE_MS);
}

/* ── Loading / error UI ──────────────────────────────────── */

function showLoading(show) {
  const el = document.getElementById('viewer-loading');
  if (!el) return;
  if (show) {
    el.classList.add('is-active');
    el.classList.remove('hidden');
  } else {
    el.classList.remove('is-active');
    el.classList.add('hidden');
  }
}

function showUnavailable(show) {
  const el = document.getElementById('viewer-unavailable');
  if (el) el.classList.toggle('visible', show);
}

/* ── Scroll-to-fit ───────────────────────────────────────── */

function scrollToContent(data) {
  const canvas = document.getElementById('viewer-canvas');
  if (!canvas) return;

  const all = [
    ...(data.items || []).map(i => ({ x: i.x || 0, y: i.y || 0, w: 320, h: 220 })),
    ...(data.objects || []).map(o => ({ x: o.x || 0, y: o.y || 0, w: o.w || 220, h: o.h || 40 })),
  ];
  if (!all.length) return;

  const minX = Math.min(...all.map(i => i.x));
  const minY = Math.min(...all.map(i => i.y));
  const PAD = 60;
  canvas.scrollLeft = Math.max(0, minX - PAD);
  canvas.scrollTop  = Math.max(0, minY - PAD);
}

/* ── Entry point ─────────────────────────────────────────── */

async function startViewer() {
  const token = getShareToken();
  if (!token) {
    showLoading(false);
    return false;
  }

  // Hide all other screens, show viewer loading
  document.querySelectorAll('[id^="screen-"]').forEach(s => s.style.display = 'none');
  const screen = document.getElementById('screen-shared-presentation');
  if (screen) screen.style.display = 'block';
  showLoading(true);
  showUnavailable(false);

  // Wire "Open BEV" links to the base URL
  const baseUrl = getBaseAppUrl();
  document.querySelectorAll('.viewer-open-btn, .viewer-unavailable-cta').forEach(el => {
    if (el.tagName === 'A') el.href = baseUrl;
    else el.addEventListener('click', () => window.location.href = baseUrl);
  });

  wireViewerShareControls();

  // Firebase
  if (!initFirebase()) {
    showLoading(false);
    showUnavailable(true);
    return true;
  }

  try {
    _data = await fetchPresentation(token);
  } catch {
    _data = null;
  }

  showLoading(false);

  if (!_data) {
    showUnavailable(true);
    return true;
  }

  // Render
  renderViewer(_data);
  scrollToContent(_data);

  // Idle bar
  document.addEventListener('mousemove', resetIdleTimer, { passive: true });
  document.addEventListener('touchstart', resetIdleTimer, { passive: true });
  resetIdleTimer();

  return true;
}

/* ── Copy share link helper (called from owner view) ─────── */

function buildShareUrl(token) {
  const url = new URL(window.location.href);
  url.searchParams.set(QUERY_KEY, token);
  url.hash = '';
  return url.toString();
}

/* ── Clipboard helper ────────────────────────────────────── */

async function copyToClipboard(text) {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    try { await navigator.clipboard.writeText(text); return true; } catch {}
  }
  try {
    const ta = Object.assign(document.createElement('textarea'), {
      value: text, readOnly: true,
    });
    Object.assign(ta.style, { position: 'fixed', opacity: '0', pointerEvents: 'none' });
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}

function showViewerToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

/** Share sheet (if supported) or copy the current viewer URL — works without main app scripts. */
function wireViewerShareControls() {
  const shareBtn = document.getElementById('viewer-share-btn');
  if (!shareBtn) return;
  shareBtn.onclick = async () => {
    const token = getShareToken();
    if (!token) return;
    const url = buildShareUrl(token);
    const title = (_data && _data.name) ? String(_data.name) : 'Presentation';
    if (navigator.share && window.isSecureContext) {
      try {
        await navigator.share({
          title,
          text: 'View this Bird Eye View presentation',
          url,
        });
        showViewerToast('Link shared');
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return;
      }
    }
    const ok = await copyToClipboard(url);
    if (ok) showViewerToast('Link copied to clipboard');
    else window.prompt('Copy this viewer link:', url);
  };
}

/* ── Exports ─────────────────────────────────────────────── */

window.BEVViewer = {
  start: startViewer,
  buildShareUrl,
  copyToClipboard,
  getShareToken,
  getBaseAppUrl,
};
