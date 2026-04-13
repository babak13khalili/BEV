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
let _viewerNav = null;
let _viewerDepthNav = null;
let __bevViewerGlobalPointer = false;
let __bevViewerDepthGlobalPointer = false;
/** Match in-app presentation: Space toggles pan tool; left-drag pans while active (plus middle mouse). */
let _viewerDeckPanTool = false;
let _viewerDepthPanTool = false;

function viewerSpatialScaleRange() {
  const B = typeof BEVCore !== 'undefined' ? BEVCore : null;
  return B?.DEFAULT_SPATIAL_SCALE_RANGE || { min: 0.05, max: 5 };
}

/** Same breakpoint as BEVCore.isMobileViewport (820px); safe if bev-core.js is missing. */
function viewerIsMobileViewport() {
  const B = typeof BEVCore !== 'undefined' ? BEVCore : null;
  if (B && typeof B.isMobileViewport === 'function') return B.isMobileViewport();
  return typeof window.innerWidth === 'number' && window.innerWidth <= 820;
}

function viewerIsTypingTarget(el) {
  if (!el || !el.tagName) return false;
  const t = el.tagName;
  if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') return true;
  if (el.isContentEditable) return true;
  return !!(el.closest && el.closest('input, textarea, select, [contenteditable="true"]'));
}

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

async function hydrateViewerSnapshotImages(data) {
  if (!_fbDb || !data || !Array.isArray(data.items)) return data;
  const ownerId = String(data.ownerId || '').trim();
  if (!ownerId) return data;
  const requests = [];
  (data.items || []).forEach((item) => {
    const projectId = String(item?.projectId || '').trim();
    const nodes = item?.snapshot?.nodes;
    if (!projectId || !Array.isArray(nodes)) return;
    nodes.forEach((node) => {
      const isImageNode =
        node &&
        (node.fileKind === 'image' || node.type === 'image') &&
        !String(node.src || '').trim();
      if (!isImageNode) return;
      const nodeId = String(node.id || '').trim();
      if (!nodeId) return;
      const assetId = String(node.assetId || `${projectId}__${nodeId}`).trim();
      if (!assetId) return;
      requests.push(
        _fbDb
          .collection('users')
          .doc(ownerId)
          .collection('image_assets')
          .doc(assetId)
          .get()
          .then((snap) => {
            const src = snap.exists ? String((snap.data() || {}).src || '') : '';
            if (src) {
              node.type = 'file';
              node.fileKind = 'image';
              node.src = src;
            }
          })
          .catch(() => {}),
      );
    });
  });
  if (!requests.length) return data;
  await Promise.all(requests);
  return data;
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
  if (t === 'text') return 'note';
  if (t === 'image') return 'file';
  return t;
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
    const extBit = ext ? ` <span class="viewer-inspect-muted">.${ext}</span>` : '';
    const src = String(node.src || '').trim();
    if (isImg && src) {
      const srcEsc = esc(src);
      return `<section class="viewer-inspect-block viewer-inspect-block-image"><div class="viewer-inspect-kind">Image</div><div class="img-wrap"><img src="${srcEsc}" alt="" draggable="false"></div><div class="viewer-inspect-text">${name}${extBit}</div></section>`;
    }
    const extra = isImg
      ? '<p class="viewer-inspect-muted">No image data in this published snapshot. The owner can re-share from BEV after saving.</p>'
      : '';
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
  if (item.id != null) el.dataset.viewerDeckId = String(item.id);
  el.style.cssText = `
    left: ${item.x || 0}px;
    top:  ${item.y || 0}px;
    --card-accent: ${esc(snap.color || '#fff')};
    width: ${Math.max(snap.w || 280, 280)}px;
    cursor: default;
  `;
  el.title =
    'Open card: click → or double-click the slide (same as the presentation editor).';

  const date = snap.created
    ? new Date(snap.created).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';

  el.innerHTML = `
    <div class="card-meta"><span class="card-date">${esc(date)}</span></div>
    <div class="card-title">${esc(snap.name || 'Untitled')}</div>
    ${snap.desc ? `<div class="card-desc">${esc(snap.desc)}</div>` : ''}
    <div class="card-bottom">
      <div class="card-bottom-meta">
        <div class="card-status" data-status="${statusSlug(snap.status)}">
          ${esc(snap.status || 'In Progress')}
        </div>
        <div class="card-stats">
          <div class="card-stat"><span>${snap.nodeCount ?? 0}</span> nodes</div>
          <div class="card-stat"><span>${snap.connectionCount ?? 0}</span> links</div>
        </div>
      </div>
      <button class="card-open" type="button" aria-label="Open card">→</button>
    </div>`;

  el.querySelector('.card-open')?.addEventListener('click', (e) => {
    e.stopPropagation();
    openViewerCardDepth(item);
  });
  el.addEventListener('dblclick', (e) => {
    if (e.target.closest('.card-status') || e.target.closest('.card-open')) return;
    openViewerCardDepth(item);
  });
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

function viewerClientToWorld(clientX, clientY) {
  if (!_viewerNav) return { x: 0, y: 0 };
  const canvas = document.getElementById('viewer-canvas');
  if (!canvas) return { x: 0, y: 0 };
  const r = canvas.getBoundingClientRect();
  const o = _viewerNav.getOffset();
  const sc = _viewerNav.getScale() || 1;
  return {
    x: (clientX - r.left - o.x) / sc,
    y: (clientY - r.top - o.y) / sc,
  };
}

function viewerDeckEdgeWorldPoint(el, pos) {
  if (!el) return null;
  const box = el.getBoundingClientRect();
  let cx;
  let cy;
  if (!pos) {
    cx = box.left + box.width / 2;
    cy = box.top + box.height / 2;
  } else if (pos === 'top') {
    cx = box.left + box.width / 2;
    cy = box.top;
  } else if (pos === 'bottom') {
    cx = box.left + box.width / 2;
    cy = box.bottom;
  } else if (pos === 'left') {
    cx = box.left;
    cy = box.top + box.height / 2;
  } else {
    cx = box.right;
    cy = box.top + box.height / 2;
  }
  return viewerClientToWorld(cx, cy);
}

function fillViewerDeckConnectionsSvg(svg, data) {
  if (!svg || !data) return;
  svg.innerHTML = '';
  const world = document.getElementById('viewer-world');
  if (!world) return;
  const conns = data.spatialConnections || [];
  if (!conns.length) return;
  conns.forEach((c) => {
    if (!c?.fromId || !c?.toId || c.fromId === c.toId) return;
    const fid = String(c.fromId);
    const tid = String(c.toId);
    const fromEl = world.querySelector(`[data-viewer-deck-id="${fid}"]`);
    const toEl = world.querySelector(`[data-viewer-deck-id="${tid}"]`);
    const f = fromEl
      ? viewerDeckEdgeWorldPoint(fromEl, c.fromPos || null)
      : null;
    const t = toEl
      ? viewerDeckEdgeWorldPoint(toEl, c.toPos || null)
      : null;
    if (!f || !t) return;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', depthCurve(f, t));
    path.setAttribute('class', 'conn-line presentation-conn-line');
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
  const B = typeof BEVCore !== 'undefined' ? BEVCore : null;
  const shell = B?.buildReadonlyNodeShell
    ? B.buildReadonlyNodeShell(nd, { accent: accent || '#888' })
    : null;
  const t = shell?.type || canonicalType(nd.type);
  const el = document.createElement('div');
  el.className = `viewer-depth-node-el node node-${t}`;
  el.style.left = `${nd.x || 0}px`;
  el.style.top = `${nd.y || 0}px`;

  if (t === 'line') {
    el.style.width = `${nd.w || 220}px`;
    el.innerHTML = shell?.html || '<div class="content overview-item-line"></div>';
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
  if (t === 'heading' || isTextNote(t) || t === 'bullet' || t === 'progress' || t === 'embed' || t === 'file') {
    const { w, h } = viewerDepthDefaultSize(nd);
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    if (shell?.isImageFile) {
      el.classList.add('is-image-file');
    }
    el.innerHTML = shell?.html || "";
    return el;
  }
  el.style.width = `${nd.w || 200}px`;
  el.style.height = `${nd.h || 80}px`;
  const ac = esc(accent || '#888');
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
  _viewerDeckPanTool = false;
  document.getElementById('viewer-canvas')?.classList.remove('viewer-pan-tool');
  destroyViewerDepthSpatialNav();
  const root = document.getElementById('viewer-card-depth');
  const titleEl = document.getElementById('viewer-card-depth-title');
  const world = document.getElementById('viewer-card-depth-world');
  const viewport = document.getElementById('viewer-card-depth-viewport');
  if (!root || !titleEl || !world || !viewport) return;
  const snap = item.snapshot || {};
  const cardTitle = snap.name || 'Card';
  titleEl.textContent = cardTitle;
  const pathCur = document.getElementById('viewer-card-depth-path-current');
  if (pathCur) pathCur.textContent = cardTitle;
  const pathRoot = document.getElementById('viewer-card-depth-path-root');
  if (pathRoot) {
    pathRoot.textContent =
      (_data && _data.name && String(_data.name).trim()) || 'Presentation';
  }
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
    requestAnimationFrame(() => {
      ensureViewerDepthSpatialNav();
      fitViewerDepthViewport();
      wireViewerDepthSpatialNavigation();
    });
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
    ensureViewerDepthSpatialNav();
    fitViewerDepthViewport();
    wireViewerDepthSpatialNavigation();
  });
}

function closeViewerCardDepth() {
  const root = document.getElementById('viewer-card-depth');
  if (!root) return;
  root.classList.remove('is-open');
  root.setAttribute('aria-hidden', 'true');
  _viewerDepthPanTool = false;
  document
    .getElementById('viewer-card-depth-viewport')
    ?.classList.remove('viewer-depth-pan-tool', 'panning');
  destroyViewerDepthSpatialNav();
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
  if (obj.id != null) el.dataset.viewerDeckId = String(obj.id);
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

/* ── Viewport (same transform + wheel + grid as BEV canvas / presentation) ─ */

function destroyViewerSpatialNav() {
  if (_viewerNav) {
    _viewerNav.destroy();
    _viewerNav = null;
  }
}

function destroyViewerDepthSpatialNav() {
  if (_viewerDepthNav) {
    _viewerDepthNav.destroy();
    _viewerDepthNav = null;
  }
}

function ensureViewerSpatialNav() {
  if (_viewerNav) return _viewerNav;
  const B = typeof BEVCore !== 'undefined' ? BEVCore : null;
  if (!B || !B.createSpatialViewport) return null;
  const sc = viewerSpatialScaleRange();
  _viewerNav = B.createSpatialViewport({
    getContainer: () => document.getElementById('viewer-canvas'),
    getWorld: () => document.getElementById('viewer-world'),
    cssVarPrefix: 'viewer',
    scaleMin: sc.min,
    scaleMax: sc.max,
  });
  return _viewerNav;
}

function ensureViewerDepthSpatialNav() {
  if (_viewerDepthNav) return _viewerDepthNav;
  const B = typeof BEVCore !== 'undefined' ? BEVCore : null;
  if (!B || !B.createSpatialViewport) return null;
  const sc = viewerSpatialScaleRange();
  _viewerDepthNav = B.createSpatialViewport({
    getContainer: () => document.getElementById('viewer-card-depth-viewport'),
    getWorld: () => document.getElementById('viewer-card-depth-world'),
    cssVarPrefix: 'viewer-depth',
    scaleMin: sc.min,
    scaleMax: sc.max,
  });
  return _viewerDepthNav;
}

function fitViewerDepthViewport() {
  const nav = ensureViewerDepthSpatialNav();
  const canvas = document.getElementById('viewer-card-depth-viewport');
  const world = document.getElementById('viewer-card-depth-world');
  if (!nav || !canvas || !world) return;
  const { min: smin, max: smax } = viewerSpatialScaleRange();
  const isMobile = viewerIsMobileViewport();
  const bounds = [...world.querySelectorAll('.viewer-depth-node-el, .overview-item-frame')].map((el) => ({
    x: parseFloat(el.style.left) || 0,
    y: parseFloat(el.style.top) || 0,
    w: el.offsetWidth || 220,
    h: el.offsetHeight || 100,
  }));
  if (!bounds.length) {
    const g = isMobile ? 40 : 56;
    const sc = Math.max(smin, Math.min(smax, isMobile ? 0.28 : 0.48));
    nav.setState(g, g, sc, sc);
    nav.apply();
    return;
  }
  const rect = canvas.getBoundingClientRect();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  bounds.forEach((b) => {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  });
  /* Same padding / scale caps as presentationResetView() in bev-app.js */
  const pad = isMobile ? 340 : 220;
  const cw = maxX - minX + pad * 2;
  const ch = maxY - minY + pad * 2;
  const sc = Math.max(
    smin,
    Math.min(
      smax,
      Math.min(
        isMobile ? 0.3 : 0.5,
        Math.min(rect.width / cw, rect.height / ch),
      ),
    ),
  );
  const ox = (rect.width - cw * sc) / 2 - (minX - pad) * sc;
  const oy = (rect.height - ch * sc) / 2 - (minY - pad) * sc;
  nav.setState(ox, oy, sc, sc);
  nav.apply();
}

function wireViewerDepthSpatialNavigation() {
  const viewport = document.getElementById('viewer-card-depth-viewport');
  if (!viewport) return;
  if (!viewport.dataset.bevViewerDepthWheel) {
    viewport.dataset.bevViewerDepthWheel = '1';
    viewport.addEventListener(
      'wheel',
      (e) => {
        if (!_viewerDepthNav) return;
        _viewerDepthNav.wheel(e);
      },
      { passive: false },
    );
  }
  if (!viewport.dataset.bevViewerDepthPan) {
    viewport.dataset.bevViewerDepthPan = '1';
    viewport.addEventListener('mousedown', (e) => {
      if (!_viewerDepthNav) return;
      const root = document.getElementById('viewer-card-depth');
      if (!root || !root.classList.contains('is-open')) return;
      const panMiddle = e.button === 1;
      const panLeftTool = e.button === 0 && _viewerDepthPanTool;
      if (!panMiddle && !panLeftTool) return;
      _viewerDepthNav.beginPan(e.clientX, e.clientY);
      viewport.classList.add('panning');
      e.preventDefault();
    });
  }
  if (!__bevViewerDepthGlobalPointer) {
    __bevViewerDepthGlobalPointer = true;
    window.addEventListener('mousemove', (e) => {
      if (!_viewerDepthNav || !_viewerDepthNav.isPanningActive()) return;
      _viewerDepthNav.movePan(e.clientX, e.clientY);
    });
    window.addEventListener('mouseup', () => {
      if (_viewerDepthNav && _viewerDepthNav.isPanningActive()) {
        _viewerDepthNav.endPan();
        document.getElementById('viewer-card-depth-viewport')?.classList.remove('panning');
      }
    });
  }
}

function fitViewerViewportToData(data) {
  const nav = ensureViewerSpatialNav();
  const canvas = document.getElementById('viewer-canvas');
  const world = document.getElementById('viewer-world');
  if (!nav || !canvas || !world) return;
  const { min: smin, max: smax } = viewerSpatialScaleRange();
  const rect = canvas.getBoundingClientRect();
  const isMobile = viewerIsMobileViewport();
  const els = [...world.querySelectorAll('.project-card, .presentation-object')];
  const all = els.map((el) => ({
    x: parseFloat(el.style.left) || 0,
    y: parseFloat(el.style.top) || 0,
    w: el.offsetWidth || 280,
    h: el.offsetHeight || 200,
  }));
  if (!all.length) {
    const g = isMobile ? 40 : 56;
    const sc = Math.max(smin, Math.min(smax, isMobile ? 0.28 : 0.48));
    nav.setState(g, g, sc, sc);
    nav.apply();
    return;
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  all.forEach((b) => {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  });
  const pad = isMobile ? 340 : 220;
  const cw = maxX - minX + pad * 2;
  const ch = maxY - minY + pad * 2;
  const sc = Math.max(
    smin,
    Math.min(
      smax,
      Math.min(
        isMobile ? 0.3 : 0.5,
        Math.min(rect.width / cw, rect.height / ch),
      ),
    ),
  );
  const ox = (rect.width - cw * sc) / 2 - (minX - pad) * sc;
  const oy = (rect.height - ch * sc) / 2 - (minY - pad) * sc;
  nav.setState(ox, oy, sc, sc);
  nav.apply();
}

function wireViewerSpatialNavigation() {
  const canvas = document.getElementById('viewer-canvas');
  if (!canvas) return;
  if (!canvas.dataset.bevViewerWheel) {
    canvas.dataset.bevViewerWheel = '1';
    canvas.addEventListener(
      'wheel',
      (e) => {
        if (!getShareToken() || !_viewerNav) return;
        const depth = document.getElementById('viewer-card-depth');
        if (depth && depth.classList.contains('is-open')) return;
        _viewerNav.wheel(e);
      },
      { passive: false },
    );
  }
  if (!canvas.dataset.bevViewerPan) {
    canvas.dataset.bevViewerPan = '1';
    canvas.addEventListener('mousedown', (e) => {
      if (!_viewerNav) return;
      const depth = document.getElementById('viewer-card-depth');
      if (depth && depth.classList.contains('is-open')) return;
      const panMiddle = e.button === 1;
      const panLeftTool = e.button === 0 && _viewerDeckPanTool;
      if (!panMiddle && !panLeftTool) return;
      const world = document.getElementById('viewer-world');
      const onDeck =
        e.target === canvas ||
        e.target === world ||
        (world && world.contains(e.target));
      if (!onDeck) return;
      _viewerNav.beginPan(e.clientX, e.clientY);
      canvas.classList.add('panning');
      e.preventDefault();
    });
  }
  if (!window.__bevViewerPanToolKeys) {
    window.__bevViewerPanToolKeys = true;
    window.addEventListener(
      'keydown',
      (e) => {
        if (e.code !== 'Space' || e.repeat) return;
        if (!getShareToken()) return;
        const screen = document.getElementById('screen-shared-presentation');
        if (!screen || screen.style.display === 'none') return;
        if (viewerIsTypingTarget(e.target)) return;
        const inspect = document.getElementById('viewer-card-inspect');
        if (inspect && inspect.classList.contains('visible')) return;
        const depth = document.getElementById('viewer-card-depth');
        const depthOpen = depth && depth.classList.contains('is-open');
        if (depthOpen) {
          _viewerDepthPanTool = !_viewerDepthPanTool;
          document
            .getElementById('viewer-card-depth-viewport')
            ?.classList.toggle('viewer-depth-pan-tool', _viewerDepthPanTool);
        } else {
          _viewerDeckPanTool = !_viewerDeckPanTool;
          document
            .getElementById('viewer-canvas')
            ?.classList.toggle('viewer-pan-tool', _viewerDeckPanTool);
        }
        e.preventDefault();
      },
      true,
    );
    window.addEventListener('blur', () => {
      _viewerDeckPanTool = false;
      _viewerDepthPanTool = false;
      document.getElementById('viewer-canvas')?.classList.remove('viewer-pan-tool');
      document
        .getElementById('viewer-card-depth-viewport')
        ?.classList.remove('viewer-depth-pan-tool');
    });
  }
  if (!__bevViewerGlobalPointer) {
    __bevViewerGlobalPointer = true;
    window.addEventListener('mousemove', (e) => {
      if (_viewerNav && _viewerNav.isPanningActive()) {
        _viewerNav.movePan(e.clientX, e.clientY);
      }
    });
    window.addEventListener('mouseup', () => {
      if (_viewerNav && _viewerNav.isPanningActive()) {
        _viewerNav.endPan();
        document.getElementById('viewer-canvas')?.classList.remove('panning');
      }
    });
  }
}

/* ── Main render ─────────────────────────────────────────── */

function renderViewer(data) {
  const world = document.getElementById('viewer-world');
  if (!world) return;
  world.innerHTML = '';

  const deckSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  deckSvg.id = 'viewer-deck-connections-svg';
  deckSvg.setAttribute('width', '4200');
  deckSvg.setAttribute('height', '3000');
  deckSvg.style.cssText =
    'position:absolute;left:0;top:0;overflow:visible;pointer-events:none;z-index:0';
  world.appendChild(deckSvg);

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

  const statusEl = document.getElementById('viewer-path-status');
  if (statusEl) {
    const n = (data.name && String(data.name).trim()) || '';
    statusEl.textContent = n || 'Shared presentation';
  }

  ensureViewerSpatialNav();
  fitViewerViewportToData(data);
  wireViewerSpatialNavigation();
  requestAnimationFrame(() => {
    const svg = document.getElementById('viewer-deck-connections-svg');
    fillViewerDeckConnectionsSvg(svg, data);
  });
}

/* ── Idle-bar logic ──────────────────────────────────────── */

function resetIdleTimer() {
  const chrome = document.getElementById('viewer-top-chrome');
  if (!chrome) return;
  chrome.classList.remove('idle');
  if (_idleTimer) {
    clearTimeout(_idleTimer);
    _idleTimer = null;
  }
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
  document.querySelectorAll('.viewer-unavailable-cta').forEach(el => {
    if (el.tagName === 'A') el.href = baseUrl;
    else el.addEventListener('click', () => { window.location.href = baseUrl; });
  });

  const homeBtn = document.getElementById('viewer-home-btn');
  if (homeBtn && !homeBtn.dataset.bevViewerHomeBound) {
    homeBtn.dataset.bevViewerHomeBound = '1';
    homeBtn.addEventListener('click', () => {
      window.location.href = baseUrl;
    });
  }

  // Firebase
  if (!initFirebase()) {
    showLoading(false);
    showUnavailable(true);
    return true;
  }

  try {
    _data = await fetchPresentation(token);
    if (_data) {
      await hydrateViewerSnapshotImages(_data);
    }
  } catch {
    _data = null;
  }

  showLoading(false);

  if (!_data) {
    destroyViewerSpatialNav();
    showUnavailable(true);
    return true;
  }

  destroyViewerSpatialNav();
  // Render
  renderViewer(_data);

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

/* ── Exports ─────────────────────────────────────────────── */

initViewerCardInspect();
initViewerCardDepth();

window.BEVViewer = {
  start: startViewer,
  /** Used by bev-app read-only presentation cards (same drill-in as anonymous viewer). */
  openCardDepth: openViewerCardDepth,
  buildShareUrl,
  copyToClipboard,
  getShareToken,
  getBaseAppUrl,
};
