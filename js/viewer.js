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

function closeViewerCardInspect() {
  const root = document.getElementById('viewer-card-inspect');
  if (!root) return;
  root.classList.remove('visible');
  root.setAttribute('aria-hidden', 'true');
}

function renderPublicNodeInspect(node) {
  const t = canonicalType(node.type);
  const typeLabel = esc(String(node.customTitle || t || 'Item'));
  if (t === 'heading') {
    return `<section class="viewer-inspect-block viewer-inspect-block-heading"><h3>${renderTextHTML(node.text)}</h3></section>`;
  }
  if (isTextNote(t)) {
    return `<section class="viewer-inspect-block"><div class="viewer-inspect-kind">${typeLabel}</div><div class="viewer-inspect-text">${renderTextHTML(node.text)}</div></section>`;
  }
  if (t === 'frame') {
    return `<section class="viewer-inspect-block"><div class="viewer-inspect-kind">Area — ${typeLabel}</div><div class="viewer-inspect-text">${renderTextHTML(node.text)}</div></section>`;
  }
  if (t === 'line') {
    return '<section class="viewer-inspect-block viewer-inspect-block-muted"><span class="viewer-inspect-kind">Line</span></section>';
  }
  if (t === 'progress') {
    const val = Math.round(Math.min(100, Math.max(0, Number(node.value) || 0)));
    let stepsHtml = '';
    if (Array.isArray(node.steps) && node.steps.length) {
      stepsHtml =
        '<ul class="viewer-inspect-bullets">' +
        node.steps
          .map((s, i) => {
            const lab = esc(String(s.label || `Step ${i + 1}`));
            const done = s.done ? ' class="is-done"' : '';
            return `<li${done}>${lab}</li>`;
          })
          .join('') +
        '</ul>';
    }
    return `<section class="viewer-inspect-block"><div class="viewer-inspect-kind">Progress</div><div class="viewer-inspect-text">${esc(String(val))}%</div>${stepsHtml}</section>`;
  }
  if (t === 'embed') {
    const u = String(node.url || '').trim();
    const safe = esc(u);
    return u
      ? `<section class="viewer-inspect-block"><div class="viewer-inspect-kind">Embed</div><a class="viewer-inspect-link" href="${safe}" target="_blank" rel="noopener noreferrer">${safe}</a></section>`
      : '<section class="viewer-inspect-block viewer-inspect-block-muted"><div class="viewer-inspect-kind">Embed</div><p class="viewer-inspect-muted">No URL</p></section>';
  }
  if (t === 'file') {
    const isImg = node.fileKind === 'image';
    const name = esc(node.name || 'File');
    const ext = esc(node.ext || '');
    const extra = isImg
      ? '<p class="viewer-inspect-muted">Image preview is not included in the shared view.</p>'
      : '';
    const extBit = ext ? ` <span class="viewer-inspect-muted">.${ext}</span>` : '';
    return `<section class="viewer-inspect-block"><div class="viewer-inspect-kind">File</div><div class="viewer-inspect-text">${name}${extBit}</div>${extra}</section>`;
  }
  if (t === 'bullet') {
    const items = (node.items || []).map((it) => {
      const text = typeof it === 'string' ? it : (it.text || '');
      const done = typeof it === 'object' && it.done ? ' class="is-done"' : '';
      return `<li${done}>${renderTextHTML(text)}</li>`;
    }).join('');
    return `<section class="viewer-inspect-block"><div class="viewer-inspect-kind">List</div><ul class="viewer-inspect-bullets">${items || '<li class="viewer-inspect-muted">Empty list</li>'}</ul></section>`;
  }
  return `<section class="viewer-inspect-block"><div class="viewer-inspect-kind">${typeLabel}</div><pre class="viewer-inspect-pre">${esc(JSON.stringify(node).slice(0, 500))}</pre></section>`;
}

function openViewerCardInspect(item) {
  const root = document.getElementById('viewer-card-inspect');
  const titleEl = document.getElementById('viewer-card-inspect-title');
  const bodyEl = document.getElementById('viewer-card-inspect-body');
  if (!root || !titleEl || !bodyEl) return;
  const snap = item.snapshot || {};
  titleEl.textContent = snap.name || 'Card';
  const hasNodes = Array.isArray(snap.nodes) && snap.nodes.length;
  let html = '';
  if ((snap.desc || '').trim()) {
    html += `<p class="viewer-inspect-desc">${esc(snap.desc)}</p>`;
  }
  if (hasNodes) {
    html += '<div class="viewer-inspect-nodes">';
    const sorted = snap.nodes.slice().sort((a, b) =>
      (a.y || 0) - (b.y || 0) || (a.x || 0) - (b.x || 0),
    );
    sorted.forEach((n) => {
      html += renderPublicNodeInspect(n);
    });
    html += '</div>';
    if (Array.isArray(snap.connections) && snap.connections.length) {
      html += `<p class="viewer-inspect-conn-meta">${snap.connections.length} connection(s) between items on this card (not drawn in this read-only view).</p>`;
    }
  } else {
    html += '<p class="viewer-inspect-legacy">This shared card does not include saved note content yet. Ask the owner to open the presentation in BEV and use Share again so the latest version is published.</p>';
    html += '<p class="viewer-inspect-legacy-sub">You can still read the summary on the slide.</p>';
  }
  bodyEl.innerHTML = html;
  root.classList.add('visible');
  root.setAttribute('aria-hidden', 'false');
}

function initViewerCardInspect() {
  const backdrop = document.getElementById('viewer-card-inspect-backdrop');
  const closeBtn = document.getElementById('viewer-card-inspect-close');
  if (backdrop && !backdrop.dataset.bound) {
    backdrop.dataset.bound = '1';
    backdrop.addEventListener('click', closeViewerCardInspect);
  }
  if (closeBtn && !closeBtn.dataset.bound) {
    closeBtn.dataset.bound = '1';
    closeBtn.addEventListener('click', closeViewerCardInspect);
  }
  if (!window.__bevViewerInspectEsc) {
    window.__bevViewerInspectEsc = true;
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const depth = document.getElementById('viewer-card-depth');
      if (depth && depth.classList.contains('is-open')) {
        closeViewerCardDepth();
        return;
      }
      const root = document.getElementById('viewer-card-inspect');
      if (root && root.classList.contains('visible')) closeViewerCardInspect();
    });
  }
}

function renderProjectCard(item) {
  const snap = item.snapshot;
  if (!snap) return null;

  const el = document.createElement('div');
  el.className = 'project-card viewer-shared-card';
  el.style.cssText = `
    left: ${item.x || 0}px;
    top:  ${item.y || 0}px;
    --card-accent: ${esc(snap.color || '#fff')};
    width: ${Math.max(snap.w || 280, 280)}px;
    cursor: pointer;
  `;
  el.title = 'Click to open this card — same layout as in BEV (read-only)';

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

  el.addEventListener('click', () => openViewerCardDepth(item));
  return el;
}

/* ── Overlay object rendering ────────────────────────────── */

function renderTextHTML(text) {
  return esc(String(text || '')).replace(/\n/g, '<br>');
}

function depthCurve(f, t) {
  const dx = t.x - f.x;
  return `M${f.x},${f.y} C${f.x + dx * 0.5},${f.y} ${f.x + dx * 0.5},${t.y} ${t.x},${t.y}`;
}

function viewerDepthDefaultSize(nd) {
  const t = canonicalType(nd.type);
  if (t === 'line') return { w: nd.w || 220, h: nd.h || 8 };
  if (t === 'heading') return { w: nd.w || 280, h: nd.h || 72 };
  if (t === 'frame') return { w: nd.w || 260, h: nd.h || 180 };
  if (t === 'bullet') return { w: nd.w || 220, h: nd.h || 120 };
  if (t === 'progress') return { w: nd.w || 220, h: nd.h || 100 };
  if (t === 'embed') return { w: nd.w || 260, h: nd.h || 120 };
  if (t === 'file') return { w: nd.w || 220, h: nd.h || 100 };
  return { w: nd.w || 180, h: nd.h || 96 };
}

function viewerDepthNodeCenter(nd) {
  const { w, h } = viewerDepthDefaultSize(nd);
  return { x: (nd.x || 0) + w / 2, y: (nd.y || 0) + h / 2 };
}

function renderViewerDepthConnections(svg, nodes, connections) {
  svg.innerHTML = '';
  const byId = Object.fromEntries(nodes.map((n) => [String(n.id), n]));
  (connections || []).forEach((c) => {
    const fn = byId[String(c.fromId)];
    const tn = byId[String(c.toId)];
    if (!fn || !tn) return;
    const f = viewerDepthNodeCenter(fn);
    const t = viewerDepthNodeCenter(tn);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', depthCurve(f, t));
    path.setAttribute('class', 'conn-line');
    path.style.pointerEvents = 'none';
    svg.appendChild(path);
    const ang = Math.atan2(t.y - f.y, t.x - f.x);
    const ax = t.x - 10 * Math.cos(ang);
    const ay = t.y - 10 * Math.sin(ang);
    const arr = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    arr.setAttribute(
      'points',
      `${t.x},${t.y} ${ax + 4 * Math.sin(ang)},${ay - 4 * Math.cos(ang)} ${ax - 4 * Math.sin(ang)},${ay + 4 * Math.cos(ang)}`,
    );
    arr.setAttribute('fill', '#333');
    arr.style.pointerEvents = 'none';
    svg.appendChild(arr);
  });
}

function renderViewerDepthNode(nd, accent) {
  const t = canonicalType(nd.type);
  const el = document.createElement('div');
  el.className = `viewer-depth-node-el node node-${t}`;
  el.style.left = `${nd.x || 0}px`;
  el.style.top = `${nd.y || 0}px`;
  const ac = esc(accent || '#888');

  if (t === 'line') {
    el.style.width = `${nd.w || 220}px`;
    el.innerHTML = '<div class="content overview-item-line"></div>';
    el.style.transform = `rotate(${Number(nd.lineAngle) || 0}rad)`;
    return el;
  }
  if (t === 'frame') {
    el.classList.add('overview-item-frame');
    el.style.width = `${nd.w || 260}px`;
    el.style.height = `${nd.h || 180}px`;
    el.innerHTML = `<div class="content">${renderTextHTML(nd.text)}</div>`;
    return el;
  }
  if (t === 'heading') {
    if (nd.w) el.style.width = `${nd.w}px`;
    if (nd.h) el.style.height = `${nd.h}px`;
    el.innerHTML = `<div class="node-accent-line" style="background:${ac}"></div>
      <div class="node-body"><div class="content node-content shared-heading-text">${renderTextHTML(nd.text)}</div></div>`;
    return el;
  }
  if (isTextNote(t)) {
    const { w, h } = viewerDepthDefaultSize(nd);
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    const label = esc(nd.customTitle || 'Note');
    el.innerHTML = `<div class="node-accent-line" style="background:${ac}"></div>
      <div class="node-header"><span class="node-type-label">${label}</span></div>
      <div class="node-body"><div class="content node-content">${renderTextHTML(nd.text)}</div></div>`;
    return el;
  }
  if (t === 'bullet') {
    const { w, h } = viewerDepthDefaultSize(nd);
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    const items = (nd.items || [])
      .map((it) => {
        const text = typeof it === 'string' ? it : (it.text || '');
        const done = typeof it === 'object' && it.done ? ' class="is-done"' : '';
        return `<li${done}>${renderTextHTML(text)}</li>`;
      })
      .join('');
    el.innerHTML = `<div class="node-accent-line" style="background:${ac}"></div>
      <div class="node-header"><span class="node-type-label">List</span></div>
      <div class="node-body"><ul class="node-content" style="margin:0;padding-left:18px">${items || '<li class="viewer-inspect-muted">Empty</li>'}</ul></div>`;
    return el;
  }
  if (t === 'progress') {
    const { w, h } = viewerDepthDefaultSize(nd);
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    const val = Math.round(Math.min(100, Math.max(0, Number(nd.value) || 0)));
    let stepsHtml = '';
    if (Array.isArray(nd.steps) && nd.steps.length) {
      stepsHtml =
        '<ul style="margin:8px 0 0;padding-left:18px;font-size:12px">' +
        nd.steps
          .map((s, i) => {
            const lab = esc(String(s.label || `Step ${i + 1}`));
            const done = s.done ? ' style="text-decoration:line-through;opacity:0.65"' : '';
            return `<li${done}>${lab}</li>`;
          })
          .join('') +
        '</ul>';
    }
    el.innerHTML = `<div class="node-accent-line" style="background:${ac}"></div>
      <div class="node-header"><span class="node-type-label">Progress</span></div>
      <div class="node-body"><div class="content"><strong>${val}%</strong>${stepsHtml}</div></div>`;
    return el;
  }
  if (t === 'embed') {
    const { w, h } = viewerDepthDefaultSize(nd);
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    const u = String(nd.url || '').trim();
    const safe = esc(u);
    const body = u
      ? `<a class="node-embed-link" href="${safe}" target="_blank" rel="noopener noreferrer">${safe}</a>`
      : '<span class="viewer-inspect-muted">No URL</span>';
    el.innerHTML = `<div class="node-accent-line" style="background:${ac}"></div>
      <div class="node-header"><span class="node-type-label">Embed</span></div>
      <div class="node-body"><div class="content">${body}</div></div>`;
    return el;
  }
  if (t === 'file') {
    const { w, h } = viewerDepthDefaultSize(nd);
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    const name = esc(nd.name || 'File');
    const ext = esc(nd.ext || '');
    const extBit = ext ? ` <span class="viewer-inspect-muted">.${ext}</span>` : '';
    const note =
      nd.fileKind === 'image'
        ? '<p class="viewer-inspect-muted" style="margin:8px 0 0;font-size:11px">Image preview is not included in the shared view.</p>'
        : '';
    el.innerHTML = `<div class="node-accent-line" style="background:${ac}"></div>
      <div class="node-header"><span class="node-type-label">File</span></div>
      <div class="node-body"><div class="content">${name}${extBit}${note}</div></div>`;
    return el;
  }
  el.style.width = `${nd.w || 200}px`;
  el.style.height = `${nd.h || 80}px`;
  el.innerHTML = `<div class="node-accent-line" style="background:${ac}"></div>
    <div class="node-body"><div class="content node-content">${renderTextHTML(String(nd.type))}</div></div>`;
  return el;
}

function computeViewerDepthLayout(nodes) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  nodes.forEach((nd) => {
    const { w, h } = viewerDepthDefaultSize(nd);
    const x = nd.x || 0;
    const y = nd.y || 0;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  });
  const pad = 100;
  const offX = pad - minX;
  const offY = pad - minY;
  const bw = Math.max(960, maxX - minX + 2 * pad);
  const bh = Math.max(640, maxY - minY + 2 * pad);
  return { offX, offY, bw, bh };
}

function openViewerCardDepth(item) {
  closeViewerCardInspect();
  const root = document.getElementById('viewer-card-depth');
  const titleEl = document.getElementById('viewer-card-depth-title');
  const world = document.getElementById('viewer-card-depth-world');
  const viewport = document.getElementById('viewer-card-depth-viewport');
  if (!root || !titleEl || !world || !viewport) return;
  const snap = item.snapshot || {};
  titleEl.textContent = snap.name || 'Card';
  world.innerHTML = '';

  const rawNodes = Array.isArray(snap.nodes) ? snap.nodes : [];
  if (!rawNodes.length) {
    world.style.width = '100%';
    world.style.minHeight = '420px';
    world.innerHTML = `<div class="viewer-card-depth-empty">
      <h3>No saved canvas for this card</h3>
      <p>The owner can open this presentation in BEV, open each card once, and use <strong>Share</strong> again so published snapshots include all notes and links.</p>
      <p>You can still read the summary on the presentation slide.</p>
    </div>`;
    root.classList.add('is-open');
    root.setAttribute('aria-hidden', 'false');
    return;
  }

  const lay = computeViewerDepthLayout(rawNodes);
  const shifted = rawNodes.map((nd) => ({
    ...nd,
    x: (nd.x || 0) + lay.offX,
    y: (nd.y || 0) + lay.offY,
  }));

  world.style.width = `${lay.bw}px`;
  world.style.height = `${lay.bh}px`;
  world.style.minWidth = '';
  world.style.minHeight = '';

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.id = 'viewer-card-depth-connections-svg';
  svg.setAttribute('width', String(lay.bw));
  svg.setAttribute('height', String(lay.bh));
  world.appendChild(svg);
  renderViewerDepthConnections(svg, shifted, snap.connections || []);

  const accent = snap.color || '#888';
  shifted.forEach((nd) => {
    world.appendChild(renderViewerDepthNode(nd, accent));
  });

  root.classList.add('is-open');
  root.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => {
    viewport.scrollLeft = Math.max(
      0,
      (lay.bw - viewport.clientWidth) / 2,
    );
    viewport.scrollTop = Math.max(
      0,
      (lay.bh - viewport.clientHeight) / 2,
    );
  });
}

function closeViewerCardDepth() {
  const root = document.getElementById('viewer-card-depth');
  if (!root) return;
  root.classList.remove('is-open');
  root.setAttribute('aria-hidden', 'true');
  const world = document.getElementById('viewer-card-depth-world');
  if (world) world.innerHTML = '';
}

function initViewerCardDepth() {
  const backdrop = document.getElementById('viewer-card-depth-backdrop');
  const closeBtn = document.getElementById('viewer-card-depth-close');
  if (backdrop && !backdrop.dataset.bound) {
    backdrop.dataset.bound = '1';
    backdrop.addEventListener('click', closeViewerCardDepth);
  }
  if (closeBtn && !closeBtn.dataset.bound) {
    closeBtn.dataset.bound = '1';
    closeBtn.addEventListener('click', closeViewerCardDepth);
  }
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

initViewerCardInspect();
initViewerCardDepth();

window.BEVViewer = {
  start: startViewer,
  buildShareUrl,
  copyToClipboard,
  getShareToken,
  getBaseAppUrl,
};
