// ===================== SHARED CORE (js/bev-core.js) =====================
const BEVCore = typeof window !== "undefined" ? window.BEVCore : null;
if (!BEVCore) {
  throw new Error("BEV: load js/bev-core.js before js/bev-app.js");
}
const {
  SURFACES,
  normalizeOverviewItemDataList,
  presentationObjectsFromRaw,
  isSharedTextObjectType,
  isUnifiedTextNoteType,
  usesUnifiedNoteObjectBehavior,
  canonicalObjectType,
  createSharedTextObjectState,
  createSimpleLineItem,
  createQuickNoteFallbackItem,
  isMobileViewport: bevIsMobileViewport,
  createSpatialViewport,
  installTouchSpatialSurface,
  DEFAULT_SPATIAL_SCALE_RANGE,
  renderNodeContentHTML,
  buildNodeShell,
} = BEVCore;
const isMobileViewport = bevIsMobileViewport;

// ===================== FIREBASE STATE =====================
let fbApp = null,
  fbAuth = null,
  fbDb = null,
  currentUser = null;
// ===================== APP STATE =====================
let projects = [],
  currentProject = null,
  nodes = [],
  connections = [];
let presentations = [],
  currentPresentation = null,
  sharedPresentation = null;
let selectedNode = null,
  selectedConn = null,
  currentTool = "select";
let isDragging = false,
  dragOffset = { x: 0, y: 0 };
let isPanning = false;
let viewOffset = { x: 0, y: 0 },
  viewScale = 1,
  targetScale = 1;
let isZooming = false;
let pendingConn = null,
  pendingConnCursor = null,
  pendingConnTarget = null,
  pendingConnRenderRAF = null,
  ctxMenuNodeId = null,
  ctxMenuPos = { x: 0, y: 0 };
let editingProjectId = null,
  imageNodeTarget = null;
let nodeIdCounter = 1,
  connIdCounter = 1;
let minimapRAF = null,
  saveTimer = null;
let dashboardReady = false,
  dashboardViewOffset = { x: 220, y: 140 },
  dashboardPanActive = false,
  dashboardScale = 1,
  dashboardTargetScale = 1;
let dashboardDragProjectId = null,
  dashboardDragMoved = false;
let dashboardIsZooming = false;
let dashboardDragOffset = { x: 0, y: 0 },
  newProjectPosition = null,
  projectSaveTimer = null;
let dashboardResizeProjectId = null,
  dashboardResizeStart = null;
let presentationSaveTimer = null,
  presentationDragItemId = null,
  presentationDragOffset = { x: 0, y: 0 },
  presentationDragObjectId = null,
  presentationObjectDragOffset = { x: 0, y: 0 },
  presentationResizeObjectId = null,
  presentationResizeStart = null;
let presentationSelectionRect = null,
  presentationSelectionStart = null,
  presentationSelectionMode = null;
let selectedPresentationItemIds = new Set(),
  selectedPresentationObjectIds = new Set();
let presentationGroupDragEntries = null,
  presentationGroupDragStart = null;
let presentationResizeItemId = null,
  presentationItemResizeStart = null;
let presentationViewOffset = { x: 180, y: 110 },
  presentationScale = 0.55,
  presentationTargetScale = 0.55;
/** Shared spatial defaults (single source in BEVCore). */
const CANVAS_SCALE_MIN = DEFAULT_SPATIAL_SCALE_RANGE.min;
const CANVAS_SCALE_MAX = DEFAULT_SPATIAL_SCALE_RANGE.max;
const DASHBOARD_SCALE_MIN = 0.12;
const DASHBOARD_SCALE_MAX = 2.5;
const PRESENTATION_SCALE_MIN = DEFAULT_SPATIAL_SCALE_RANGE.min;
const PRESENTATION_SCALE_MAX = DEFAULT_SPATIAL_SCALE_RANGE.max;
let canvasSpatialNav = null;
let dashboardSpatialNav = null;
let presentationSpatialNav = null;
let sharedPresentationSpatialNav = null;
function syncCanvasGlobalsFromNav() {
  const nav = canvasSpatialNav;
  if (!nav) return;
  const o = nav.getOffset();
  viewOffset.x = o.x;
  viewOffset.y = o.y;
  viewScale = nav.getScale();
  targetScale = nav.getTargetScale();
  isZooming = nav.getIsZooming();
}
function getCanvasSpatialNav() {
  if (!canvasSpatialNav) {
    canvasSpatialNav = createSpatialViewport({
      getContainer: () => document.getElementById("canvas-container"),
      getWorld: () => document.getElementById("canvas-world"),
      cssVarPrefix: "canvas",
      scaleMin: CANVAS_SCALE_MIN,
      scaleMax: CANVAS_SCALE_MAX,
      getZoomLevelEl: () => document.getElementById("zoom-level"),
      onApply() {
        syncCanvasGlobalsFromNav();
      },
    });
    canvasSpatialNav.setState(
      viewOffset.x,
      viewOffset.y,
      viewScale,
      targetScale,
    );
    canvasSpatialNav.apply();
  }
  return canvasSpatialNav;
}
function syncDashboardGlobalsFromNav() {
  const nav = dashboardSpatialNav;
  if (!nav) return;
  const o = nav.getOffset();
  dashboardViewOffset.x = o.x;
  dashboardViewOffset.y = o.y;
  dashboardScale = nav.getScale();
  dashboardTargetScale = nav.getTargetScale();
  dashboardIsZooming = nav.getIsZooming();
}
function getDashboardSpatialNav() {
  if (!dashboardSpatialNav) {
    dashboardSpatialNav = createSpatialViewport({
      getContainer: () => document.getElementById("dashboard-canvas"),
      getWorld: () => document.getElementById("projects-world"),
      cssVarPrefix: "dashboard",
      scaleMin: DASHBOARD_SCALE_MIN,
      scaleMax: DASHBOARD_SCALE_MAX,
      getZoomLevelEl: () => document.getElementById("dashboard-zoom-level"),
      onApply() {
        syncDashboardGlobalsFromNav();
        drawDashboardMinimap();
      },
    });
    dashboardSpatialNav.setState(
      dashboardViewOffset.x,
      dashboardViewOffset.y,
      dashboardScale,
      dashboardTargetScale,
    );
    dashboardSpatialNav.apply();
  }
  return dashboardSpatialNav;
}
function syncPresentationGlobalsFromNav() {
  const nav = presentationSpatialNav;
  if (!nav) return;
  const o = nav.getOffset();
  presentationViewOffset.x = o.x;
  presentationViewOffset.y = o.y;
  presentationScale = nav.getScale();
  presentationTargetScale = nav.getTargetScale();
}
function getPresentationSpatialNav() {
  if (!presentationSpatialNav) {
    presentationSpatialNav = createSpatialViewport({
      getContainer: () => document.getElementById("presentation-canvas"),
      getWorld: () => document.getElementById("presentation-world"),
      cssVarPrefix: "presentation",
      scaleMin: PRESENTATION_SCALE_MIN,
      scaleMax: PRESENTATION_SCALE_MAX,
      getZoomLevelEl: () => document.getElementById("presentation-zoom-level"),
      onApply() {
        syncPresentationGlobalsFromNav();
      },
    });
    presentationSpatialNav.setState(
      presentationViewOffset.x,
      presentationViewOffset.y,
      presentationScale,
      presentationTargetScale,
    );
    presentationSpatialNav.apply();
  }
  return presentationSpatialNav;
}
function getSharedPresentationSpatialNav() {
  if (!sharedPresentationSpatialNav) {
    sharedPresentationSpatialNav = createSpatialViewport({
      getContainer: () =>
        document.getElementById("shared-presentation-canvas"),
      getWorld: () => document.getElementById("shared-presentation-world"),
      cssVarPrefix: "shared-pres",
      scaleMin: PRESENTATION_SCALE_MIN,
      scaleMax: PRESENTATION_SCALE_MAX,
    });
  }
  return sharedPresentationSpatialNav;
}
let presentationTool = "select",
  presentationSelectedConnId = null,
  presentationCtxWorldPos = null,
  presentationCtxMenuObjectId = null,
  presentationCtxMenuItemId = null,
  presentationCtxMenuConnId = null;
let pendingPresConn = null,
  pendingPresConnCursor = null,
  pendingPresConnTarget = null;
let pendingPresConnRenderRAF = null;
let overviewItems = [],
  overviewDragItemId = null,
  overviewDragOffset = { x: 0, y: 0 },
  overviewSaveTimer = null;
let overviewResizeItemId = null,
  overviewResizeStart = null;
let dashboardTool = "select",
  overviewSelection = null;
let isResizingNode = false,
  resizingNodeId = null,
  nodeResizeStart = null;
let lineEndpointDrag = null;
let selectedProjectIds = new Set(),
  selectedOverviewItemIds = new Set(),
  selectedNodeIds = new Set();
let dashboardSelectionRect = null,
  dashboardSelectionStart = null,
  dashboardSelectionMode = null;
let dashboardGroupDragProjects = null,
  dashboardGroupDragItems = null,
  dashboardGroupDragStart = null;
let expandedProjectIds = new Set();
let workspaceMenuOpen = false;
let canvasSelectionRect = null,
  canvasSelectionStart = null,
  nodeGroupDragIds = null,
  nodeGroupDragStart = null;
const DEFAULT_PROJECT_CARD_WIDTH = 280;
const DEFAULT_PROJECT_CARD_HEIGHT = 220;
const LINE_NODE_HEIGHT = 18;
const LINE_MIN_LENGTH = 40;
const DEFAULT_WORKSPACE_CATEGORIES = [
  {
    id: "cat-general",
    color: "#ffffff",
    label: "General",
    enabled: true,
  },
  { id: "cat-urgent", color: "#ff4444", label: "Urgent", enabled: true },
  {
    id: "cat-planning",
    color: "#ff8844",
    label: "Planning",
    enabled: true,
  },
  { id: "cat-ideas", color: "#ffcc44", label: "Ideas", enabled: true },
  {
    id: "cat-projects",
    color: "#44ff88",
    label: "Projects",
    enabled: true,
  },
  {
    id: "cat-research",
    color: "#44ccff",
    label: "Research",
    enabled: true,
  },
  {
    id: "cat-resources",
    color: "#aa88ff",
    label: "Resources",
    enabled: true,
  },
  {
    id: "cat-personal",
    color: "#ff88cc",
    label: "Personal",
    enabled: true,
  },
];
let workspaceCategories = DEFAULT_WORKSPACE_CATEGORIES.map(
  (category) => ({
    ...category,
  }),
);
let workspaceSort = "created-desc";
let workspaceUIPrefs = {
  showZoomControls: true,
  showMinimap: true,
};
let activeCategoryColorEditorId = null,
  editingCategoryLabelId = null,
  activeCategoryPickerId = null,
  pendingConfirmAction = null;
let undoStack = [],
  redoStack = [],
  lastHistorySnapshot = "",
  isRestoringHistory = false;
let selectedCategoryId = null;
const PROJECT_STATUSES = [
  "In Progress",
  "On Going",
  "Done",
  "Cancelled",
  "Postponed",
  "On Hold",
];
let selectedColor = "#44ff88";
const DAILY_TODO_CLIPBOARD_MIME = "application/x-bev-daily-todos";
const GENERAL_TODO_CLIPBOARD_MIME = "application/x-bev-general-todos";
let dailyTodoState = {
    open: false,
    currentDate: "",
    entries: {},
  },
  dailyTodoInitialized = false,
  dailyTodoClockTimer = null,
  dailyTodoSelectedIds = new Set(),
  dailyTodoSelectionAnchorId = null;
let generalTodoState = {
    open: false,
    items: [],
    showDone: true,
  },
  generalTodoInitialized = false,
  generalTodoSelectedIds = new Set(),
  generalTodoSelectionAnchorId = null;
const LAST_VIEW_STORAGE_KEY = "bev_last_view";
let appClipboard = null;
let currentScreenName = "loading",
  canvasReturnScreen = "dashboard";
let presentationPickerSelection = new Set();
const PRESENTATION_PUBLIC_QUERY_KEY = "presentation";
const PRESENTATION_CARD_TAP_PX = 8;

// ===================== STARTUP =====================
function startup() {
  if (getSharedPresentationTokenFromUrl()) {
    const injectedConfig =
      window.BEV_FIREBASE_CONFIG || window.ATLAS_FIREBASE_CONFIG;
    if (injectedConfig && typeof injectedConfig === "object") {
      localStorage.setItem("bev_fb_config", JSON.stringify(injectedConfig));
      initFirebase(injectedConfig);
      return;
    }
  }
  const injectedConfig =
    window.BEV_FIREBASE_CONFIG || window.ATLAS_FIREBASE_CONFIG;
  if (injectedConfig && typeof injectedConfig === "object") {
    localStorage.setItem("bev_fb_config", JSON.stringify(injectedConfig));
    initFirebase(injectedConfig);
    return;
  }
  const saved =
    localStorage.getItem("bev_fb_config") ||
    localStorage.getItem("atlas_fb_config");
  if (saved) {
    try {
      initFirebase(JSON.parse(saved));
    } catch (e) {
      show("setup");
    }
  } else show("setup");
}

function show(name) {
  currentScreenName = name;
  [
    "loading",
    "setup",
    "auth",
    "dashboard",
    "presentation",
    "shared-presentation",
    "canvas",
  ].forEach((n) => {
    const el = document.getElementById("screen-" + n);
    if (el) el.style.display = "none";
  });
  const target = document.getElementById("screen-" + name);
  if (target)
    target.style.display =
      name === "dashboard" ||
      name === "canvas" ||
      name === "presentation" ||
      name === "shared-presentation"
        ? "block"
        : "flex";
  syncDailyTodoWidgetVisibility(name);
  syncGeneralTodoWidgetVisibility(name);
  const presCanvas = document.getElementById("presentation-canvas");
  if (presCanvas && name !== "presentation") {
    presCanvas.style.cursor = "";
  }
  if (name === "presentation") {
    queueMicrotask(() => setPresentationTool(presentationTool));
  }
  if (name !== "presentation" && presentationSpatialNav) {
    presentationSpatialNav.destroy();
    presentationSpatialNav = null;
  }
  if (name !== "canvas" && canvasSpatialNav) {
    canvasSpatialNav.destroy();
    canvasSpatialNav = null;
  }
  if (name !== "dashboard" && dashboardSpatialNav) {
    dashboardSpatialNav.destroy();
    dashboardSpatialNav = null;
  }
  if (name !== "shared-presentation" && sharedPresentationSpatialNav) {
    sharedPresentationSpatialNav.destroy();
    sharedPresentationSpatialNav = null;
  }
}

function saveLastView(screen, projectId = null, presentationId = null) {
  try {
    localStorage.setItem(
      LAST_VIEW_STORAGE_KEY,
      JSON.stringify({
        screen,
        projectId: projectId || null,
        presentationId: presentationId || null,
      }),
    );
  } catch {}
}

function loadLastView() {
  try {
    const raw = localStorage.getItem(LAST_VIEW_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

// ===================== FIREBASE INIT =====================
function connectFirebase() {
  const raw = document
    .getElementById("firebase-config-input")
    .value.trim();
  const err = document.getElementById("setup-error");
  err.textContent = "";
  let config;
  try {
    const j = raw
      .replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":')
      .replace(/'/g, '"');
    config = JSON.parse(j);
  } catch (e) {
    err.textContent =
      "Cannot parse config — paste the full { ... } block.";
    return;
  }
  const req = ["apiKey", "authDomain", "projectId"];
  for (const k of req)
    if (!config[k]) {
      err.textContent = "Missing: " + k;
      return;
    }
  localStorage.setItem("bev_fb_config", JSON.stringify(config));
  localStorage.removeItem("atlas_fb_config");
  initFirebase(config);
}

function initFirebase(config) {
  try {
    fbApp = firebase.apps.length
      ? firebase.apps[0]
      : firebase.initializeApp(config);
    fbAuth = firebase.auth();
    fbDb = firebase.firestore();
    const sharedToken = getSharedPresentationTokenFromUrl();
    if (sharedToken) {
      loadSharedPresentation(sharedToken);
      return;
    }
    fbAuth.onAuthStateChanged((user) => {
      if (user) {
        currentUser = user;
        onSignedIn();
      } else {
        currentUser = null;
        show("auth");
      }
    });
  } catch (e) {
    document.getElementById("setup-error").textContent =
      "Firebase error: " + e.message;
    show("setup");
  }
}

function resetSetup() {
  localStorage.removeItem("bev_fb_config");
  localStorage.removeItem("atlas_fb_config");
  show("setup");
}

// ===================== AUTH =====================
async function signInWithGoogle() {
  document.getElementById("auth-error").textContent = "";
  try {
    await fbAuth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
  } catch (e) {
    document.getElementById("auth-error").textContent = e.message;
  }
}

async function signOut() {
  await fbAuth.signOut();
  projects = [];
  presentations = [];
  currentProject = null;
  currentPresentation = null;
  saveLastView("dashboard");
  show("auth");
}

function onSignedIn() {
  const av = document.getElementById("user-avatar");
  document.getElementById("user-name").textContent =
    currentUser.displayName || currentUser.email || "";
  if (currentUser.photoURL)
    av.innerHTML = `<img src="${currentUser.photoURL}">`;
  else
    av.textContent = (currentUser.displayName ||
      currentUser.email ||
      "?")[0].toUpperCase();
  loadWorkspacePrefs();
  setupDailyTodoWidget();
  setupGeneralTodoWidget();
  initColorSwatches();
  setupCanvasEvents();
  setupDashboardEvents();
  setupPresentationEvents();
  loadProjects();
}

// ===================== FIRESTORE =====================
const pRef = () =>
  fbDb.collection("users").doc(currentUser.uid).collection("projects");
const presentationRef = () =>
  fbDb.collection("users").doc(currentUser.uid).collection("presentations");
const imageAssetRef = () =>
  fbDb.collection("users").doc(currentUser.uid).collection("image_assets");
const dashboardRef = () =>
  fbDb
    .collection("users")
    .doc(currentUser.uid)
    .collection("meta")
    .doc("dashboard");
const publicPresentationRef = (token = null) => {
  const coll = fbDb.collection("public_presentations");
  return token ? coll.doc(token) : coll;
};

function getSharedPresentationTokenFromUrl() {
  try {
    return (
      new URLSearchParams(window.location.search).get(
        PRESENTATION_PUBLIC_QUERY_KEY,
      ) || ""
    ).trim();
  } catch {
    return "";
  }
}

function getBaseAppUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete(PRESENTATION_PUBLIC_QUERY_KEY);
  url.hash = "";
  return url.toString();
}

function getSharedPresentationUrl(token) {
  const url = new URL(getBaseAppUrl());
  url.searchParams.set(PRESENTATION_PUBLIC_QUERY_KEY, token);
  return url.toString();
}

function promiseWithTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Clipboard API is blocked on non-HTTPS and some browsers; use fallbacks. */
async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* try fallbacks */
    }
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "0";
    ta.style.top = "0";
    ta.style.opacity = "0";
    ta.style.pointerEvents = "none";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function makePresentationId() {
  return `pr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function makePresentationItemId() {
  return `pri-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function makePresentationShareToken() {
  return `share-${Date.now().toString(36)}${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function getImageAssetDocId(projectId, nodeId) {
  return `${projectId}__${nodeId}`;
}

function sanitizeProjectForSave(project) {
  const cloned = JSON.parse(JSON.stringify(project || {}));
  cloned.nodes = (cloned.nodes || []).map((node) => {
    if (node?.type === "file" && node.fileKind === "image" && node.assetId) {
      return { ...node, src: null };
    }
    return node;
  });
  return cloned;
}

function buildImageAssetMap(docs = []) {
  const map = new Map();
  docs.forEach((doc) => {
    const data = doc.data?.() || {};
    const key = `${data.projectId}::${data.nodeId}`;
    map.set(key, {
      id: doc.id,
      src: data.src || null,
      mime: data.mime || "",
      size: data.size || "",
    });
  });
  return map;
}

function hydrateProjectImageNodes(project, assetMap) {
  project.nodes = (project.nodes || []).map((node) => {
    if (node?.type === "file" && node.fileKind === "image" && node.assetId) {
      const asset = assetMap.get(`${project.id}::${node.id}`);
      if (asset?.src) {
        node.src = asset.src;
        node.mime = node.mime || asset.mime || "";
        node.size = node.size || asset.size || "";
      }
    }
    return node;
  });
  return project;
}

async function saveImageAsset(projectId, nodeId, payload) {
  const assetId = getImageAssetDocId(projectId, nodeId);
  await imageAssetRef().doc(assetId).set({
    projectId,
    nodeId,
    src: payload.src,
    mime: payload.mime || "",
    size: payload.size || "",
    updatedAt: Date.now(),
  });
  return assetId;
}

async function deleteImageAsset(projectId, nodeId) {
  try {
    await imageAssetRef().doc(getImageAssetDocId(projectId, nodeId)).delete();
  } catch {}
}

async function migrateLegacyProjectImageAssets(projectList = []) {
  for (const project of projectList) {
    if (!project?.id || !Array.isArray(project.nodes)) continue;
    let changed = false;
    for (const node of project.nodes) {
      if (
        node?.type === "file" &&
        node.fileKind === "image" &&
        node.src &&
        !node.assetId
      ) {
        const assetId = await saveImageAsset(project.id, node.id, {
          src: node.src,
          mime: node.mime || "",
          size: node.size || "",
        });
        node.assetId = assetId;
        changed = true;
      }
    }
    if (changed) {
      await saveToFirestore(project);
    }
  }
}

function normalizePresentationData(presentation = {}) {
  return {
    id: presentation.id || makePresentationId(),
    name: String(presentation.name || "Untitled Presentation"),
    description: String(presentation.description || ""),
    created: Number(presentation.created) || Date.now(),
    updatedAt: Number(presentation.updatedAt) || Date.now(),
    shareToken: presentation.shareToken || null,
    items: Array.isArray(presentation.items)
      ? presentation.items
          .map((item) => ({
            id: item.id || makePresentationItemId(),
            projectId: item.projectId || null,
            x: Number(item.x) || 120,
            y: Number(item.y) || 120,
          }))
          .filter((item) => item.projectId)
      : [],
    objects: presentationObjectsFromRaw(presentation.objects),
    spatialConnections: Array.isArray(presentation.spatialConnections)
      ? presentation.spatialConnections
          .filter((c) => c && c.fromId && c.toId && c.fromId !== c.toId)
          .map((c) => ({
            id:
              c.id ||
              `pc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            fromId: String(c.fromId),
            toId: String(c.toId),
            fromPos: c.fromPos || null,
            toPos: c.toPos || null,
          }))
      : [],
  };
}

function getPresentationById(presentationId) {
  return (
    presentations.find((presentation) => presentation.id === presentationId) ||
    null
  );
}

function getPresentationProjectIds(presentation = currentPresentation) {
  return new Set((presentation?.items || []).map((item) => item.projectId));
}

function getPresentationGridPosition(index = 0) {
  const column = index % 3;
  const row = Math.floor(index / 3);
  return {
    x: 120 + column * 360,
    y: 120 + row * 280,
  };
}

function getPresentationViewportCenter() {
  const canvas = document.getElementById("presentation-canvas");
  if (!canvas) return { x: 220, y: 180 };
  const sc = presentationScale || 1;
  return {
    x: (canvas.clientWidth / 2 - presentationViewOffset.x) / sc,
    y: (canvas.clientHeight / 2 - presentationViewOffset.y) / sc,
  };
}

function presentationClientToWorld(clientX, clientY) {
  const canvas = document.getElementById("presentation-canvas");
  if (!canvas) return { x: 200, y: 160 };
  const r = canvas.getBoundingClientRect();
  const sc = presentationScale || 1;
  return {
    x: (clientX - r.left - presentationViewOffset.x) / sc,
    y: (clientY - r.top - presentationViewOffset.y) / sc,
  };
}

function presentationSpatialHandlesInnerHTML(endpointId) {
  const eid = esc(String(endpointId));
  return `<div class="conn-handle pres-spatial-handle" data-pres-ep="${eid}" data-pos="top"></div><div class="conn-handle pres-spatial-handle" data-pres-ep="${eid}" data-pos="bottom"></div><div class="conn-handle pres-spatial-handle" data-pres-ep="${eid}" data-pos="left"></div><div class="conn-handle pres-spatial-handle" data-pres-ep="${eid}" data-pos="right"></div>`;
}

function bindPresentationSpatialConnHandles(el) {
  if (!el) return;
  el.querySelectorAll(".pres-spatial-handle").forEach((h) => {
    h.addEventListener("mousedown", (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (!currentPresentation || currentScreenName !== "presentation") return;
      const ep = h.dataset.presEp;
      const pos = h.dataset.pos || "right";
      if (!ep) return;
      startPendingPresentationSpatialConn(ep, pos, e.clientX, e.clientY);
      setPresentationTool("connect");
    });
  });
}

function makePresentationObjectAt(type, worldX, worldY) {
  const x = Math.max(60, Math.round(worldX - 110));
  const y = Math.max(60, Math.round(worldY - 60));
  const id = "po" + Date.now() + Math.floor(Math.random() * 1000);
  if (isSharedTextObjectType(type)) {
    return createSharedTextObjectState(id, type, x, y, {}, SURFACES.PRESENTATION);
  }
  if (type === "line") return createSimpleLineItem(id, x, y);
  return createQuickNoteFallbackItem(id, type, x, y);
}

function makePresentationObject(type) {
  const pos = getPresentationViewportCenter();
  return makePresentationObjectAt(type, pos.x, pos.y);
}

function formatPresentationTimestamp(ts) {
  if (!ts) return "No date";
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function buildPublicProjectSnapshot(project) {
  const safe = sanitizeProjectForSave(project);
  const publicNodes = (safe.nodes || []).map((node) => {
    if (!node) return node;
    const out = { ...node };
    // Never publish inline image payloads inside public presentation docs.
    const isImageLike =
      out.type === "image" ||
      (out.type === "file" && out.fileKind === "image");
    if (isImageLike) {
      out.type = "file";
      out.fileKind = "image";
      out.src = null;
      if (!out.assetId && out.id && project?.id) {
        out.assetId = `${project.id}__${out.id}`;
      }
    }
    delete out.uploading;
    return out;
  });
  return {
    id: project.id,
    name: project.name || "Untitled",
    desc: project.desc || "",
    status: project.status || "In Progress",
    color: project.color || "#ffffff",
    category: project.category || categoryFromColor(project.color || "#ffffff"),
    created: project.created || Date.now(),
    nodeCount: Array.isArray(project.nodes) ? project.nodes.length : 0,
    connectionCount: Array.isArray(project.connections)
      ? project.connections.length
      : 0,
    // Keep snapshots lightweight; viewer hydrates image nodes via image_assets.
    nodes: JSON.parse(JSON.stringify(publicNodes)),
    connections: JSON.parse(JSON.stringify(project.connections || [])),
  };
}

function buildPublishedPresentationPayload(presentation) {
  return {
    ownerId: currentUser?.uid || null,
    presentationId: presentation.id,
    name: presentation.name || "Untitled Presentation",
    description: presentation.description || "",
    created: presentation.created || Date.now(),
    updatedAt: Date.now(),
    objects: JSON.parse(JSON.stringify(presentation.objects || [])),
    spatialConnections: JSON.parse(
      JSON.stringify(presentation.spatialConnections || []),
    ),
    items: (presentation.items || [])
      .map((item) => {
        const project = projects.find((entry) => entry.id === item.projectId);
        if (!project) return null;
        return {
          id: item.id,
          projectId: item.projectId,
          x: item.x,
          y: item.y,
          snapshot: buildPublicProjectSnapshot(project),
        };
      })
      .filter(Boolean),
  };
}

async function publishPresentation(presentation) {
  if (!presentation || !currentUser) return;
  if (!presentation.shareToken)
    presentation.shareToken = makePresentationShareToken();
  const payload = buildPublishedPresentationPayload(presentation);
  await publicPresentationRef(presentation.shareToken).set(payload, {
    merge: true,
  });
}

async function deletePresentationFromFirestore(presentation) {
  if (!presentation || !currentUser) return;
  try {
    await presentationRef().doc(presentation.id).delete();
    if (presentation.shareToken) {
      await publicPresentationRef(presentation.shareToken).delete();
    }
  } catch (e) {
    showToast("Presentation delete failed: " + e.message);
  }
}

async function savePresentationToFirestore(presentation) {
  if (!presentation || !currentUser) return false;
  presentation.updatedAt = Date.now();
  setSyncStatus("syncing");
  try {
    await presentationRef().doc(presentation.id).set(
      {
        name: presentation.name,
        description: presentation.description || "",
        created: presentation.created || Date.now(),
        updatedAt: presentation.updatedAt,
        shareToken: presentation.shareToken || null,
        items: presentation.items || [],
        objects: presentation.objects || [],
        spatialConnections: presentation.spatialConnections || [],
      },
      { merge: true },
    );
    if (presentation.shareToken) await publishPresentation(presentation);
    setSyncStatus("synced");
    return true;
  } catch (e) {
    setSyncStatus("error");
    showToast("Presentation save failed: " + e.message);
    return false;
  }
}

function queuePresentationSave(presentation = currentPresentation) {
  if (!presentation) return;
  captureHistory();
  if (presentationSaveTimer) clearTimeout(presentationSaveTimer);
  presentationSaveTimer = setTimeout(
    () => savePresentationToFirestore(presentation),
    300,
  );
}

async function syncPublishedPresentationsForProject(project) {
  if (!project || !currentUser) return;
  const linked = presentations.filter(
    (presentation) =>
      presentation.shareToken &&
      presentation.items.some((item) => item.projectId === project.id),
  );
  if (!linked.length) return;
  await Promise.all(
    linked.map((presentation) => publishPresentation(presentation).catch(() => {})),
  );
}

function removeProjectFromPresentations(projectId) {
  const affected = [];
  presentations.forEach((presentation) => {
    const nextItems = (presentation.items || []).filter(
      (item) => item.projectId !== projectId,
    );
    if (nextItems.length !== (presentation.items || []).length) {
      presentation.items = nextItems;
      presentation.updatedAt = Date.now();
      affected.push(presentation);
    }
  });
  if (currentPresentation) {
    currentPresentation =
      getPresentationById(currentPresentation.id) || currentPresentation;
  }
  affected.forEach((presentation) => savePresentationToFirestore(presentation));
}

function syncPresentationItemsWithProjects() {
  const validProjectIds = new Set(projects.map((project) => project.id));
  presentations = presentations.map((presentation) => {
    const normalized = normalizePresentationData(presentation);
    normalized.items = normalized.items.filter((item) =>
      validProjectIds.has(item.projectId),
    );
    return normalized;
  });
  if (currentPresentation) {
    currentPresentation = getPresentationById(currentPresentation.id);
  }
}

function setSyncStatus(s) {
  const dot = document.getElementById("sync-dot"),
    lbl = document.getElementById("sync-label");
  if (!dot || !lbl) return;
  dot.className =
    "sync-dot" +
    (s === "syncing" ? " syncing" : s === "error" ? " error" : "");
  lbl.textContent =
    s === "syncing"
      ? "Saving…"
      : s === "error"
        ? "Save failed"
        : "Synced";
}
function setSaveStatus(s) {
  const dot = document.getElementById("save-dot"),
    lbl = document.getElementById("save-label");
  if (!dot || !lbl) return;
  dot.className = s === "saving" ? "saving" : "";
  lbl.textContent = s === "saving" ? "Saving…" : "Saved";
}

function serializeAppState() {
  return JSON.stringify({
    projects,
    presentations,
    overviewItems,
    currentProjectId: currentProject?.id || null,
    currentPresentationId: currentPresentation?.id || null,
    currentScreenName,
    canvas: currentProject
      ? { nodes, connections, viewOffset, viewScale, targetScale }
      : null,
  });
}

function captureHistory(force = false) {
  if (isRestoringHistory) return;
  const snapshot = serializeAppState();
  if (!force && snapshot === lastHistorySnapshot) return;
  undoStack.push(snapshot);
  if (undoStack.length > 120) undoStack.shift();
  redoStack = [];
  lastHistorySnapshot = snapshot;
}

function restoreHistorySnapshot(snapshot) {
  if (!snapshot) return;
  const state = JSON.parse(snapshot);
  isRestoringHistory = true;
  projects = JSON.parse(JSON.stringify(state.projects || []));
  projects.forEach((project) => {
    project.nodes = normalizeNodeDataList(project.nodes || []);
  });
  presentations = JSON.parse(JSON.stringify(state.presentations || [])).map(
    (presentation) => normalizePresentationData(presentation),
  );
  overviewItems = normalizeOverviewItemDataList(
    JSON.parse(JSON.stringify(state.overviewItems || [])),
  );
  selectedProjectIds.clear();
  selectedOverviewItemIds.clear();
  selectedNodeIds.clear();
  overviewSelection = null;
  selectedConn = null;
  currentProject = state.currentProjectId
    ? projects.find((p) => p.id === state.currentProjectId) || null
    : null;
  currentPresentation = state.currentPresentationId
    ? getPresentationById(state.currentPresentationId)
    : null;
  if (currentProject) {
    nodes = JSON.parse(
      JSON.stringify(state.canvas?.nodes || currentProject.nodes || []),
    );
    nodes = normalizeNodeDataList(nodes);
    connections = JSON.parse(
      JSON.stringify(
        state.canvas?.connections || currentProject.connections || [],
      ),
    );
    viewOffset = state.canvas?.viewOffset || { x: 0, y: 0 };
    viewScale = state.canvas?.viewScale || 1;
    targetScale = state.canvas?.targetScale || viewScale;
    const titleEl = document.getElementById("canvas-project-title");
    if (titleEl) {
      titleEl.textContent = currentProject.name || "Untitled";
      applyTextDirection(titleEl);
    }
    updateCanvasPathbar();
    show("canvas");
    renderAll();
    applyTransform();
  } else if (state.currentScreenName === "presentation") {
    show("presentation");
    renderPresentationScreen();
  } else {
    nodes = [];
    connections = [];
    show("dashboard");
    renderDashboard();
  }
  applyOverviewSelectionClasses();
  applyNodeSelectionClasses();
  lastHistorySnapshot = snapshot;
  isRestoringHistory = false;
}

function undoHistory() {
  if (undoStack.length <= 1) return;
  const current = undoStack.pop();
  redoStack.push(current);
  restoreHistorySnapshot(undoStack[undoStack.length - 1]);
  showToast("Undo");
}

function redoHistory() {
  if (!redoStack.length) return;
  const snapshot = redoStack.pop();
  undoStack.push(snapshot);
  restoreHistorySnapshot(snapshot);
  showToast("Redo");
}

async function loadProjects() {
  show("loading");
  setSyncStatus("syncing");
  try {
    const [snap, dashboardSnap, imageAssetSnap, presentationSnap] =
      await promiseWithTimeout(
        Promise.all([
          pRef().orderBy("created", "asc").get(),
          dashboardRef().get(),
          imageAssetRef().get(),
          presentationRef().orderBy("created", "asc").get(),
        ]),
        60000,
        "Loading timed out — check your connection and try again.",
      );
    const imageAssetMap = buildImageAssetMap(imageAssetSnap.docs);
    projects = snap.docs.map((d) => {
      const project = { id: d.id, ...d.data() };
      project.nodes = normalizeNodeDataList(project.nodes || []);
      return hydrateProjectImageNodes(project, imageAssetMap);
    });
    presentations = presentationSnap.docs.map((d) =>
      normalizePresentationData({ id: d.id, ...d.data() }),
    );
    await migrateLegacyProjectImageAssets(projects);
    overviewItems = dashboardSnap.exists
      ? normalizeOverviewItemDataList(dashboardSnap.data().items || [])
      : [];
    syncPresentationItemsWithProjects();
    if (!projects.length) await seedDefaultProject();
    setSyncStatus("synced");
    const lastView = loadLastView();
    const lastProjectId =
      lastView?.screen === "canvas" ? lastView.projectId : null;
    const lastPresentationId =
      lastView?.screen === "presentation" ? lastView.presentationId : null;
    if (
      lastProjectId &&
      projects.some((project) => project.id === lastProjectId)
    ) {
      openProject(lastProjectId);
    } else if (
      lastPresentationId &&
      presentations.some(
        (presentation) => presentation.id === lastPresentationId,
      )
    ) {
      openPresentationHub(lastPresentationId);
    } else {
      show("dashboard");
      renderDashboard();
      setTimeout(dashboardResetView, 60);
      saveLastView("dashboard");
    }
    captureHistory(true);
  } catch (e) {
    setSyncStatus("error");
    showToast("Load failed: " + e.message);
    show("dashboard");
    renderDashboard();
    setTimeout(dashboardResetView, 60);
    captureHistory(true);
  }
}

async function saveToFirestore(p) {
  setSyncStatus("syncing");
  setSaveStatus("saving");
  try {
    const { id, ...data } = sanitizeProjectForSave(p);
    await pRef().doc(id).set(data);
    try {
      await syncPublishedPresentationsForProject(p);
    } catch (syncError) {
      showToast("Presentation sync warning: " + syncError.message);
    }
    setSyncStatus("synced");
    setSaveStatus("saved");
  } catch (e) {
    setSyncStatus("error");
    setSaveStatus("saved");
    const message = String(e?.message || "");
    if (
      /maximum size|too large|larger than 1048576|Document exceeds/i.test(
        message,
      )
    ) {
      showToast("Save failed: image is still too large for this project.");
    } else {
      showToast("Save failed: " + message);
    }
  }
}

async function deleteFromFirestore(id) {
  try {
    removeProjectFromPresentations(id);
    await pRef().doc(id).delete();
    const imageDocs = await imageAssetRef().where("projectId", "==", id).get();
    await Promise.all(imageDocs.docs.map((doc) => doc.ref.delete().catch(() => {})));
  } catch (e) {
    showToast("Delete failed: " + e.message);
  }
}

async function saveOverviewToFirestore() {
  setSyncStatus("syncing");
  try {
    await dashboardRef().set({ items: overviewItems }, { merge: true });
    setSyncStatus("synced");
  } catch (e) {
    setSyncStatus("error");
    showToast("Overview save failed: " + e.message);
  }
}

function queueProjectSave(p) {
  captureHistory();
  if (projectSaveTimer) clearTimeout(projectSaveTimer);
  projectSaveTimer = setTimeout(() => saveToFirestore(p), 300);
}

function queueOverviewSave() {
  captureHistory();
  if (overviewSaveTimer) clearTimeout(overviewSaveTimer);
  overviewSaveTimer = setTimeout(() => saveOverviewToFirestore(), 300);
}

function statusSlug(status) {
  return String(status || "In Progress")
    .toLowerCase()
    .replace(/\s+/g, "-");
}

function getCategoryById(categoryId) {
  return (
    workspaceCategories.find((category) => category.id === categoryId) ||
    null
  );
}

function getCategoryByColor(color) {
  const normalized = String(color || "").toLowerCase();
  return (
    workspaceCategories.find(
      (category) => category.color.toLowerCase() === normalized,
    ) || null
  );
}

function getCategoryByLabel(label) {
  const normalized = String(label || "").trim().toLowerCase();
  return (
    workspaceCategories.find(
      (category) => category.label.trim().toLowerCase() === normalized,
    ) || null
  );
}

function getProjectCategoryId(project) {
  return (
    getCategoryByColor(project?.color)?.id ||
    getCategoryByLabel(project?.category)?.id ||
    workspaceCategories[0]?.id ||
    null
  );
}

function getOverviewItemCategoryId(item) {
  return (
    getCategoryById(item?.categoryId)?.id ||
    getCategoryByColor(item?.categoryColor)?.id ||
    getCategoryByLabel(item?.categoryLabel)?.id ||
    workspaceCategories[0]?.id ||
    null
  );
}

function assignProjectToCategory(project, categoryId) {
  const category = getCategoryById(categoryId) || workspaceCategories[0];
  if (!project || !category) return;
  project.color = category.color;
  project.category = category.label;
}

function normalizeProjectCategory(project) {
  const categoryId = getProjectCategoryId(project);
  if (categoryId) assignProjectToCategory(project, categoryId);
}

function setOverviewItemCategory(item, categoryId) {
  const category = getCategoryById(categoryId) || workspaceCategories[0];
  if (!item || !category) return;
  item.categoryId = category.id;
  item.categoryColor = category.color;
  item.categoryLabel = category.label;
}

function getCategoryObjectLinkedProjectIds(item) {
  if (item?.type !== "category") return [];
  const categoryId = getOverviewItemCategoryId(item);
  return projects
    .filter((project) => getProjectCategoryId(project) === categoryId)
    .map((project) => project.id);
}

function isCategoryHiddenByObject(categoryId) {
  return overviewItems.some(
    (item) =>
      item.type === "category" &&
      item.hidden === true &&
      getOverviewItemCategoryId(item) === categoryId,
  );
}

function getOverviewItemCenter(item) {
  const el = document.querySelector(
    `.overview-item[data-item-id="${item.id}"]`,
  );
  const width = el?.offsetWidth || item.w || 240;
  const height = el?.offsetHeight || 36;
  return {
    x: item.x + width / 2,
    y: item.y + height / 2,
  };
}

function layoutCategoryCardsInCircle(item) {
  const projectIds = getCategoryObjectLinkedProjectIds(item);
  if (!projectIds.length) return;
  const center = getOverviewItemCenter(item);
  item.hidden = false;
  const linkedProjects = projectIds
    .map((projectId) => projects.find((entry) => entry.id === projectId))
    .filter(Boolean);
  const avgCardWidth =
    linkedProjects.reduce(
      (sum, project) => sum + (project.w || DEFAULT_PROJECT_CARD_WIDTH),
      0,
    ) / linkedProjects.length;
  const avgCardHeight =
    linkedProjects.reduce(
      (sum, project) => sum + (project.h || DEFAULT_PROJECT_CARD_HEIGHT),
      0,
    ) / linkedProjects.length;
  const ringSpacing = Math.max(avgCardHeight + 80, 280);
  const baseRadius = Math.max(avgCardWidth * 0.9, 280);
  let placedCount = 0;
  let ringIndex = 0;

  while (placedCount < linkedProjects.length) {
    const radius = baseRadius + ringIndex * ringSpacing;
    const circumference = Math.max(1, Math.PI * 2 * radius);
    const slotArc = Math.max(avgCardWidth + 70, 180);
    const ringCapacity = Math.max(4, Math.floor(circumference / slotArc));
    const remaining = linkedProjects.length - placedCount;
    const itemsInRing = Math.min(ringCapacity, remaining);

    for (let i = 0; i < itemsInRing; i += 1) {
      const project = linkedProjects[placedCount + i];
      if (!project) continue;
      const angle = -Math.PI / 2 + (Math.PI * 2 * i) / itemsInRing;
      const width = project.w || DEFAULT_PROJECT_CARD_WIDTH;
      const height = project.h || DEFAULT_PROJECT_CARD_HEIGHT;
      project.x = Math.max(
        20,
        Math.round(center.x + Math.cos(angle) * radius - width / 2),
      );
      project.y = Math.max(
        20,
        Math.round(center.y + Math.sin(angle) * radius - height / 2),
      );
      queueProjectSave(project);
    }

    placedCount += itemsInRing;
    ringIndex += 1;
  }
  queueOverviewSave();
  renderDashboard();
}

function moveProjectsByIds(projectIds, dx, dy) {
  [...new Set(projectIds)].forEach((projectId) => {
    const project = projects.find((entry) => entry.id === projectId);
    const el = document.querySelector(
      `.project-card[data-project-id="${projectId}"]`,
    );
    if (!project || !el) return;
    project.x = Math.max(20, Math.round(project.x + dx));
    project.y = Math.max(20, Math.round(project.y + dy));
    el.style.left = project.x + "px";
    el.style.top = project.y + "px";
  });
}

function categoryFromColor(color) {
  const normalized = String(color || "").toLowerCase();
  return (
    workspaceCategories.find(
      (category) => category.color.toLowerCase() === normalized,
    )?.label || "Projects"
  );
}

function getCategoryColorList() {
  return workspaceCategories.map((category) => category.color);
}

function getDefaultCategoryColor() {
  return workspaceCategories[0]?.color || "#44ff88";
}

function sanitizeCategoryColor(value, fallback = "#44ff88") {
  const raw = String(value || "").trim();
  return /^#([0-9a-f]{6})$/i.test(raw) ? raw.toLowerCase() : fallback;
}

function makeCategoryId() {
  return `cat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function syncProjectCategories() {
  projects.forEach((p) => {
    normalizeProjectCategory(p);
  });
}

function applyWorkspaceUIPrefs() {
  const minimapDisplay = workspaceUIPrefs.showMinimap ? "" : "none";
  const zoomDisplay = workspaceUIPrefs.showZoomControls ? "" : "none";
  ["dashboard-minimap", "minimap"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = minimapDisplay;
  });
  ["dashboard-zoom-controls", "zoom-controls"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = zoomDisplay;
  });
}

function syncWorkspaceMenuVisibility() {
  const menu = document.getElementById("workspace-menu");
  menu?.classList.toggle("open", workspaceMenuOpen);
  document
    .getElementById("screen-dashboard")
    ?.classList.toggle("workspace-menu-open", workspaceMenuOpen);
}

function saveWorkspacePrefs() {
  localStorage.setItem(
    "bev_workspace_prefs",
    JSON.stringify({
      categories: workspaceCategories,
      sort: workspaceSort,
      uiPrefs: workspaceUIPrefs,
    }),
  );
}

function loadWorkspacePrefs() {
  try {
    const raw = localStorage.getItem("bev_workspace_prefs");
    if (!raw) return;
    const prefs = JSON.parse(raw);
    if (Array.isArray(prefs.categories) && prefs.categories.length) {
      workspaceCategories = prefs.categories.map((category, index) => ({
        id: category.id || `cat-loaded-${index}`,
        color: sanitizeCategoryColor(
          category.color,
          DEFAULT_WORKSPACE_CATEGORIES[index]?.color || "#44ff88",
        ),
        label:
          String(category.label || "").trim() ||
          DEFAULT_WORKSPACE_CATEGORIES[index]?.label ||
          `Category ${index + 1}`,
        enabled: category.enabled !== false,
      }));
    } else if (prefs.categoryMap) {
      const disabled = Array.isArray(prefs.categoryFilters) ? [] : [];
      workspaceCategories = Object.entries(prefs.categoryMap).map(
        ([color, label], index) => ({
          id: `cat-migrated-${index}`,
          color: sanitizeCategoryColor(color),
          label: String(label || "").trim() || `Category ${index + 1}`,
          enabled:
            !Array.isArray(prefs.categoryFilters) ||
            prefs.categoryFilters.includes(String(label || "").trim()),
        }),
      );
    }
    workspaceSort = prefs.sort || "created-desc";
    workspaceUIPrefs = {
      showZoomControls: prefs.uiPrefs?.showZoomControls !== false,
      showMinimap: prefs.uiPrefs?.showMinimap !== false,
    };
  } catch {}
  if (!workspaceCategories.length) {
    workspaceCategories = DEFAULT_WORKSPACE_CATEGORIES.map(
      (category) => ({
        ...category,
      }),
    );
  }
  selectedColor = getCategoryColorList().includes(selectedColor)
    ? selectedColor
    : getDefaultCategoryColor();
  applyWorkspaceUIPrefs();
}

function getTodayDateKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function parseDateKey(dateKey) {
  const [year, month, day] = String(dateKey || getTodayDateKey())
    .split("-")
    .map(Number);
  return new Date(year || 0, (month || 1) - 1, day || 1);
}

function formatDailyTodoStamp(dateKey) {
  return parseDateKey(dateKey).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatDailyTodoTime() {
  return new Date().toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function shiftDailyTodoDate(step) {
  const next = parseDateKey(dailyTodoState.currentDate || getTodayDateKey());
  next.setDate(next.getDate() + step);
  dailyTodoState.currentDate = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
  saveDailyTodoState();
  renderDailyTodoWidget();
}

function getDailyTodoItems(dateKey = dailyTodoState.currentDate) {
  const key = dateKey || getTodayDateKey();
  if (!Array.isArray(dailyTodoState.entries[key])) {
    dailyTodoState.entries[key] = [];
  }
  return dailyTodoState.entries[key];
}

function saveDailyTodoState() {
  localStorage.setItem(
    "bev_daily_todos",
    JSON.stringify(dailyTodoState),
  );
}

function syncDailyTodoSelection(dateKey = dailyTodoState.currentDate) {
  const itemIds = new Set(getDailyTodoItems(dateKey).map((item) => item.id));
  dailyTodoSelectedIds = new Set(
    [...dailyTodoSelectedIds].filter((id) => itemIds.has(id)),
  );
  if (!itemIds.has(dailyTodoSelectionAnchorId)) {
    dailyTodoSelectionAnchorId = [...dailyTodoSelectedIds][0] || null;
  }
}

function setDailyTodoSelection(ids = [], anchorId = null) {
  dailyTodoSelectedIds = new Set(ids.filter(Boolean));
  dailyTodoSelectionAnchorId =
    anchorId || ids[ids.length - 1] || [...dailyTodoSelectedIds][0] || null;
}

function findDailyTodoRow(target) {
  return target?.closest?.(".daily-todo-item") || null;
}

function getDailyTodoSelectedItems(dateKey = dailyTodoState.currentDate) {
  const items = getDailyTodoItems(dateKey);
  syncDailyTodoSelection(dateKey);
  return items.filter((item) => dailyTodoSelectedIds.has(item.id));
}

function getDailyTodoItemsFromDOMSelection(
  dateKey = dailyTodoState.currentDate,
) {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount || selection.isCollapsed) return [];
  const widget = document.getElementById("daily-todo-widget");
  const anchorNode = selection.anchorNode;
  const focusNode = selection.focusNode;
  if (
    !widget?.contains(anchorNode) ||
    !widget?.contains(focusNode)
  )
    return [];
  const rows = [
    ...document.querySelectorAll("#daily-todo-list .daily-todo-item"),
  ];
  const selectedIds = rows
    .filter((row) => selection.containsNode(row, true))
    .map((row) => row.dataset.todoId)
    .filter(Boolean);
  if (!selectedIds.length) return [];
  const itemMap = new Map(
    getDailyTodoItems(dateKey).map((item) => [item.id, item]),
  );
  return selectedIds.map((id) => itemMap.get(id)).filter(Boolean);
}

function serializeDailyTodoClipboard(items) {
  return JSON.stringify(
    items.map((item) => ({
      text: String(item?.text || ""),
      done: !!item?.done,
    })),
  );
}

function formatDailyTodoClipboardText(items) {
  return items
    .map((item) => `- [${item.done ? "x" : " "}] ${String(item.text || "")}`)
    .join("\n");
}

function parseDailyTodoClipboardText(text) {
  const raw = String(text || "");
  if (!raw.trim()) return [];
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^[-*]\s+\[(x| )\]\s*(.*)$/i);
      if (match) {
        return {
          text: match[2] || "",
          done: match[1].toLowerCase() === "x",
        };
      }
      return { text: line, done: false };
    })
    .filter((item) => item.text.trim().length);
}

function getDailyTodoPasteInsertIndex(dateKey = dailyTodoState.currentDate) {
  const items = getDailyTodoItems(dateKey);
  const activeRow = findDailyTodoRow(document.activeElement);
  if (activeRow?.dataset?.todoId) {
    const activeIndex = items.findIndex(
      (item) => item.id === activeRow.dataset.todoId,
    );
    if (activeIndex >= 0) return activeIndex + 1;
  }
  const selectedIndexes = items
    .map((item, index) =>
      dailyTodoSelectedIds.has(item.id) ? index : -1,
    )
    .filter((index) => index >= 0);
  if (selectedIndexes.length) {
    return Math.max(...selectedIndexes) + 1;
  }
  return items.length;
}

function insertDailyTodoItems(entries, dateKey = dailyTodoState.currentDate) {
  const items = getDailyTodoItems(dateKey);
  const normalizedEntries = (entries || [])
    .map((entry) => ({
      id: `todo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text: String(entry?.text || "").trim(),
      done: !!entry?.done,
    }))
    .filter((entry) => entry.text);
  if (!normalizedEntries.length) return false;
  const insertAt = getDailyTodoPasteInsertIndex(dateKey);
  items.splice(insertAt, 0, ...normalizedEntries);
  setDailyTodoSelection(
    normalizedEntries.map((entry) => entry.id),
    normalizedEntries[normalizedEntries.length - 1]?.id || null,
  );
  dailyTodoState.open = true;
  saveDailyTodoState();
  renderDailyTodoWidget();
  return true;
}

function focusLastDailyTodoText() {
  requestAnimationFrame(() => {
    const rows = document.querySelectorAll(".daily-todo-text");
    const target = rows[rows.length - 1];
    if (!target) return;
    target.focus();
    const range = document.createRange();
    range.selectNodeContents(target);
    range.collapse(false);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
}

function addDailyTodoItem(text = "New quick task") {
  const items = getDailyTodoItems();
  items.push({
    id: `todo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    text,
    done: false,
  });
  dailyTodoState.open = true;
  saveDailyTodoState();
  renderDailyTodoWidget();
  focusLastDailyTodoText();
}

function syncDailyTodoWidgetVisibility(screenName) {
  const widget = document.getElementById("daily-todo-widget");
  if (!widget) return;
  widget.classList.toggle(
    "visible",
    screenName === "dashboard" || screenName === "canvas",
  );
}

function getGeneralTodoItems() {
  if (!Array.isArray(generalTodoState.items)) {
    generalTodoState.items = [];
  }
  return generalTodoState.items;
}

function saveGeneralTodoState() {
  localStorage.setItem(
    "bev_general_todos",
    JSON.stringify(generalTodoState),
  );
}

function syncGeneralTodoSelection() {
  const itemIds = new Set(getGeneralTodoItems().map((item) => item.id));
  generalTodoSelectedIds = new Set(
    [...generalTodoSelectedIds].filter((id) => itemIds.has(id)),
  );
  if (!itemIds.has(generalTodoSelectionAnchorId)) {
    generalTodoSelectionAnchorId = [...generalTodoSelectedIds][0] || null;
  }
}

function setGeneralTodoSelection(ids = [], anchorId = null) {
  generalTodoSelectedIds = new Set(ids.filter(Boolean));
  generalTodoSelectionAnchorId =
    anchorId ||
    ids[ids.length - 1] ||
    [...generalTodoSelectedIds][0] ||
    null;
}

function findGeneralTodoRow(target) {
  return target?.closest?.(".general-todo-item") || null;
}

function getGeneralTodoSelectedItems() {
  const items = getGeneralTodoItems();
  syncGeneralTodoSelection();
  return items.filter((item) => generalTodoSelectedIds.has(item.id));
}

function getGeneralTodoItemsFromDOMSelection() {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount || selection.isCollapsed) return [];
  const widget = document.getElementById("general-todo-widget");
  const anchorNode = selection.anchorNode;
  const focusNode = selection.focusNode;
  if (!widget?.contains(anchorNode) || !widget?.contains(focusNode)) {
    return [];
  }
  const rows = [
    ...document.querySelectorAll("#general-todo-list .general-todo-item"),
  ];
  const selectedIds = rows
    .filter((row) => selection.containsNode(row, true))
    .map((row) => row.dataset.todoId)
    .filter(Boolean);
  if (!selectedIds.length) return [];
  const itemMap = new Map(
    getGeneralTodoItems().map((item) => [item.id, item]),
  );
  return selectedIds.map((id) => itemMap.get(id)).filter(Boolean);
}

function serializeGeneralTodoClipboard(items) {
  return JSON.stringify(
    items.map((item) => ({
      text: String(item?.text || ""),
      done: !!item?.done,
      deadline: String(item?.deadline || ""),
    })),
  );
}

function formatGeneralTodoClipboardText(items) {
  return items
    .map((item) => {
      const prefix = `- [${item.done ? "x" : " "}] ${String(item.text || "")}`;
      return item.deadline ? `${prefix} (Due ${item.deadline})` : prefix;
    })
    .join("\n");
}

function parseGeneralTodoClipboardText(text) {
  const raw = String(text || "");
  if (!raw.trim()) return [];
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(
        /^[-*]\s+\[(x| )\]\s*(.*?)(?:\s+\(Due\s+(\d{4}-\d{2}-\d{2})\))?$/i,
      );
      if (match) {
        return {
          text: match[2] || "",
          done: match[1].toLowerCase() === "x",
          deadline: match[3] || "",
        };
      }
      return { text: line, done: false, deadline: "" };
    })
    .filter((item) => item.text.trim().length);
}

function getGeneralTodoPasteInsertIndex() {
  const items = getGeneralTodoItems();
  const activeRow = findGeneralTodoRow(document.activeElement);
  if (activeRow?.dataset?.todoId) {
    const activeIndex = items.findIndex(
      (item) => item.id === activeRow.dataset.todoId,
    );
    if (activeIndex >= 0) return activeIndex + 1;
  }
  const selectedIndexes = items
    .map((item, index) =>
      generalTodoSelectedIds.has(item.id) ? index : -1,
    )
    .filter((index) => index >= 0);
  if (selectedIndexes.length) {
    return Math.max(...selectedIndexes) + 1;
  }
  return items.length;
}

function insertGeneralTodoItems(entries) {
  const items = getGeneralTodoItems();
  const normalizedEntries = (entries || [])
    .map((entry) => ({
      id: `general-todo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text: String(entry?.text || "").trim(),
      done: !!entry?.done,
      deadline:
        /^\d{4}-\d{2}-\d{2}$/.test(String(entry?.deadline || ""))
          ? String(entry.deadline)
          : "",
    }))
    .filter((entry) => entry.text);
  if (!normalizedEntries.length) return false;
  const insertAt = getGeneralTodoPasteInsertIndex();
  items.splice(insertAt, 0, ...normalizedEntries);
  setGeneralTodoSelection(
    normalizedEntries.map((entry) => entry.id),
    normalizedEntries[normalizedEntries.length - 1]?.id || null,
  );
  generalTodoState.open = true;
  saveGeneralTodoState();
  renderGeneralTodoWidget();
  return true;
}

function focusLastGeneralTodoText() {
  requestAnimationFrame(() => {
    const rows = document.querySelectorAll(".general-todo-text");
    const target = rows[rows.length - 1];
    if (!target) return;
    target.focus();
    const range = document.createRange();
    range.selectNodeContents(target);
    range.collapse(false);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
}

function addGeneralTodoItem(text = "New general task", deadline = "") {
  const items = getGeneralTodoItems();
  items.push({
    id: `general-todo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    text,
    done: false,
    deadline,
  });
  generalTodoState.open = true;
  saveGeneralTodoState();
  renderGeneralTodoWidget();
  focusLastGeneralTodoText();
}

function getGeneralTodoDeadlineInfo(deadline) {
  const raw = String(deadline || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return { daysUntil: Infinity, priorityClass: "priority-cyan", label: "No due date" };
  }
  const target = parseDateKey(raw);
  const today = parseDateKey(getTodayDateKey());
  const daysUntil = Math.ceil((target - today) / 86400000);
  const weekDisplay =
    daysUntil <= 0 ? 0 : Math.max(1, Math.ceil(daysUntil / 7));
  const dayDisplay = Math.max(0, daysUntil);
  const label =
    daysUntil < 0 ? `0 W / ${Math.abs(daysUntil)} D OVER` : `${weekDisplay} W / ${dayDisplay} D`;
  if (daysUntil <= 3) {
    return { daysUntil, priorityClass: "priority-red", label };
  }
  if (daysUntil <= 7) {
    return { daysUntil, priorityClass: "priority-orange", label };
  }
  if (daysUntil <= 14) {
    return { daysUntil, priorityClass: "priority-yellow", label };
  }
  if (daysUntil <= 28) {
    return { daysUntil, priorityClass: "priority-green", label };
  }
  return { daysUntil, priorityClass: "priority-cyan", label };
}

function getSortedGeneralTodoItems() {
  return [...getGeneralTodoItems()].sort((a, b) => {
    const aInfo = getGeneralTodoDeadlineInfo(a.deadline);
    const bInfo = getGeneralTodoDeadlineInfo(b.deadline);
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (aInfo.daysUntil !== bInfo.daysUntil) {
      return aInfo.daysUntil - bInfo.daysUntil;
    }
    return String(a.text || "").localeCompare(String(b.text || ""));
  });
}

function syncGeneralTodoWidgetVisibility(screenName) {
  const widget = document.getElementById("general-todo-widget");
  if (!widget) return;
  widget.classList.toggle(
    "visible",
    screenName === "dashboard" || screenName === "canvas",
  );
}

function renderGeneralTodoWidget() {
  const widget = document.getElementById("general-todo-widget");
  if (!widget) return;
  const stamp = document.getElementById("general-todo-stamp");
  const list = document.getElementById("general-todo-list");
  const toggle = document.getElementById("general-todo-toggle");
  const visibilityBtn = document.getElementById("general-todo-visibility");
  if (!stamp || !list || !toggle || !visibilityBtn) return;
  syncGeneralTodoSelection();
  const items = getGeneralTodoItems();
  const openCount = items.filter((item) => !item.done).length;
  stamp.textContent = `${openCount} open task${openCount === 1 ? "" : "s"}`;
  widget.classList.toggle("collapsed", !generalTodoState.open);
  toggle.textContent = generalTodoState.open ? "−" : "◫";
  toggle.title = generalTodoState.open
    ? "Collapse general to do"
    : "Open general to do";
  visibilityBtn.textContent = generalTodoState.showDone ? "✓" : "⦸";
  visibilityBtn.title = generalTodoState.showDone
    ? "Hide done tasks"
    : "Show done tasks";
  const visibleItems = getSortedGeneralTodoItems().filter(
    (item) => generalTodoState.showDone || !item.done,
  );
  if (!items.length) {
    list.innerHTML =
      '<div class="general-todo-empty">No general tasks yet. Add one with an optional deadline.</div>';
    return;
  }
  if (!visibleItems.length) {
    list.innerHTML =
      '<div class="general-todo-empty">All visible tasks are done. Use the button above to show completed tasks.</div>';
    return;
  }
  list.innerHTML = visibleItems
    .map(
      (item) => {
        const deadlineInfo = getGeneralTodoDeadlineInfo(item.deadline);
        return `<div class="general-todo-item ${deadlineInfo.priorityClass}${generalTodoSelectedIds.has(item.id) ? " is-selected" : ""}" data-todo-id="${item.id}">
      <button class="general-todo-check${item.done ? " is-done" : ""}" type="button">${item.done ? "✓" : ""}</button>
      <div class="general-todo-main">
        <div class="general-todo-text${item.done ? " is-done" : ""}" contenteditable="true" spellcheck="false">${esc(item.text || "")}</div>
        <div class="general-todo-meta-row">
          <input class="general-todo-deadline" type="date" value="${esc(item.deadline || "")}" />
          <div class="general-todo-priority ${deadlineInfo.priorityClass}">${deadlineInfo.label}</div>
        </div>
      </div>
    </div>`;
      },
    )
    .join("");
  applyTextDirectionToAll(list);
  list.querySelectorAll(".general-todo-item").forEach((row) => {
    const todoId = row.dataset.todoId;
    const item = items.find((entry) => entry.id === todoId);
    if (!item) return;
    row.addEventListener("mousedown", (e) => {
      if (!(e.metaKey || e.ctrlKey || e.shiftKey)) return;
      e.preventDefault();
      const idsInOrder = visibleItems.map((entry) => entry.id);
      if (e.shiftKey && generalTodoSelectionAnchorId) {
        const anchorIndex = idsInOrder.indexOf(generalTodoSelectionAnchorId);
        const targetIndex = idsInOrder.indexOf(todoId);
        if (anchorIndex >= 0 && targetIndex >= 0) {
          const [from, to] = [anchorIndex, targetIndex].sort((a, b) => a - b);
          setGeneralTodoSelection(idsInOrder.slice(from, to + 1), todoId);
        } else {
          setGeneralTodoSelection([todoId], todoId);
        }
      } else if (e.metaKey || e.ctrlKey) {
        const nextIds = new Set(generalTodoSelectedIds);
        if (nextIds.has(todoId)) nextIds.delete(todoId);
        else nextIds.add(todoId);
        setGeneralTodoSelection([...nextIds], todoId);
      }
      renderGeneralTodoWidget();
    });
    row.querySelector(".general-todo-check")?.addEventListener("click", () => {
      item.done = !item.done;
      saveGeneralTodoState();
      renderGeneralTodoWidget();
    });
    row.querySelector(".general-todo-text")?.addEventListener("blur", (e) => {
      const text = e.target.textContent.trim();
      if (!text) {
        generalTodoState.items = items.filter((entry) => entry.id !== todoId);
      } else {
        item.text = text;
      }
      saveGeneralTodoState();
      renderGeneralTodoWidget();
    });
    row
      .querySelector(".general-todo-text")
      ?.addEventListener("keydown", (e) => {
        const text = e.target.textContent.trim();
        if (e.key === "Enter") {
          e.preventDefault();
          item.text = text || "New general task";
          saveGeneralTodoState();
          addGeneralTodoItem("");
          return;
        }
        if ((e.key === "Backspace" || e.key === "Delete") && !text) {
          e.preventDefault();
          generalTodoState.items = items.filter(
            (entry) => entry.id !== todoId,
          );
          saveGeneralTodoState();
          renderGeneralTodoWidget();
        }
      });
    row
      .querySelector(".general-todo-deadline")
      ?.addEventListener("change", (e) => {
        item.deadline = /^\d{4}-\d{2}-\d{2}$/.test(e.target.value)
          ? e.target.value
          : "";
        saveGeneralTodoState();
        renderGeneralTodoWidget();
      });
  });
}

function setupGeneralTodoWidget() {
  if (generalTodoInitialized) return;
  generalTodoInitialized = true;
  try {
    const saved = localStorage.getItem("bev_general_todos");
    if (saved) {
      const parsed = JSON.parse(saved);
      generalTodoState = {
        open: parsed?.open === true,
        items: Array.isArray(parsed?.items) ? parsed.items : [],
        showDone: parsed?.showDone !== false,
      };
    }
  } catch {
    generalTodoState = {
      open: false,
      items: [],
      showDone: true,
    };
  }
  const toggle = document.getElementById("general-todo-toggle");
  const add = document.getElementById("general-todo-add");
  const visibilityBtn = document.getElementById("general-todo-visibility");
  toggle?.addEventListener("click", () => {
    generalTodoState.open = !generalTodoState.open;
    saveGeneralTodoState();
    renderGeneralTodoWidget();
  });
  add?.addEventListener("click", () => addGeneralTodoItem());
  visibilityBtn?.addEventListener("click", () => {
    generalTodoState.showDone = !generalTodoState.showDone;
    saveGeneralTodoState();
    renderGeneralTodoWidget();
  });
  document.addEventListener("copy", (e) => {
    const widget = document.getElementById("general-todo-widget");
    const activeNode = document.activeElement;
    const selection = window.getSelection();
    const selectionInWidget =
      widget?.contains(activeNode) ||
      widget?.contains(selection?.anchorNode) ||
      widget?.contains(selection?.focusNode);
    if (!selectionInWidget) return;
    const itemsToCopy =
      getGeneralTodoSelectedItems().length
        ? getGeneralTodoSelectedItems()
        : getGeneralTodoItemsFromDOMSelection();
    if (!itemsToCopy.length || !e.clipboardData) return;
    e.preventDefault();
    e.clipboardData.setData(
      GENERAL_TODO_CLIPBOARD_MIME,
      serializeGeneralTodoClipboard(itemsToCopy),
    );
    e.clipboardData.setData(
      "text/plain",
      formatGeneralTodoClipboardText(itemsToCopy),
    );
    showToast(`Copied ${itemsToCopy.length} task${itemsToCopy.length === 1 ? "" : "s"}`);
  });
  document.addEventListener("paste", (e) => {
    const widget = document.getElementById("general-todo-widget");
    const target = e.target;
    const selection = window.getSelection();
    const pasteInWidget =
      widget?.contains(target) ||
      widget?.contains(selection?.anchorNode);
    if (!pasteInWidget || !e.clipboardData) return;
    const customData = e.clipboardData.getData(GENERAL_TODO_CLIPBOARD_MIME);
    let entries = [];
    if (customData) {
      try {
        entries = JSON.parse(customData);
      } catch {
        entries = [];
      }
    } else {
      const plainText = e.clipboardData.getData("text/plain");
      const parsed = parseGeneralTodoClipboardText(plainText);
      if (parsed.length > 1 || /^\s*[-*]\s+\[(x| )\]/im.test(plainText)) {
        entries = parsed;
      }
    }
    if (!entries.length) return;
    e.preventDefault();
    if (insertGeneralTodoItems(entries)) {
      showToast(`Pasted ${entries.length} task${entries.length === 1 ? "" : "s"}`);
    }
  });
  renderGeneralTodoWidget();
}

function renderDailyTodoWidget() {
  const widget = document.getElementById("daily-todo-widget");
  if (!widget) return;
  const dateKey = dailyTodoState.currentDate || getTodayDateKey();
  const stamp = document.getElementById("daily-todo-stamp");
  const dayLabel = document.getElementById("daily-todo-day-label");
  const list = document.getElementById("daily-todo-list");
  const toggle = document.getElementById("daily-todo-toggle");
  if (!stamp || !dayLabel || !list || !toggle) return;
  syncDailyTodoSelection(dateKey);
  stamp.textContent = formatDailyTodoStamp(dateKey);
  dayLabel.textContent =
    dateKey === getTodayDateKey() ? "Today" : formatDailyTodoStamp(dateKey);
  widget.classList.toggle("collapsed", !dailyTodoState.open);
  toggle.textContent = dailyTodoState.open ? "−" : "◫";
  toggle.title = dailyTodoState.open
    ? "Collapse daily to do"
    : "Open daily to do";
  const items = getDailyTodoItems(dateKey);
  if (!items.length) {
    list.innerHTML = `<div class="daily-todo-empty">No quick tasks yet for this day.</div>`;
    return;
  }
  list.innerHTML = items
    .map(
      (item) => `<div class="daily-todo-item${dailyTodoSelectedIds.has(item.id) ? " is-selected" : ""}" data-todo-id="${item.id}">
      <button class="daily-todo-check${item.done ? " is-done" : ""}" type="button">${item.done ? "✓" : ""}</button>
      <div class="daily-todo-text${item.done ? " is-done" : ""}" contenteditable="true" spellcheck="false">${esc(item.text || "")}</div>
    </div>`,
    )
    .join("");
  applyTextDirectionToAll(list);
  list.querySelectorAll(".daily-todo-item").forEach((row) => {
    const todoId = row.dataset.todoId;
    const item = items.find((entry) => entry.id === todoId);
    if (!item) return;
    row.addEventListener("mousedown", (e) => {
      if (!(e.metaKey || e.ctrlKey || e.shiftKey)) return;
      e.preventDefault();
      const idsInOrder = items.map((entry) => entry.id);
      if (e.shiftKey && dailyTodoSelectionAnchorId) {
        const anchorIndex = idsInOrder.indexOf(dailyTodoSelectionAnchorId);
        const targetIndex = idsInOrder.indexOf(todoId);
        if (anchorIndex >= 0 && targetIndex >= 0) {
          const [from, to] = [anchorIndex, targetIndex].sort((a, b) => a - b);
          setDailyTodoSelection(idsInOrder.slice(from, to + 1), todoId);
        } else {
          setDailyTodoSelection([todoId], todoId);
        }
      } else if (e.metaKey || e.ctrlKey) {
        const nextIds = new Set(dailyTodoSelectedIds);
        if (nextIds.has(todoId)) nextIds.delete(todoId);
        else nextIds.add(todoId);
        setDailyTodoSelection([...nextIds], todoId);
      }
      renderDailyTodoWidget();
    });
    row.querySelector(".daily-todo-check")?.addEventListener("click", () => {
      item.done = !item.done;
      saveDailyTodoState();
      renderDailyTodoWidget();
    });
    row.querySelector(".daily-todo-text")?.addEventListener("blur", (e) => {
      const text = e.target.textContent.trim();
      if (!text) {
        dailyTodoState.entries[dateKey] = items.filter(
          (entry) => entry.id !== todoId,
        );
      } else {
        item.text = text;
      }
      saveDailyTodoState();
      renderDailyTodoWidget();
    });
    row
      .querySelector(".daily-todo-text")
      ?.addEventListener("keydown", (e) => {
        const text = e.target.textContent.trim();
        if (e.key === "Enter") {
          e.preventDefault();
          item.text = text || "New quick task";
          saveDailyTodoState();
          addDailyTodoItem("");
          return;
        }
        if ((e.key === "Backspace" || e.key === "Delete") && !text) {
          e.preventDefault();
          dailyTodoState.entries[dateKey] = items.filter(
            (entry) => entry.id !== todoId,
          );
          saveDailyTodoState();
          renderDailyTodoWidget();
        }
      });
  });
}

function setupDailyTodoWidget() {
  if (dailyTodoInitialized) return;
  dailyTodoInitialized = true;
  try {
    const saved = localStorage.getItem("bev_daily_todos");
    if (saved) {
      const parsed = JSON.parse(saved);
      dailyTodoState = {
        open: parsed?.open === true,
        currentDate: parsed?.currentDate || getTodayDateKey(),
        entries: parsed?.entries && typeof parsed.entries === "object"
          ? parsed.entries
          : {},
      };
    } else {
      dailyTodoState.currentDate = getTodayDateKey();
    }
  } catch {
    dailyTodoState = {
      open: false,
      currentDate: getTodayDateKey(),
      entries: {},
    };
  }
  const toggle = document.getElementById("daily-todo-toggle");
  const today = document.getElementById("daily-todo-today");
  const prev = document.getElementById("daily-todo-prev");
  const next = document.getElementById("daily-todo-next");
  const add = document.getElementById("daily-todo-add");
  toggle?.addEventListener("click", () => {
    dailyTodoState.open = !dailyTodoState.open;
    saveDailyTodoState();
    renderDailyTodoWidget();
  });
  today?.addEventListener("click", () => {
    dailyTodoState.currentDate = getTodayDateKey();
    dailyTodoState.open = true;
    saveDailyTodoState();
    renderDailyTodoWidget();
  });
  prev?.addEventListener("click", () => shiftDailyTodoDate(-1));
  next?.addEventListener("click", () => shiftDailyTodoDate(1));
  add?.addEventListener("click", () => addDailyTodoItem());
  document.addEventListener("copy", (e) => {
    const widget = document.getElementById("daily-todo-widget");
    const activeNode = document.activeElement;
    const selection = window.getSelection();
    const selectionInWidget =
      widget?.contains(activeNode) ||
      widget?.contains(selection?.anchorNode) ||
      widget?.contains(selection?.focusNode);
    if (!selectionInWidget) return;
    const dateKey = dailyTodoState.currentDate || getTodayDateKey();
    const itemsToCopy =
      getDailyTodoSelectedItems(dateKey).length
        ? getDailyTodoSelectedItems(dateKey)
        : getDailyTodoItemsFromDOMSelection(dateKey);
    if (!itemsToCopy.length || !e.clipboardData) return;
    e.preventDefault();
    e.clipboardData.setData(
      DAILY_TODO_CLIPBOARD_MIME,
      serializeDailyTodoClipboard(itemsToCopy),
    );
    e.clipboardData.setData(
      "text/plain",
      formatDailyTodoClipboardText(itemsToCopy),
    );
    showToast(`Copied ${itemsToCopy.length} to do${itemsToCopy.length === 1 ? "" : "s"}`);
  });
  document.addEventListener("paste", (e) => {
    const widget = document.getElementById("daily-todo-widget");
    const target = e.target;
    const selection = window.getSelection();
    const pasteInWidget =
      widget?.contains(target) ||
      widget?.contains(selection?.anchorNode);
    if (!pasteInWidget || !e.clipboardData) return;
    const customData = e.clipboardData.getData(DAILY_TODO_CLIPBOARD_MIME);
    let entries = [];
    if (customData) {
      try {
        entries = JSON.parse(customData);
      } catch {
        entries = [];
      }
    } else {
      const plainText = e.clipboardData.getData("text/plain");
      const parsed = parseDailyTodoClipboardText(plainText);
      if (parsed.length > 1 || /^\s*[-*]\s+\[(x| )\]/im.test(plainText)) {
        entries = parsed;
      }
    }
    if (!entries.length) return;
    e.preventDefault();
    if (insertDailyTodoItems(entries)) {
      showToast(`Pasted ${entries.length} to do${entries.length === 1 ? "" : "s"}`);
    }
  });
  renderDailyTodoWidget();
  if (dailyTodoClockTimer) clearInterval(dailyTodoClockTimer);
  dailyTodoClockTimer = setInterval(renderDailyTodoWidget, 60000);
}

function getAvailableCategories() {
  return workspaceCategories
    .map((category) => category.label)
    .filter(Boolean);
}

function getFilteredSortedProjects() {
  let list = [...projects];
  const enabledCategories = workspaceCategories
    .filter((category) => category.enabled)
    .map((category) => category.label);
  if (enabledCategories.length !== workspaceCategories.length) {
    list = list.filter((p) =>
      enabledCategories.includes(
        categoryFromColor(p.color || getDefaultCategoryColor()),
      ),
    );
  }
  list = list.filter(
    (p) => !isCategoryHiddenByObject(getProjectCategoryId(p)),
  );
  list.sort((a, b) => {
    if (workspaceSort === "created-asc")
      return (a.created || 0) - (b.created || 0);
    if (workspaceSort === "title-asc")
      return String(a.name || "").localeCompare(String(b.name || ""));
    if (workspaceSort === "title-desc")
      return String(b.name || "").localeCompare(String(a.name || ""));
    return (b.created || 0) - (a.created || 0);
  });
  return list;
}

function updatePathStatus() {
  const status = document.getElementById("dashboard-path-status");
  if (!status) return;
  const parts = [];
  const hiddenCategories = workspaceCategories
    .filter((category) => !category.enabled)
    .map((category) => category.label);
  if (hiddenCategories.length)
    parts.push(`Hidden: ${hiddenCategories.join(", ")}`);
  if (workspaceSort !== "created-desc") {
    const sortLabels = {
      "created-asc": "Oldest First",
      "title-asc": "Title A-Z",
      "title-desc": "Title Z-A",
    };
    parts.push(`Sort: ${sortLabels[workspaceSort] || "Newest First"}`);
  }
  status.textContent = parts.join(" | ");
  status.classList.toggle("visible", parts.length > 0);
}

function renderWorkspaceMenu() {
  const mapEl = document.getElementById("workspace-category-map");
  const uiEl = document.getElementById("workspace-ui-toggles");
  const sortEl = document.getElementById("workspace-sort-select");
  if (!mapEl || !uiEl || !sortEl) return;
  mapEl.innerHTML =
    `<div class="workspace-category-list">` +
    workspaceCategories
      .map(
        (
          category,
        ) => `<div class="workspace-category-row${editingCategoryLabelId === category.id ? " label-editing" : ""}${activeCategoryColorEditorId === category.id ? " color-editing" : ""}" data-category-id="${category.id}">
          <div class="workspace-row-main">
            <div class="workspace-category-meta">
              <button class="workspace-check${category.enabled ? " is-on" : ""}" type="button" data-action="toggle-filter" data-category-id="${category.id}">${category.enabled ? "✓" : ""}</button>
              <button class="workspace-color-preview" type="button" data-action="edit-color" data-category-id="${category.id}" style="background:${category.color}"></button>
              <span class="workspace-category-title${category.enabled ? "" : " is-muted"}" data-action="edit-label" data-category-id="${category.id}">${esc(category.label)}</span>
              <input class="workspace-input workspace-inline-input" data-field="label" data-category-id="${category.id}" value="${esc(category.label)}" />
            </div>
            <button class="workspace-icon-btn danger" type="button" data-action="delete-category" data-category-id="${category.id}" aria-label="Delete category">✕</button>
          </div>
          <div class="workspace-category-editor">
            <input class="workspace-input workspace-color-input" data-field="color" data-category-id="${category.id}" value="${esc(category.color)}" />
            <input type="color" data-field="color-wheel" data-category-id="${category.id}" value="${esc(category.color)}" />
          </div>
          </div>
        </div>`,
      )
      .join("") +
    `</div><button class="workspace-add-btn" type="button" id="workspace-add-category">+ Add Category</button>`;
  uiEl.innerHTML = `<div class="workspace-toggle-list">
    <button class="workspace-toggle-btn${workspaceUIPrefs.showZoomControls ? " is-on" : ""}" type="button" data-ui-toggle="showZoomControls"><span>Zoom Controls</span><span>${workspaceUIPrefs.showZoomControls ? "On" : "Off"}</span></button>
    <button class="workspace-toggle-btn${workspaceUIPrefs.showMinimap ? " is-on" : ""}" type="button" data-ui-toggle="showMinimap"><span>Minimap</span><span>${workspaceUIPrefs.showMinimap ? "On" : "Off"}</span></button>
  </div>`;
  sortEl.value = workspaceSort;
  mapEl.querySelectorAll("[data-action='toggle-filter']").forEach((btn) =>
    btn.addEventListener("click", () => {
      const category = workspaceCategories.find(
        (item) => item.id === btn.dataset.categoryId,
      );
      if (!category) return;
      category.enabled = !category.enabled;
      saveWorkspacePrefs();
      updatePathStatus();
      renderWorkspaceMenu();
      renderDashboard();
    }),
  );
  mapEl.querySelectorAll("[data-action='edit-label']").forEach((label) =>
    label.addEventListener("dblclick", () => {
      editingCategoryLabelId = label.dataset.categoryId;
      activeCategoryColorEditorId = null;
      renderWorkspaceMenu();
      const input = mapEl.querySelector(
        `[data-field='label'][data-category-id='${editingCategoryLabelId}']`,
      );
      input?.focus();
      input?.select();
    }),
  );
  mapEl.querySelectorAll("[data-field='label']").forEach((input) => {
    const commit = () => {
      const category = workspaceCategories.find(
        (item) => item.id === input.dataset.categoryId,
      );
      if (!category) return;
      category.label = input.value.trim() || category.label || "Category";
      overviewItems.forEach((item) => {
        if (item.type === "category" && item.categoryId === category.id) {
          item.categoryLabel = category.label;
        }
      });
      editingCategoryLabelId = null;
      syncProjectCategories();
      saveWorkspacePrefs();
      updatePathStatus();
      renderWorkspaceMenu();
      renderDashboard();
    };
    input.addEventListener("blur", commit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") commit();
      if (e.key === "Escape") {
        editingCategoryLabelId = null;
        renderWorkspaceMenu();
      }
    });
  });
  mapEl.querySelectorAll("[data-action='edit-color']").forEach((btn) =>
    btn.addEventListener("click", () => {
      activeCategoryColorEditorId =
        activeCategoryColorEditorId === btn.dataset.categoryId
          ? null
          : btn.dataset.categoryId;
      editingCategoryLabelId = null;
      renderWorkspaceMenu();
    }),
  );
  const updateCategoryColor = (categoryId, rawValue) => {
    const category = workspaceCategories.find(
      (item) => item.id === categoryId,
    );
    if (!category) return;
    const previousColor = category.color;
    category.color = sanitizeCategoryColor(rawValue, previousColor);
    projects.forEach((project) => {
      if (
        (project.color || "").toLowerCase() ===
        previousColor.toLowerCase()
      ) {
        project.color = category.color;
      }
    });
    overviewItems.forEach((item) => {
      if (item.type === "category" && item.categoryId === category.id) {
        item.categoryColor = category.color;
      }
    });
    selectedColor =
      selectedColor.toLowerCase() === previousColor.toLowerCase()
        ? category.color
        : selectedColor;
    syncProjectCategories();
    saveWorkspacePrefs();
    initColorSwatches();
    renderWorkspaceMenu();
    renderDashboard();
  };
  mapEl
    .querySelectorAll("[data-field='color']")
    .forEach((input) =>
      input.addEventListener("change", () =>
        updateCategoryColor(input.dataset.categoryId, input.value),
      ),
    );
  mapEl
    .querySelectorAll("[data-field='color-wheel']")
    .forEach((input) =>
      input.addEventListener("input", () =>
        updateCategoryColor(input.dataset.categoryId, input.value),
      ),
    );
  mapEl
    .querySelectorAll("[data-action='delete-category']")
    .forEach((btn) =>
      btn.addEventListener("click", () => {
        const categoryId = btn.dataset.categoryId;
        const category = workspaceCategories.find(
          (item) => item.id === categoryId,
        );
        if (!category || workspaceCategories.length <= 1) return;
        openConfirmDialog({
          title: "Delete Category",
          message:
            "Delete this category? Cards using it will move to the first available category.",
          confirmLabel: "Delete",
          onConfirm: () => {
            workspaceCategories = workspaceCategories.filter(
              (item) => item.id !== categoryId,
            );
            const fallbackCategoryId = workspaceCategories[0]?.id || null;
            const fallbackColor = getDefaultCategoryColor();
            projects.forEach((project) => {
              if (
                (project.color || "").toLowerCase() ===
                category.color.toLowerCase()
              ) {
                project.color = fallbackColor;
              }
            });
            overviewItems.forEach((item) => {
              if (item.type === "category" && item.categoryId === categoryId) {
                setOverviewItemCategory(item, fallbackCategoryId);
              }
            });
            selectedColor =
              selectedColor.toLowerCase() === category.color.toLowerCase()
                ? fallbackColor
                : selectedColor;
            activeCategoryColorEditorId = null;
            editingCategoryLabelId = null;
            syncProjectCategories();
            saveWorkspacePrefs();
            initColorSwatches();
            updatePathStatus();
            renderWorkspaceMenu();
            renderDashboard();
          },
        });
      }),
    );
  document
    .getElementById("workspace-add-category")
    ?.addEventListener("click", () => {
      const baseColor = "#7fb3ff";
      let color = baseColor;
      let step = 1;
      while (
        workspaceCategories.some(
          (category) =>
            category.color.toLowerCase() === color.toLowerCase(),
        )
      ) {
        const channel = Math.max(64, 179 - step * 12)
          .toString(16)
          .padStart(2, "0");
        color = `#7f${channel}ff`;
        step += 1;
      }
      workspaceCategories.push({
        id: makeCategoryId(),
        color,
        label: `Category ${workspaceCategories.length + 1}`,
        enabled: true,
      });
      if (!selectedCategoryId)
        selectedCategoryId =
          workspaceCategories[workspaceCategories.length - 1]?.id || null;
      activeCategoryColorEditorId = null;
      editingCategoryLabelId = null;
      saveWorkspacePrefs();
      initColorSwatches();
      renderWorkspaceMenu();
      renderDashboard();
    });
  uiEl.querySelectorAll("[data-ui-toggle]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const key = btn.dataset.uiToggle;
      workspaceUIPrefs[key] = !workspaceUIPrefs[key];
      saveWorkspacePrefs();
      applyWorkspaceUIPrefs();
      renderWorkspaceMenu();
    }),
  );
  sortEl.onchange = () => {
    workspaceSort = sortEl.value;
    saveWorkspacePrefs();
    updatePathStatus();
    renderDashboard();
  };
}

function normalizeNodeDataList(nodeList) {
  return (nodeList || []).map((node) => {
    node.type = canonicalObjectType(node.type);
    if (node.type === "image") {
      node.type = "file";
      node.name = node.name || "Image";
      node.ext = node.ext || "IMG";
      node.size = node.size || "";
      node.mime = node.mime || "";
      node.fileKind = "image";
    }
    if (node.type === "doc") {
      node.type = "file";
      node.name = node.name || "Document";
      node.ext = node.ext || "DOC";
      node.size = node.size || "";
      node.src = node.src || null;
      node.mime = node.mime || "";
      node.fileKind = "file";
    }
    if (node.type === "bullet") {
      node.items = (node.items || []).map((item) =>
        typeof item === "string" ? { text: item, done: false } : item,
      );
      node.bulletFeatures = {
        checklist: !!node?.bulletFeatures?.checklist,
        connectors: !!node?.bulletFeatures?.connectors,
      };
    }
    if (node.type === "file") {
      node.name = node.name || "File";
      node.ext = node.ext || "FILE";
      node.size = node.size || "";
      node.src = node.src || null;
      node.assetId = node.assetId || "";
      node.mime = node.mime || "";
      node.fileKind =
        node.fileKind || (node.src ? "image" : "file");
      node.uploading = false;
    }
    if (node.type === "line") {
      node.w = Math.max(LINE_MIN_LENGTH, Number(node.w) || 220);
      node.h = LINE_NODE_HEIGHT;
      node.lineAngle = Number.isFinite(node.lineAngle)
        ? node.lineAngle
        : 0;
    }
    if (node.type === "heading") {
      delete node.w;
      delete node.h;
    }
    if (typeof node.customTitle !== "string") node.customTitle = "";
    return node;
  });
}

function cycleProjectStatus(p) {
  const idx = PROJECT_STATUSES.indexOf(p.status || "In Progress");
  p.status = PROJECT_STATUSES[(idx + 1) % PROJECT_STATUSES.length];
  queueProjectSave(p);
  renderDashboard();
}

function closeStatusMenus() {
  document
    .querySelectorAll(".card-status-menu.open")
    .forEach((menu) => menu.classList.remove("open"));
  document
    .querySelectorAll(".card-status.open")
    .forEach((btn) => btn.classList.remove("open"));
}

function isImageFile(file) {
  return !!file && String(file.type || "").startsWith("image/");
}

function chooseCompressedImageType(file, image) {
  const originalType = String(file?.type || "").toLowerCase();
  if (originalType === "image/gif" || originalType === "image/svg+xml") {
    return originalType;
  }
  try {
    const probeCanvas = document.createElement("canvas");
    probeCanvas.width = Math.min(32, image.naturalWidth || 1);
    probeCanvas.height = Math.min(32, image.naturalHeight || 1);
    const probeCtx = probeCanvas.getContext("2d", { willReadFrequently: true });
    if (probeCtx) {
      probeCtx.drawImage(image, 0, 0, probeCanvas.width, probeCanvas.height);
      const data = probeCtx.getImageData(
        0,
        0,
        probeCanvas.width,
        probeCanvas.height,
      ).data;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] < 250) return "image/webp";
      }
    }
  } catch {}
  return "image/jpeg";
}

function readImageDimensions(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Could not read image."));
      image.src = ev.target?.result;
    };
    reader.onerror = () => reject(new Error("Could not load file."));
    reader.readAsDataURL(file);
  });
}

function readBlobAsDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not encode image."));
    reader.readAsDataURL(blob);
  });
}

async function compressImageForUpload(file) {
  if (!isImageFile(file)) {
    return {
      blob: file,
      mimeType: file.type || "application/octet-stream",
      width: 0,
      height: 0,
    };
  }
  const image = await readImageDimensions(file);
  const originalType = String(file.type || "").toLowerCase();
  if (originalType === "image/gif" || originalType === "image/svg+xml") {
    return {
      blob: file,
      mimeType: file.type || "application/octet-stream",
      width: image.naturalWidth || 0,
      height: image.naturalHeight || 0,
    };
  }
  const mimeType = chooseCompressedImageType(file, image);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Image compression is not available.");
  const maxBytes = 220 * 1024;
  const attempts = [
    { maxDimension: 1280, quality: 0.78 },
    { maxDimension: 1100, quality: 0.72 },
    { maxDimension: 960, quality: 0.68 },
    { maxDimension: 820, quality: 0.62 },
    { maxDimension: 720, quality: 0.58 },
    { maxDimension: 640, quality: 0.54 },
  ];
  let best = null;
  for (const attempt of attempts) {
    const scale = Math.min(
      1,
      attempt.maxDimension / Math.max(1, image.naturalWidth),
      attempt.maxDimension / Math.max(1, image.naturalHeight),
    );
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.width = width;
    canvas.height = height;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);
    const quality =
      mimeType === "image/jpeg" || mimeType === "image/webp"
        ? attempt.quality
        : undefined;
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (result) => {
          if (result) resolve(result);
          else reject(new Error("Image compression failed."));
        },
        mimeType,
        quality,
      );
    });
    best = { blob, mimeType, width, height };
    if (blob.size <= maxBytes) break;
  }
  return best;
}

async function populateFileNodeFromFile(nd, file, onDone = null) {
  if (!nd || nd.type !== "file" || !file) {
    if (onDone) onDone();
    return;
  }
  nd.name = file.name || nd.name || "File";
  nd.ext =
    (file.name?.split(".").pop() || (isImageFile(file) ? "IMG" : "FILE"))
      .toUpperCase()
      .slice(0, 4);
  nd.size = fmtBytes(file.size || 0);
  nd.mime = file.type || "";
  nd.fileKind = isImageFile(file) ? "image" : "file";
  nd.manualImageSize = false;
  if (nd.fileKind === "image") {
    nd.uploading = true;
    nd.src = null;
    nd.size = "Compressing image...";
    renderAll();
    selectNode(nd.id);
    try {
      const compressed = await compressImageForUpload(file);
      const src = await readBlobAsDataURL(compressed.blob);
      const assetSize = fmtBytes(compressed.blob.size || 0);
      const assetId = await saveImageAsset(currentProject.id, nd.id, {
        src,
        mime: compressed.mimeType,
        size: assetSize,
      });
      const maxWidth = 420;
      const maxHeight = 320;
      const minWidth = 140;
      const scale = Math.min(
        1,
        maxWidth / Math.max(1, compressed.width),
        maxHeight / Math.max(1, compressed.height),
      );
      nd.src = src;
      nd.assetId = assetId;
      nd.size = assetSize;
      nd.mime = compressed.mimeType;
      nd.w = Math.max(minWidth, Math.round(compressed.width * scale));
      nd.h = Math.max(90, Math.round(compressed.height * scale));
      nd.uploading = false;
      renderAll();
      selectNode(nd.id);
      autosave();
    } catch (error) {
      nd.uploading = false;
      nd.src = null;
      nd.assetId = "";
      nd.fileKind = "file";
      nd.size = "Upload failed";
      renderAll();
      showToast(`Image upload failed: ${error.message}`);
    }
    if (onDone) onDone();
    return;
  }
  nd.src = null;
  nd.assetId = "";
  renderAll();
  selectNode(nd.id);
  autosave();
  if (onDone) onDone();
}

function getFileNodeLinkHref(nd) {
  if (nd?.type !== "file") return "";
  return String(nd.src || "").trim();
}

function getFileNodeLinkLabel(nd) {
  const href = getFileNodeLinkHref(nd);
  if (/^https?:\/\//i.test(href)) return href;
  if (nd?.name) return nd.name;
  if (href) return href;
  return "File";
}

function insertPlainTextAtSelection(text) {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount) return;
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const normalized = String(text || "").replace(/\r\n?/g, "\n");
  const fragment = document.createDocumentFragment();
  normalized.split("\n").forEach((part, index, parts) => {
    fragment.appendChild(document.createTextNode(part));
    if (index < parts.length - 1) {
      fragment.appendChild(document.createElement("br"));
    }
  });
  const lastNode = fragment.lastChild;
  range.insertNode(fragment);
  selection.removeAllRanges();
  const nextRange = document.createRange();
  if (lastNode) {
    nextRange.setStartAfter(lastNode);
  } else {
    nextRange.setStart(range.endContainer, range.endOffset);
  }
  nextRange.collapse(true);
  selection.addRange(nextRange);
}

function bindPlainTextPaste(target) {
  if (!target || target.dataset.plainPasteBound) return;
  target.dataset.plainPasteBound = "1";
  target.addEventListener("paste", (e) => {
    const text = e.clipboardData?.getData("text/plain");
    if (typeof text !== "string") return;
    e.preventDefault();
    insertPlainTextAtSelection(text);
    target.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function getEditablePlainText(target) {
  if (!target) return "";
  const lines = [];
  const walk = (node) => {
    if (!node) return;
    if (node.nodeType === Node.TEXT_NODE) {
      lines.push(node.nodeValue || "");
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = node.tagName;
    if (tag === "BR") {
      lines.push("\n");
      return;
    }
    const isBlockLike =
      tag === "DIV" ||
      tag === "P" ||
      tag === "LI" ||
      tag === "UL" ||
      tag === "OL";
    if (isBlockLike && lines.length && lines[lines.length - 1] !== "\n") {
      lines.push("\n");
    }
    [...node.childNodes].forEach(walk);
    if (isBlockLike && lines[lines.length - 1] !== "\n") {
      lines.push("\n");
    }
  };
  [...target.childNodes].forEach(walk);
  return lines
    .join("")
    .replace(/\u00a0/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+|\n+$/g, "");
}

const RTL_TEXT_REGEX = /[\u0590-\u08FF\uFB1D-\uFDFD\uFE70-\uFEFC]/;

function isEditableTextTarget(target) {
  return (
    target instanceof HTMLElement &&
    (target.matches("input, textarea, [contenteditable='true']") ||
      target.id === "canvas-project-title")
  );
}

function shouldSkipDirectionFormatting(target) {
  return target?.id === "firebase-config-input";
}

function isMultilineTextTarget(target) {
  return (
    target instanceof HTMLElement &&
    (target.tagName === "TEXTAREA" ||
      target.classList.contains("node-content") ||
      target.classList.contains("content") ||
      target.classList.contains("daily-todo-text") ||
      target.classList.contains("general-todo-text") ||
      target.classList.contains("bullet-item-text") ||
      target.id === "proj-desc-input")
  );
}

function readEditableTextValue(target) {
  if (!target) return "";
  if (target.isContentEditable) {
    return getEditablePlainText(target);
  }
  if ("value" in target) return String(target.value || "");
  return String(target.textContent || "");
}

function isActiveEditableElement(target) {
  return !!(
    target &&
    (target.isContentEditable ||
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA")
  );
}

function applyTextDirection(target) {
  if (!isEditableTextTarget(target) || shouldSkipDirectionFormatting(target)) {
    return;
  }
  const text = readEditableTextValue(target);
  const isRTL = RTL_TEXT_REGEX.test(text);
  target.setAttribute("dir", isRTL ? "rtl" : "ltr");
  target.style.unicodeBidi = "plaintext";
  target.style.textAlign = isRTL
    ? isMultilineTextTarget(target)
      ? "justify"
      : "right"
    : "left";
}

function applyTextDirectionToAll(root = document) {
  if (isEditableTextTarget(root)) applyTextDirection(root);
  root
    ?.querySelectorAll?.("input, textarea, [contenteditable='true'], #canvas-project-title")
    ?.forEach((el) => applyTextDirection(el));
}

function renderMultilineTextHTML(text = "") {
  return esc(String(text || "")).replace(/\n/g, "<br>");
}

function renderSharedTextObjectHTML(
  type,
  text,
  className = "content",
  { readOnly = false } = {},
) {
  const editable = readOnly ? "false" : "true";
  const extraClass = type === "heading" ? " shared-heading-text" : "";
  return `<div class="${className}${extraClass}" contenteditable="${editable}" spellcheck="false">${renderMultilineTextHTML(text || "")}</div>`;
}

function renderSharedTextNoteShellHTML({
  type = "text",
  text = "",
  label = "Note",
  accent = "#333",
  contentClassName = "content node-content",
  actionsHTML = "",
  settingsHTML = "",
  readOnly = false,
} = {}) {
  const labelEditable = readOnly ? "false" : "true";
  return `
    <div class="node-accent-line" style="background:${accent}"></div>
    <div class="node-header">
<span class="node-type-label" contenteditable="${labelEditable}" spellcheck="false">${esc(label)}</span>
<div class="node-actions">${actionsHTML}</div>
    </div>
    <div class="node-body">${renderSharedTextObjectHTML(type, text, contentClassName, { readOnly })}</div>${settingsHTML}`;
}

function focusSharedNoteEditor(el) {
  const content = el?.querySelector(".content") || el?.querySelector(".node-content");
  if (!content) return;
  content.focus();
  saAll(content);
}

function toggleSharedNoteSettings(el) {
  document
    .querySelectorAll(".node-settings.open")
    .forEach((panel) => {
      if (panel !== el.querySelector(".node-settings")) {
        panel.classList.remove("open");
      }
    });
  el.querySelector(".node-settings")?.classList.toggle("open");
}

/**
 * @param {"default"|"deferHeading"} [opts.contentEditableDragMode]
 *   deferHeading: editable label/body use move-threshold then onPointerDown (heading shells).
 * @param {(e: MouseEvent) => boolean} [opts.beforeDeferHeadingDrag] return true to stop (no defer)
 */
function bindUnifiedNoteObjectBehavior({
  el,
  type,
  onCommit,
  onLabelCommit,
  onPointerDown,
  onResizeStart,
  contentEditableDragMode = "default",
  beforeDeferHeadingDrag = null,
}) {
  if (!el) return;
  const content = el.querySelector(".content") || el.querySelector(".node-content");
  const label = el.querySelector(".node-type-label");
  bindSharedTextObjectEditor(content, type, onCommit);
  if (label && !label.dataset.sharedLabelBound) {
    label.dataset.sharedLabelBound = "1";
    bindPlainTextPaste(label);
    applyTextDirection(label);
    label.addEventListener("input", () => {
      applyTextDirection(label);
      onLabelCommit?.(label.textContent.trim());
    });
    label.addEventListener("blur", () => {
      applyTextDirection(label);
      onLabelCommit?.(label.textContent.trim());
    });
  }
  el.querySelector(".node-settings-btn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleSharedNoteSettings(el);
  });
  el.querySelectorAll(".node-resize-handle").forEach((h) =>
    h.addEventListener("mousedown", (e) => {
      e.stopPropagation();
      e.preventDefault();
      onResizeStart(e, h.dataset.dir);
    }),
  );
  el.addEventListener("mousedown", (e) => {
    if (
      e.target.classList.contains("conn-handle") ||
      e.target.classList.contains("node-act-btn") ||
      e.target.classList.contains("node-resize-handle") ||
      e.target.closest(".node-settings") ||
      e.target.closest(".pres-spatial-handle") ||
      e.target.closest(".overview-resize-handle")
    )
      return;
    if (
      e.target.tagName === "INPUT" ||
      e.target.tagName === "TEXTAREA" ||
      e.target.tagName === "A"
    )
      return;
    if (e.target.isContentEditable && !e.altKey) {
      if (contentEditableDragMode === "deferHeading") {
        if (typeof beforeDeferHeadingDrag === "function" && beforeDeferHeadingDrag(e))
          return;
        beginHeadingTextDragOrEdit(e, (ev) => onPointerDown(ev));
        return;
      }
      return;
    }
    onPointerDown(e);
  });
  el.addEventListener("dblclick", (e) => {
    if (e.target.isContentEditable) return;
    e.stopPropagation();
    focusSharedNoteEditor(el);
  });
}

function bindSharedTextObjectEditor(target, type, onCommit) {
  if (!target || target.dataset.sharedObjectEditorBound) return;
  target.dataset.sharedObjectEditorBound = "1";
  bindPlainTextPaste(target);
  applyTextDirection(target);
  target.addEventListener("input", () => {
    applyTextDirection(target);
    onCommit(getEditablePlainText(target));
  });
  target.addEventListener("blur", () => {
    applyTextDirection(target);
    onCommit(getEditablePlainText(target));
  });
}

/** Heading body is contenteditable: click edits; movement past threshold starts a drag. */
const HEADING_DRAG_THRESHOLD_PX = 6;
function beginHeadingTextDragOrEdit(downEvent, onDragStart) {
  if (downEvent.altKey) return false;
  const sx = downEvent.clientX;
  const sy = downEvent.clientY;
  let armed = true;
  const disarm = () => {
    if (!armed) return;
    armed = false;
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("pointermove", onMove);
  };
  const onMove = (ev) => {
    if (!armed) return;
    if (
      Math.hypot(ev.clientX - sx, ev.clientY - sy) < HEADING_DRAG_THRESHOLD_PX
    )
      return;
    disarm();
    document.activeElement?.blur?.();
    onDragStart(ev);
  };
  const onUp = () => {
    disarm();
  };
  window.addEventListener("mousemove", onMove);
  window.addEventListener("pointermove", onMove);
  window.addEventListener("mouseup", onUp, { once: true });
  window.addEventListener("pointerup", onUp, { once: true });
  window.addEventListener("pointercancel", onUp, { once: true });
  return true;
}

function dashboardOverviewItemDragFromPointer(item, el, e) {
  e.stopPropagation();
  setOverviewSelection(
    { type: "item", id: item.id },
    e.shiftKey || selectedOverviewItemIds.has(item.id),
  );
  if (e.altKey && duplicateDashboardSelectionForDrag(e)) return;
  overviewDragItemId = item.id;
  const dcrect = document
    .getElementById("dashboard-canvas")
    .getBoundingClientRect();
  overviewDragOffset = {
    x:
      (e.clientX - dcrect.left - dashboardViewOffset.x) / dashboardScale -
      item.x,
    y:
      (e.clientY - dcrect.top - dashboardViewOffset.y) / dashboardScale -
      item.y,
  };
  if (
    selectedOverviewItemIds.has(item.id) &&
    selectedProjectIds.size + selectedOverviewItemIds.size > 1
  ) {
    beginDashboardGroupDrag(e);
  }
}

/** Canvas: shared drag / multi-select for unified notes + heading (same node chrome). */
function canvasNodeDragFromPointer(nd, el, e) {
  if (currentTool === "connect") return;
  e.stopPropagation();
  if (e.altKey) {
    selectNode(nd.id, e.shiftKey || selectedNodeIds.has(nd.id));
    if (duplicateCanvasSelectionForDrag()) {
      isDragging = false;
      nodeGroupDragIds = [...selectedNodeIds]
        .map((id) => {
          const node = nodes.find((n) => n.id === id);
          return node
            ? { id: node.id, startX: node.x, startY: node.y }
            : null;
        })
        .filter(Boolean);
      const wp = s2w(e.clientX, e.clientY);
      nodeGroupDragStart = { x: wp.x, y: wp.y };
      return;
    }
  }
  selectNode(nd.id, e.shiftKey || selectedNodeIds.has(nd.id));
  isDragging = true;
  if (selectedNodeIds.has(nd.id) && selectedNodeIds.size > 1) {
    isDragging = false;
    nodeGroupDragIds = [...selectedNodeIds]
      .map((id) => {
        const node = nodes.find((n) => n.id === id);
        return node
          ? { id: node.id, startX: node.x, startY: node.y }
          : null;
      })
      .filter(Boolean);
    const wp = s2w(e.clientX, e.clientY);
    nodeGroupDragStart = { x: wp.x, y: wp.y };
    return;
  }
  const wp = s2w(e.clientX, e.clientY);
  dragOffset = { x: wp.x - nd.x, y: wp.y - nd.y };
}

function syncImageFileNodeSize(nd, el) {
  if (
    !nd ||
    nd.type !== "file" ||
    nd.fileKind !== "image" ||
    !nd.src ||
    nd.manualImageSize
  )
    return;
  const img = el?.querySelector(".img-wrap img");
  if (!img) return;
  const applySize = () => {
    if (!img.naturalWidth || !img.naturalHeight) return;
    const maxWidth = 420;
    const maxHeight = 320;
    const minWidth = 140;
    const scale = Math.min(
      1,
      maxWidth / Math.max(1, img.naturalWidth),
      maxHeight / Math.max(1, img.naturalHeight),
    );
    const width = Math.max(minWidth, Math.round(img.naturalWidth * scale));
    const height = Math.max(90, Math.round(img.naturalHeight * scale));
    if (nd.w === width && nd.h === height) return;
    nd.w = width;
    nd.h = height;
    el.style.width = nd.w + "px";
    el.style.height = nd.h + "px";
  };
  if (img.complete) applySize();
  else img.addEventListener("load", applySize, { once: true });
}

function autosave() {
  if (!currentProject) return;
  currentProject.nodes = nodes;
  currentProject.connections = connections;
  const t = document.getElementById("canvas-project-title");
  if (t)
    currentProject.name = t.textContent.trim() || currentProject.name;
  captureHistory();
  setSaveStatus("saving");
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveToFirestore(currentProject), 1200);
}

function updateCanvasPathbar() {
  if (!currentProject) return;
  document.getElementById("canvas-path-category").textContent =
    categoryFromColor(currentProject.color || "#44ff88");
  document.getElementById("canvas-path-current").textContent =
    currentProject.name || "Card";
}

function requestConnectionRender() {
  if (pendingConnRenderRAF) return;
  pendingConnRenderRAF = requestAnimationFrame(() => {
    pendingConnRenderRAF = null;
    renderConnections();
  });
}

function getPendingConnectionTarget(clientX, clientY) {
  const target = document.elementFromPoint(clientX, clientY);
  const handle = target?.closest?.(".conn-handle");
  const node = handle?.closest?.(".node") || target?.closest?.(".node");
  if (!node) return null;
  const nodeId = handle?.dataset.node || node.id?.replace("node-", "");
  if (!nodeId || nodeId === pendingConn?.nodeId) return null;
  return {
    nodeId,
    nodeEl: node,
    pos: handle?.dataset.pos || "left",
    bulletIndex:
      handle?.dataset.bulletIndex !== undefined
        ? Number(handle.dataset.bulletIndex)
        : null,
  };
}

function syncPendingConnectionTarget(clientX, clientY) {
  const nextTarget = getPendingConnectionTarget(clientX, clientY);
  if (pendingConnTarget?.nodeEl !== nextTarget?.nodeEl) {
    if (pendingConnTarget?.nodeEl)
      pendingConnTarget.nodeEl.classList.remove("connect-target");
    if (nextTarget?.nodeEl)
      nextTarget.nodeEl.classList.add("connect-target");
  }
  pendingConnTarget = nextTarget;
}

function clearPendingConnection() {
  if (pendingConnTarget?.nodeEl)
    pendingConnTarget.nodeEl.classList.remove("connect-target");
  pendingConn = null;
  pendingConnCursor = null;
  pendingConnTarget = null;
  setTool("select");
  requestConnectionRender();
}

async function seedDefaultProject() {
  const p = buildProject(
    "Welcome to BEV",
    "Your personal Bird Eye View workspace.",
  );
  p.color = "#44ff88";
  p.nodes = [
    makeNode("heading", 240, 80, { text: "BEV Mind Map" }),
    makeNode("note", 80, 220, {
      text: "Double-click any node to edit. Drag to move.",
    }),
    makeNode("bullet", 400, 200, {
      items: [
        "Add text, notes, images",
        "Draw connections between nodes",
        "Track progress",
        "Organise your thoughts",
      ],
    }),
    makeNode("progress", 80, 380, {
      title: "Getting Started",
      value: 30,
      steps: [
        { label: "Create a project", done: true },
        { label: "Add your first node", done: false },
        { label: "Connect two nodes", done: false },
      ],
    }),
  ];
  p.connections = [
    { id: "c1", fromId: p.nodes[0].id, toId: p.nodes[1].id },
    { id: "c2", fromId: p.nodes[0].id, toId: p.nodes[2].id },
    { id: "c3", fromId: p.nodes[0].id, toId: p.nodes[3].id },
  ];
  projects.push(p);
  await saveToFirestore(p);
}

// ===================== DASHBOARD =====================
function renderDashboard() {
  const world = document.getElementById("projects-world");
  if (!world) return;
  world.innerHTML = "";
  normalizeProjectLayout();
  const visibleProjects = getFilteredSortedProjects();
  const visibleProjectIds = new Set(visibleProjects.map((project) => project.id));
  selectedProjectIds = new Set(
    [...selectedProjectIds].filter((id) => visibleProjectIds.has(id)),
  );
  updateDashboardInfo();
  updatePathStatus();
  renderWorkspaceMenu();
  applyDashboardTransform();
  overviewItems.forEach((item) => {
    const el = createOverviewItemEl(item);
    world.appendChild(el);
    enforceOverviewItemMinSize(item, el);
  });
  visibleProjects.forEach((p) => {
    const nc = p.nodes ? p.nodes.length : 0,
      cc = p.connections ? p.connections.length : 0;
    const isExpanded = expandedProjectIds.has(p.id);
    const needsReadMore = (p.desc || "").trim().length > 72;
    const autoSize = getProjectAutoSize(p, isExpanded, needsReadMore);
    const cardWidth = Math.max(
      p.w || DEFAULT_PROJECT_CARD_WIDTH,
      autoSize.w,
    );
    const cardHeight = Math.max(
      p.h || DEFAULT_PROJECT_CARD_HEIGHT,
      autoSize.h,
    );
    const date = new Date(p.created).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const el = document.createElement("div");
    el.className = "project-card";
    if (isExpanded) el.classList.add("expanded");
    if (selectedProjectIds.has(p.id))
      el.classList.add(
        selectedProjectIds.size > 1 ? "multi-selected" : "selected",
      );
    el.style.setProperty("--card-accent", p.color || "#fff");
    el.style.left = (p.x || 0) + "px";
    el.style.top = (p.y || 0) + "px";
    el.style.width = cardWidth + "px";
    el.style.setProperty(
      "--card-width",
      `${cardWidth}px`,
    );
    el.style.height = isExpanded
      ? "auto"
      : cardHeight + "px";
    el.dataset.projectId = p.id;
    el.innerHTML = `
<button class="card-del" title="Delete">✕</button>
<button class="card-edit" title="Edit">⋯</button>
<div class="card-meta"><span class="card-date">${date}</span></div>
<div class="card-title">${esc(p.name)}</div>
<div class="card-desc">${esc(p.desc || "")}</div>
${needsReadMore ? `<button class="card-readmore" type="button">${isExpanded ? "Show less" : "Read more"}</button>` : ""}
<div class="card-bottom">
  <div class="card-bottom-meta">
    <div class="card-status-wrap">
      <button class="card-status" type="button" data-status="${statusSlug(p.status)}">${esc(p.status || "In Progress")}</button>
      <div class="card-status-menu">
        ${PROJECT_STATUSES.map((status) => `<button class="card-status-option${status === (p.status || "In Progress") ? " active" : ""}" type="button" data-value="${esc(status)}" data-status="${statusSlug(status)}"><span class="card-status-dot" style="--status-color:${status === "Done" ? "var(--green)" : status === "On Going" ? "var(--blue)" : status === "In Progress" ? "var(--yellow)" : status === "Cancelled" ? "var(--red)" : status === "Postponed" ? "var(--purple)" : "var(--blue)"}"></span>${esc(status)}</button>`).join("")}
      </div>
    </div>
    <div class="card-stats"><div class="card-stat"><span>${nc}</span> nodes</div><div class="card-stat"><span>${cc}</span> links</div></div>
  </div>
  <button class="card-open" type="button" aria-label="Open card">→</button>
</div>
<div class="card-resize-handle resize-tl" data-dir="tl"></div>
<div class="card-resize-handle resize-tr" data-dir="tr"></div>
<div class="card-resize-handle resize-bl" data-dir="bl"></div>
<div class="card-resize-handle resize-br" data-dir="br"></div>`;
    el.addEventListener("mousedown", (e) =>
      setOverviewSelection(
        { type: "project", id: p.id },
        e.shiftKey || selectedProjectIds.has(p.id),
      ),
    );
    el.querySelector(".card-del").addEventListener("click", (e) => {
      e.stopPropagation();
      openConfirmDialog({
        title: "Delete Card",
        message: `Delete "${p.name}"?`,
        confirmLabel: "Delete",
        onConfirm: () => {
          projects = projects.filter((x) => x.id !== p.id);
          deleteFromFirestore(p.id);
          renderDashboard();
          renderPresentationScreen();
          showToast("Deleted");
        },
      });
    });
    el.querySelector(".card-edit").addEventListener("click", (e) => {
      e.stopPropagation();
      openEditProjectModal(p.id);
    });
    el.querySelector(".card-readmore")?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (expandedProjectIds.has(p.id)) expandedProjectIds.delete(p.id);
      else expandedProjectIds.add(p.id);
      renderDashboard();
    });
    el.addEventListener("mousedown", (e) => startProjectDrag(e, p, el));
    const statusBtn = el.querySelector(".card-status");
    const statusMenu = el.querySelector(".card-status-menu");
    statusBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      document
        .querySelectorAll(".card-status-menu.open")
        .forEach((menu) => {
          if (menu !== statusMenu) menu.classList.remove("open");
        });
      document.querySelectorAll(".card-status.open").forEach((btn) => {
        if (btn !== statusBtn) btn.classList.remove("open");
      });
      statusBtn.classList.toggle("open");
      statusMenu.classList.toggle("open");
    });
    statusMenu.querySelectorAll(".card-status-option").forEach((option) =>
      option.addEventListener("click", (e) => {
        e.stopPropagation();
        p.status = option.dataset.value;
        statusBtn.textContent = p.status;
        statusBtn.dataset.status = statusSlug(p.status);
        statusBtn.classList.remove("open");
        statusMenu.classList.remove("open");
        statusMenu
          .querySelectorAll(".card-status-option")
          .forEach((item) =>
            item.classList.toggle("active", item === option),
          );
        option.classList.add("active");
        queueProjectSave(p);
      }),
    );
    el.querySelector(".card-status-menu").addEventListener("click", (e) =>
      e.stopPropagation(),
    );
    el.querySelector(".card-status").addEventListener("blur", () => {
      statusBtn.classList.remove("open");
      statusMenu.classList.remove("open");
    });
    el.querySelector(".card-open").addEventListener("click", (e) => {
      e.stopPropagation();
      if (dashboardDragMoved) {
        e.preventDefault();
        return;
      }
      openProject(p.id);
    });
    el.querySelectorAll(".card-resize-handle").forEach((h) =>
      h.addEventListener("mousedown", (e) =>
        startProjectResize(e, p, el, h.dataset.dir),
      ),
    );
    el.addEventListener("dblclick", (e) => {
      if (
        e.target.closest(".card-del") ||
        e.target.closest(".card-open") ||
        e.target.closest(".card-status") ||
        e.target.closest(".card-resize-handle") ||
        e.target.closest(".card-edit")
      )
        return;
      openProject(p.id);
    });
    world.appendChild(el);
  });
}

function getProjectAutoSize(
  project,
  isExpanded = false,
  needsReadMore = false,
) {
  const title = String(project?.name || "Untitled");
  const desc = String(project?.desc || "").trim();
  const titleWidth = 190 + Math.min(title.length, 28) * 8;
  const descWidth = desc ? 170 + Math.min(desc.length, 42) * 4 : 0;
  const width = Math.max(
    DEFAULT_PROJECT_CARD_WIDTH,
    Math.min(520, Math.max(titleWidth, descWidth)),
  );
  const titleCharsPerLine = Math.max(8, Math.floor((width - 48) / 11));
  const descCharsPerLine = Math.max(14, Math.floor((width - 72) / 7));
  const titleLines = Math.max(1, Math.ceil(title.length / titleCharsPerLine));
  const descVisibleLength = isExpanded
    ? desc.length
    : Math.min(desc.length, descCharsPerLine * 2);
  const descLines = desc
    ? Math.max(1, Math.ceil(descVisibleLength / descCharsPerLine))
    : 0;
  const height = Math.max(
    DEFAULT_PROJECT_CARD_HEIGHT,
    152 +
      Math.max(0, titleLines - 1) * 34 +
      descLines * 15 +
      (needsReadMore ? 18 : 0),
  );
  return {
    w: Math.round(width),
    h: Math.round(height),
  };
}

function getProjectMinSize(project) {
  return getProjectAutoSize(
    project,
    expandedProjectIds.has(project.id),
    (project.desc || "").trim().length > 72,
  );
}

function getProjectSummaryStats(project) {
  return {
    nodeCount:
      typeof project?.nodeCount === "number"
        ? project.nodeCount
        : Array.isArray(project?.nodes)
          ? project.nodes.length
          : 0,
    connectionCount:
      typeof project?.connectionCount === "number"
        ? project.connectionCount
        : Array.isArray(project?.connections)
          ? project.connections.length
          : 0,
  };
}

function bindEditableProjectStatus({
  project,
  statusBtn,
  statusMenu,
  onChange = null,
}) {
  if (!project || !statusBtn || !statusMenu) return;
  statusBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    document.querySelectorAll(".card-status-menu.open").forEach((menu) => {
      if (menu !== statusMenu) menu.classList.remove("open");
    });
    document.querySelectorAll(".card-status.open").forEach((btn) => {
      if (btn !== statusBtn) btn.classList.remove("open");
    });
    statusBtn.classList.toggle("open");
    statusMenu.classList.toggle("open");
  });
  statusMenu.querySelectorAll(".card-status-option").forEach((option) =>
    option.addEventListener("click", (e) => {
      e.stopPropagation();
      project.status = option.dataset.value;
      statusBtn.textContent = project.status;
      statusBtn.dataset.status = statusSlug(project.status);
      statusBtn.classList.remove("open");
      statusMenu.classList.remove("open");
      statusMenu
        .querySelectorAll(".card-status-option")
        .forEach((item) => item.classList.toggle("active", item === option));
      queueProjectSave(project);
      if (typeof onChange === "function") onChange();
    }),
  );
}

function createPresentationProjectCardEl(
  item,
  project,
  { viewer = false } = {},
) {
  const { nodeCount, connectionCount } = getProjectSummaryStats(project);
  const autoSize = getProjectAutoSize(
    project,
    false,
    (project.desc || "").trim().length > 72,
  );
  const cardWidth = Math.max(project.w || DEFAULT_PROJECT_CARD_WIDTH, autoSize.w);
  const cardHeight = Math.max(
    project.h || DEFAULT_PROJECT_CARD_HEIGHT,
    autoSize.h,
  );
  const date = new Date(project.created || Date.now()).toLocaleDateString(
    "en-US",
    {
      month: "short",
      day: "numeric",
      year: "numeric",
    },
  );
  const el = document.createElement("div");
  el.className = `project-card presentation-card${viewer ? " viewer-card" : ""}`;
  el.style.setProperty("--card-accent", project.color || "#fff");
  el.style.left = `${item.x || 0}px`;
  el.style.top = `${item.y || 0}px`;
  el.style.width = `${cardWidth}px`;
  el.style.height = `${cardHeight}px`;
  el.style.setProperty("--card-width", `${cardWidth}px`);
  el.dataset.presentationItemId = item.id;
  el.dataset.projectId = item.projectId || project.id;
  if (!viewer) {
    el.title =
      "Double-click the card or use → to open it (same as dashboard). Drag to move.";
  }
  const statusMarkup = viewer
    ? `<div class="card-status" data-status="${statusSlug(project.status)}">${esc(project.status || "In Progress")}</div>`
    : `<div class="card-status-wrap">
        <button class="card-status" type="button" data-status="${statusSlug(project.status)}">${esc(project.status || "In Progress")}</button>
        <div class="card-status-menu">
          ${PROJECT_STATUSES.map((status) => `<button class="card-status-option${status === (project.status || "In Progress") ? " active" : ""}" type="button" data-value="${esc(status)}" data-status="${statusSlug(status)}"><span class="card-status-dot" style="--status-color:${status === "Done" ? "var(--green)" : status === "On Going" ? "var(--blue)" : status === "In Progress" ? "var(--yellow)" : status === "Cancelled" ? "var(--red)" : status === "Postponed" ? "var(--purple)" : "var(--blue)"}"></span>${esc(status)}</button>`).join("")}
        </div>
      </div>`;
  el.innerHTML = `
    ${
      viewer
        ? ""
        : `<button class="card-del" title="Remove from presentation">✕</button>
    <button class="card-edit" title="Edit linked card">⋯</button>`
    }
    <div class="card-meta"><span class="card-date">${date}</span></div>
    <div class="card-title">${esc(project.name || "Untitled")}</div>
    <div class="card-desc">${esc(project.desc || "")}</div>
    <div class="card-bottom">
      <div class="card-bottom-meta">
        ${statusMarkup}
        <div class="card-stats"><div class="card-stat"><span>${nodeCount}</span> nodes</div><div class="card-stat"><span>${connectionCount}</span> links</div></div>
      </div>
      <button class="card-open" type="button" aria-label="Open card">→</button>
    </div>
    ${
      viewer
        ? ""
        : `${presentationSpatialHandlesInnerHTML(item.id)}<div class="card-resize-handle resize-tl" data-dir="tl"></div>
    <div class="card-resize-handle resize-tr" data-dir="tr"></div>
    <div class="card-resize-handle resize-bl" data-dir="bl"></div>
    <div class="card-resize-handle resize-br" data-dir="br"></div>`
    }`;
  const presSelN = presentationDeckSelectionCount();
  if (!viewer && selectedPresentationItemIds.has(String(item.id))) {
    el.classList.toggle("selected", presSelN === 1);
    el.classList.toggle("multi-selected", presSelN > 1);
  }
  if (viewer) {
    const openDepth = globalThis.BEVViewer?.openCardDepth;
    el.querySelector(".card-open")?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (typeof openDepth === "function") openDepth(item);
    });
    el.addEventListener("dblclick", (e) => {
      if (e.target.closest(".card-open") || e.target.closest(".card-status"))
        return;
      if (typeof openDepth === "function") openDepth(item);
    });
    return el;
  }
  el.querySelector(".card-del")?.addEventListener("click", (e) => {
    e.stopPropagation();
    removePresentationItem(item.id);
  });
  el.querySelector(".card-edit")?.addEventListener("click", (e) => {
    e.stopPropagation();
    openEditProjectModal(project.id);
  });
  el.querySelector(".card-open")?.addEventListener("click", (e) => {
    e.stopPropagation();
    openProject(project.id, "presentation");
  });
  bindEditableProjectStatus({
    project,
    statusBtn: el.querySelector(".card-status"),
    statusMenu: el.querySelector(".card-status-menu"),
    onChange: () => {
      renderPresentationScreen();
      renderDashboard();
    },
  });
  el.querySelectorAll(".card-resize-handle").forEach((h) =>
    h.addEventListener("mousedown", (e) => {
      e.stopPropagation();
      e.preventDefault();
      startPresentationItemResize(e, item, project, el, h.dataset.dir);
    }),
  );
  el.addEventListener("mousedown", (e) => {
    if (
      e.target.closest(".card-del") ||
      e.target.closest(".card-edit") ||
      e.target.closest(".card-open") ||
      e.target.closest(".card-status") ||
      e.target.closest(".card-status-menu") ||
      e.target.closest(".card-resize-handle") ||
      e.target.closest(".pres-spatial-handle")
    ) {
      return;
    }
    if (e.button !== 0) return;
    if (e.shiftKey && presentationTool === "select") {
      togglePresentationItemSelection(item.id);
      e.preventDefault();
      return;
    }
    const presN = presentationDeckSelectionCount();
    if (
      presentationTool === "select" &&
      selectedPresentationItemIds.has(String(item.id)) &&
      presN > 1
    ) {
      beginPresentationGroupDrag(e);
      e.preventDefault();
      return;
    }
    if (presentationTool === "select") {
      if (
        !selectedPresentationItemIds.has(String(item.id)) ||
        presN > 1
      ) {
        selectedPresentationItemIds.clear();
        selectedPresentationObjectIds.clear();
        selectedPresentationItemIds.add(String(item.id));
        applyPresentationDeckSelectionClasses();
      }
      startPresentationItemDrag(e, item, el);
      e.preventDefault();
      return;
    }
    startPresentationItemDrag(e, item, el);
  });
  el.addEventListener("dblclick", (e) => {
    if (
      e.target.closest(".card-del") ||
      e.target.closest(".card-open") ||
      e.target.closest(".card-status") ||
      e.target.closest(".card-resize-handle") ||
      e.target.closest(".card-edit")
    )
      return;
    openProject(project.id, "presentation");
  });
  bindPresentationSpatialConnHandles(el);
  return el;
}

function renderPresentationList() {
  const listEl = document.getElementById("presentation-list");
  if (!listEl) return;
  listEl.innerHTML = "";
  presentations.forEach((presentation) => {
    const item = document.createElement("div");
    item.className =
      "presentation-list-item" +
      (currentPresentation?.id === presentation.id ? " active" : "");
    item.innerHTML = `<div class="presentation-list-row">
      <div class="presentation-list-copy">
        <span class="presentation-list-stamp">${esc(formatPresentationTimestamp(presentation.updatedAt || presentation.created))}</span>
        <div class="presentation-list-name">${esc(presentation.name || "Untitled Presentation")}</div>
        <div class="presentation-list-meta">
          <span>${(presentation.items || []).length} cards</span>
          <span class="presentation-share-state">${presentation.shareToken ? "Shared" : "Private"}</span>
        </div>
      </div>
      <button class="presentation-list-delete" type="button" aria-label="Delete presentation">✕</button>
    </div>`;
    item.addEventListener("click", () => {
      currentPresentation = presentation;
      renderPresentationScreen();
      setTimeout(presentationResetView, 60);
      saveLastView("presentation", null, presentation.id);
    });
    item
      .querySelector(".presentation-list-delete")
      ?.addEventListener("click", (e) => {
        e.stopPropagation();
        currentPresentation = presentation;
        requestDeleteCurrentPresentation();
      });
    listEl.appendChild(item);
  });
}

function updatePresentationPrivacyUI() {
  const dot = document.getElementById("presentation-privacy-dot");
  const label = document.getElementById("presentation-privacy-label");
  const pathStatus = document.getElementById("presentation-path-status");
  const shared = !!currentPresentation?.shareToken;
  if (dot) {
    dot.classList.remove("private", "shared");
    dot.classList.add(shared ? "shared" : "private");
  }
  if (label) label.textContent = shared ? "Shared" : "Private";
  if (pathStatus) {
    pathStatus.textContent = shared
      ? "Shared — anyone with the link can view"
      : "Private Presentation";
  }
}

function presentationDeckObjectHeadingDragPrep(e, obj) {
  // mousemove/pointermove while dragging often use button === -1; only skip real aux clicks.
  if (e.button > 0) return true;
  if (e.shiftKey && presentationTool === "select") {
    togglePresentationObjectSelection(obj.id);
    e.preventDefault();
    return true;
  }
  const presN = presentationDeckSelectionCount();
  if (
    presentationTool === "select" &&
    selectedPresentationObjectIds.has(String(obj.id)) &&
    presN > 1
  ) {
    beginPresentationGroupDrag(e);
    e.preventDefault();
    return true;
  }
  if (
    presentationTool === "select" &&
    (!selectedPresentationObjectIds.has(String(obj.id)) || presN > 1)
  ) {
    selectedPresentationItemIds.clear();
    selectedPresentationObjectIds.clear();
    selectedPresentationObjectIds.add(String(obj.id));
    applyPresentationDeckSelectionClasses();
  }
  return false;
}

function presentationDeckSpatialObjectPointerDown(e, obj, el) {
  if (presentationDeckObjectHeadingDragPrep(e, obj)) return;
  startPresentationObjectDrag(e, obj, el);
}

function createPresentationObjectEl(obj, { viewer = false } = {}) {
  const el = document.createElement("div");
  el.className = `presentation-object presentation-object-${obj.type}`;
  el.dataset.objectId = obj.id;
  el.style.left = `${obj.x || 0}px`;
  el.style.top = `${obj.y || 0}px`;
  if (obj.type === "line") {
    el.innerHTML = `<div class="content overview-item-line"></div>${
      viewer ? "" : presentationSpatialHandlesInnerHTML(obj.id)
    }`;
    el.style.width = `${obj.w || 220}px`;
  } else if (obj.type === "frame") {
    el.classList.add("overview-item-frame");
    el.innerHTML = `${renderSharedTextObjectHTML(obj.type, obj.text || "Group", "content", { readOnly: viewer })}
      ${
        viewer
          ? ""
          : `<div class="overview-resize-handle resize-tl" data-dir="tl"></div>
      <div class="overview-resize-handle resize-tr" data-dir="tr"></div>
      <div class="overview-resize-handle resize-bl" data-dir="bl"></div>
      <div class="overview-resize-handle resize-br" data-dir="br"></div>${presentationSpatialHandlesInnerHTML(obj.id)}`
      }`;
    el.style.width = `${obj.w || 260}px`;
    el.style.height = `${obj.h || 180}px`;
    if (!viewer) {
      bindSharedTextObjectEditor(el.querySelector(".content"), obj.type, (text) => {
        obj.text = text;
        queuePresentationSave(currentPresentation);
      });
      el.querySelectorAll(".overview-resize-handle").forEach((handle) =>
        handle.addEventListener("mousedown", (e) => {
          e.stopPropagation();
          e.preventDefault();
          startPresentationObjectResize(e, obj, handle.dataset.dir, el);
        }),
      );
    }
  } else if (usesUnifiedNoteObjectBehavior(obj.type)) {
    const isHeading = obj.type === "heading";
    el.classList.add("node", `node-${obj.type}`);
    const presAccent = currentPresentation?.shareToken ? "#44ff88" : "#333";
    const presDelBtn = viewer
      ? ""
      : `<button class="node-act-btn" type="button" onclick="requestDeletePresentationObject('${obj.id}')">✕</button>`;
    el.innerHTML = isHeading
      ? buildNodeShell(obj, {
          editable: !viewer,
          accent: presAccent,
          label: obj.customTitle ?? "Heading",
          actionsHTML: presDelBtn,
          settingsHTML: "",
        }).html + (viewer ? "" : presentationSpatialHandlesInnerHTML(obj.id))
      : renderSharedTextNoteShellHTML({
          type: obj.type,
          text: obj.text || "",
          label: obj.customTitle || "Note",
          accent: presAccent,
          contentClassName: "content node-content",
          readOnly: viewer,
          actionsHTML: presDelBtn,
          settingsHTML: "",
        }) +
        (viewer
          ? ""
          : `<div class="node-resize-handle resize-tl" data-dir="tl"></div>
      <div class="node-resize-handle resize-tr" data-dir="tr"></div>
      <div class="node-resize-handle resize-bl" data-dir="bl"></div>
      <div class="node-resize-handle resize-br" data-dir="br"></div>${presentationSpatialHandlesInnerHTML(obj.id)}`);
    if (!isHeading) {
      if (obj.w) el.style.width = `${obj.w}px`;
      if (obj.h) el.style.height = `${obj.h}px`;
    }
    if (!viewer) {
      bindUnifiedNoteObjectBehavior({
        el,
        type: obj.type,
        contentEditableDragMode: isHeading ? "deferHeading" : "default",
        beforeDeferHeadingDrag: isHeading
          ? (e) =>
              presentationTool === "connect" ||
              presentationDeckObjectHeadingDragPrep(e, obj)
          : null,
        onCommit: (text) => {
          obj.text = text;
          queuePresentationSave(currentPresentation);
        },
        onLabelCommit: (label) => {
          obj.customTitle = isHeading ? label || "Heading" : label;
          queuePresentationSave(currentPresentation);
        },
        onPointerDown: (e) =>
          presentationDeckSpatialObjectPointerDown(e, obj, el),
        onResizeStart: (e, dir) =>
          startPresentationObjectResize(e, obj, dir, el),
      });
      const presUnifiedSelN = presentationDeckSelectionCount();
      if (selectedPresentationObjectIds.has(String(obj.id))) {
        el.classList.toggle("selected", presUnifiedSelN === 1);
        el.classList.toggle("multi-selected", presUnifiedSelN > 1);
      }
    }
  }

  if (!viewer) {
    if (!usesUnifiedNoteObjectBehavior(obj.type)) {
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "presentation-object-delete";
      delBtn.textContent = "✕";
      delBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        requestDeletePresentationObject(obj.id);
      });
      el.appendChild(delBtn);
      const presObjSelN = presentationDeckSelectionCount();
      if (selectedPresentationObjectIds.has(String(obj.id))) {
        el.classList.toggle("selected", presObjSelN === 1);
        el.classList.toggle("multi-selected", presObjSelN > 1);
      }
      el.addEventListener("mousedown", (e) => {
        if (
          e.target.closest(".node-resize-handle") ||
          e.target.closest(".overview-resize-handle") ||
          e.target.closest(".node-act-btn") ||
          e.target.closest(".presentation-object-delete") ||
          e.target.closest(".pres-spatial-handle")
        ) {
          return;
        }
        if (e.button !== 0) return;
        if (e.shiftKey && presentationTool === "select") {
          togglePresentationObjectSelection(obj.id);
          e.preventDefault();
          return;
        }
        const presN = presentationDeckSelectionCount();
        if (
          presentationTool === "select" &&
          selectedPresentationObjectIds.has(String(obj.id)) &&
          presN > 1
        ) {
          beginPresentationGroupDrag(e);
          e.preventDefault();
          return;
        }
        if (
          presentationTool === "select" &&
          (!selectedPresentationObjectIds.has(String(obj.id)) || presN > 1)
        ) {
          selectedPresentationItemIds.clear();
          selectedPresentationObjectIds.clear();
          selectedPresentationObjectIds.add(String(obj.id));
          applyPresentationDeckSelectionClasses();
        }
        if (e.target.isContentEditable && !e.altKey) {
          return;
        }
        startPresentationObjectDrag(e, obj, el);
      });
    }
    bindPresentationSpatialConnHandles(el);
  }
  if (viewer) {
    el.querySelectorAll("[contenteditable]").forEach((node) => {
      node.contentEditable = "false";
    });
  }
  return el;
}

function renderPresentationWorld() {
  const world = document.getElementById("presentation-world");
  if (!world) return;
  prunePresentationDeckSelection();
  world
    .querySelectorAll(".presentation-card, .presentation-object")
    .forEach((el) => el.remove());
  let svg = document.getElementById("presentation-connections-svg");
  if (!svg) {
    svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.id = "presentation-connections-svg";
    svg.setAttribute("width", "4200");
    svg.setAttribute("height", "3000");
    svg.style.cssText =
      "position:absolute;left:0;top:0;overflow:visible;pointer-events:none;z-index:0";
    world.insertBefore(svg, world.firstChild);
  }
  if (!currentPresentation) return;
  (currentPresentation.objects || []).forEach((obj) => {
    world.appendChild(createPresentationObjectEl(obj));
  });
  (currentPresentation.items || []).forEach((item) => {
    const project = projects.find((entry) => entry.id === item.projectId);
    if (!project) return;
    world.appendChild(createPresentationProjectCardEl(item, project));
  });
  renderPresentationSpatialConnections();
}

function renderPresentationScreen() {
  const titleInput = document.getElementById("presentation-title-input");
  const metaEl = document.getElementById("presentation-meta");
  const countEl = document.getElementById("presentation-card-count");
  const addBtn = document.getElementById("presentation-tool-cards");
  const shareBtn = document.getElementById("presentation-share-btn");
  const deleteBtn = document.getElementById("presentation-delete-btn");
  const emptyEl = document.getElementById("presentation-empty-state");
  const emptyAction = document.getElementById("presentation-empty-action");
  const sidebarCurrent = document.getElementById("presentation-sidebar-current");
  const world = document.getElementById("presentation-world");
  document
    .querySelectorAll("#presentation-toolbar .presentation-add-tool")
    .forEach((btn) => {
      btn.disabled = !currentPresentation;
    });
  document.querySelectorAll(".pres-tool-mode").forEach((btn) => {
    btn.disabled = !currentPresentation;
  });
  renderPresentationList();
  if (!world) return;
  const hasPresentation = Boolean(currentPresentation);
  if (titleInput) titleInput.disabled = !hasPresentation;
  if (addBtn) addBtn.disabled = !hasPresentation;
  if (shareBtn) shareBtn.disabled = !hasPresentation;
  if (deleteBtn) deleteBtn.disabled = !hasPresentation;
  if (sidebarCurrent)
    sidebarCurrent.classList.toggle("empty", !hasPresentation);
  if (!hasPresentation) {
    if (titleInput) titleInput.value = "";
    if (metaEl) metaEl.textContent = "No presentation selected";
    if (countEl) countEl.textContent = "0 cards";
    if (emptyAction) {
      emptyAction.textContent = "Create Presentation";
      emptyAction.onclick = () => createPresentation();
    }
    if (emptyEl) emptyEl.style.display = "block";
    world.innerHTML = "";
    updatePresentationPrivacyUI();
    return;
  }
  if (emptyEl)
    emptyEl.style.display =
      (currentPresentation.items || []).length ||
      (currentPresentation.objects || []).length
      ? "none"
      : "block";
  if (emptyAction) {
    emptyAction.textContent =
      (currentPresentation.items || []).length ||
      (currentPresentation.objects || []).length
      ? "Add Cards"
      : "Add Existing Cards";
    emptyAction.onclick = () => openPresentationPicker();
  }
  if (titleInput) titleInput.value = currentPresentation.name || "";
  if (metaEl)
    metaEl.textContent = formatPresentationTimestamp(
      currentPresentation.updatedAt || currentPresentation.created,
    );
  if (countEl)
    countEl.textContent = `${(currentPresentation.items || []).length} cards`;
  updatePresentationPrivacyUI();
  renderPresentationWorld();
  applyPresentationTransform();
  updatePresentationToolbar();
}

function createPresentation(initialProjectIds = []) {
  const presentation = normalizePresentationData({
    id: makePresentationId(),
    name: `Presentation ${presentations.length + 1}`,
    created: Date.now(),
    items: [],
    objects: [],
  });
  presentations.push(presentation);
  currentPresentation = presentation;
  addProjectsToPresentation(initialProjectIds, false);
  savePresentationToFirestore(presentation);
  show("presentation");
  renderPresentationScreen();
  setTimeout(presentationResetView, 60);
  saveLastView("presentation", null, presentation.id);
}

function openPresentationHub(presentationId = null) {
  currentPresentation = presentationId
    ? getPresentationById(presentationId)
    : currentPresentation || presentations[0] || null;
  show("presentation");
  renderPresentationScreen();
  setTimeout(presentationResetView, 60);
  saveLastView("presentation", null, currentPresentation?.id || null);
}

function returnFromPresentation() {
  currentPresentation = currentPresentation
    ? getPresentationById(currentPresentation.id)
    : null;
  show("dashboard");
  renderDashboard();
  setTimeout(dashboardResetView, 60);
  saveLastView("dashboard");
}

function addProjectsToPresentation(projectIds = [], shouldSave = true) {
  if (!currentPresentation || !projectIds.length) return;
  const existingIds = getPresentationProjectIds(currentPresentation);
  let added = 0;
  projectIds.forEach((projectId) => {
    if (!projectId || existingIds.has(projectId)) return;
    const position = getPresentationGridPosition(
      (currentPresentation.items || []).length + added,
    );
    currentPresentation.items.push({
      id: makePresentationItemId(),
      projectId,
      x: position.x,
      y: position.y,
    });
    added += 1;
  });
  if (!added) return;
  if (shouldSave) queuePresentationSave(currentPresentation);
  renderPresentationScreen();
  setTimeout(presentationResetView, 60);
}

function addPresentationObject(type) {
  if (!currentPresentation) return;
  currentPresentation.objects = currentPresentation.objects || [];
  currentPresentation.objects.push(makePresentationObject(type));
  queuePresentationSave(currentPresentation);
  renderPresentationScreen();
}

function removePresentationItem(itemId) {
  if (!currentPresentation) return;
  prunePresentationSpatialConnections([itemId]);
  currentPresentation.items = (currentPresentation.items || []).filter(
    (item) => item.id !== itemId,
  );
  queuePresentationSave(currentPresentation);
  renderPresentationScreen();
}

function requestDeletePresentationObject(id) {
  if (!currentPresentation) return;
  const obj = (currentPresentation.objects || []).find((entry) => entry.id === id);
  if (!obj) return;
  openConfirmDialog({
    title: "Delete Object",
    message: `Delete "${obj.type}"?`,
    confirmLabel: "Delete",
    onConfirm: () => {
      prunePresentationSpatialConnections([id]);
      currentPresentation.objects = (currentPresentation.objects || []).filter(
        (entry) => entry.id !== id,
      );
      queuePresentationSave(currentPresentation);
      renderPresentationScreen();
    },
  });
}

function requestDeleteCurrentPresentation() {
  if (!currentPresentation) return;
  openConfirmDialog({
    title: "Delete Presentation",
    message: `Delete "${currentPresentation.name}" and its shared link?`,
    confirmLabel: "Delete",
    onConfirm: async () => {
      const presentationId = currentPresentation.id;
      const target = getPresentationById(presentationId);
      presentations = presentations.filter(
        (presentation) => presentation.id !== presentationId,
      );
      currentPresentation = presentations[0] || null;
      renderPresentationScreen();
      await deletePresentationFromFirestore(target);
      if (!presentations.length) {
        document.getElementById("presentation-empty-state").style.display =
          "block";
      }
    },
  });
}

function startPresentationItemDrag(e, item, el) {
  if (!currentPresentation || e.button !== 0) return;
  const canvas = document.getElementById("presentation-canvas");
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const sc = presentationScale || 1;
  const ox = presentationViewOffset.x;
  const oy = presentationViewOffset.y;
  presentationDragItemId = item.id;
  presentationDragOffset = {
    x: (e.clientX - rect.left - ox) / sc - (item.x || 0),
    y: (e.clientY - rect.top - oy) / sc - (item.y || 0),
  };
  el.classList.add("dragging");
  e.preventDefault();
}

function startPresentationObjectDrag(e, obj, el) {
  if (!currentPresentation || e.button !== 0) return;
  const canvas = document.getElementById("presentation-canvas");
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const sc = presentationScale || 1;
  const ox = presentationViewOffset.x;
  const oy = presentationViewOffset.y;
  presentationDragObjectId = obj.id;
  presentationObjectDragOffset = {
    x: (e.clientX - rect.left - ox) / sc - (obj.x || 0),
    y: (e.clientY - rect.top - oy) / sc - (obj.y || 0),
  };
  el.classList.add("dragging");
  e.preventDefault();
}

function startPresentationObjectResize(e, obj, dir, el) {
  if (!currentPresentation) return;
  presentationResizeObjectId = obj.id;
  presentationResizeStart = {
    x: e.clientX,
    y: e.clientY,
    w: el.offsetWidth,
    h: el.offsetHeight,
    dir,
    startX: obj.x,
    startY: obj.y,
  };
}

async function copyCurrentPresentationShareLink() {
  if (!currentPresentation) return;
  const hadToken = !!currentPresentation.shareToken;
  if (!currentPresentation.shareToken) {
    currentPresentation.shareToken = makePresentationShareToken();
  }
  const saved = await savePresentationToFirestore(currentPresentation);
  if (!saved) {
    if (!hadToken) currentPresentation.shareToken = null;
    renderPresentationScreen();
    return;
  }
  const shareUrl = getSharedPresentationUrl(currentPresentation.shareToken);
  renderPresentationScreen();

  if (navigator.share && window.isSecureContext) {
    try {
      await navigator.share({
        title: (currentPresentation.name || "").trim() || "BEV Presentation",
        text: "View this Bird Eye View presentation",
        url: shareUrl,
      });
      showToast("Presentation link shared");
      return;
    } catch (err) {
      if (err && err.name === "AbortError") return;
    }
  }

  const copied = await copyTextToClipboard(shareUrl);
  if (copied) {
    showToast("Viewer link copied to clipboard");
  } else {
    window.prompt("Clipboard unavailable — copy this viewer link manually:", shareUrl);
  }
}

function openPresentationPicker() {
  if (!currentPresentation) return;
  presentationPickerSelection = new Set();
  renderPresentationPicker();
  document
    .getElementById("presentation-picker-overlay")
    .classList.add("visible");
}

function closePresentationPicker() {
  document
    .getElementById("presentation-picker-overlay")
    .classList.remove("visible");
}

function renderPresentationPicker() {
  const listEl = document.getElementById("presentation-picker-list");
  if (!listEl) return;
  const alreadyAdded = getPresentationProjectIds(currentPresentation);
  listEl.innerHTML = "";
  projects.forEach((project) => {
    const row = document.createElement("div");
    const isSelected = presentationPickerSelection.has(project.id);
    const isAlreadyAdded = alreadyAdded.has(project.id);
    row.className =
      "presentation-picker-item" +
      (isSelected ? " selected" : "") +
      (isAlreadyAdded ? " already-added" : "");
    row.innerHTML = `<div class="presentation-picker-check">${isSelected ? "✓" : ""}</div>
      <div class="presentation-picker-copy">
        <div class="presentation-picker-name">${esc(project.name || "Untitled")}</div>
        <div class="presentation-picker-desc">${esc(project.desc || "No description yet.")}</div>
      </div>`;
    row.addEventListener("click", () => {
      if (isAlreadyAdded) return;
      if (presentationPickerSelection.has(project.id))
        presentationPickerSelection.delete(project.id);
      else presentationPickerSelection.add(project.id);
      renderPresentationPicker();
    });
    listEl.appendChild(row);
  });
}

function addSelectedProjectsToPresentation() {
  if (!currentPresentation) return;
  addProjectsToPresentation([...presentationPickerSelection], true);
  closePresentationPicker();
}

function fitSharedPresentationViewport() {
  const canvas = document.getElementById("shared-presentation-canvas");
  const world = document.getElementById("shared-presentation-world");
  if (!canvas || !world) return;
  const nav = getSharedPresentationSpatialNav();
  const rect = canvas.getBoundingClientRect();
  const isMobile = isMobileViewport();
  const els = [
    ...world.querySelectorAll(".presentation-card, .presentation-object"),
  ];
  if (!els.length) {
    const g = isMobile ? 40 : 56;
    const sc = Math.max(
      PRESENTATION_SCALE_MIN,
      Math.min(PRESENTATION_SCALE_MAX, isMobile ? 0.28 : 0.48),
    );
    nav.setState(g, g, sc, sc);
    nav.apply();
    return;
  }
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  els.forEach((el) => {
    const x = parseFloat(el.style.left) || 0;
    const y = parseFloat(el.style.top) || 0;
    const w = el.offsetWidth || 280;
    const h = el.offsetHeight || 200;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  });
  const pad = isMobile ? 340 : 220;
  const cw = maxX - minX + pad * 2;
  const ch = maxY - minY + pad * 2;
  const sc = Math.max(
    PRESENTATION_SCALE_MIN,
    Math.min(
      PRESENTATION_SCALE_MAX,
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

function ensureSharedPresentationSpatialNavigation() {
  const canvas = document.getElementById("shared-presentation-canvas");
  if (!canvas) return;
  if (!canvas.dataset.bevSharedPresWheel) {
    canvas.dataset.bevSharedPresWheel = "1";
    canvas.addEventListener(
      "wheel",
      (e) => {
        if (currentScreenName !== "shared-presentation") return;
        getSharedPresentationSpatialNav().wheel(e);
      },
      { passive: false },
    );
  }
  if (!canvas.dataset.bevSharedPresPan) {
    canvas.dataset.bevSharedPresPan = "1";
    canvas.addEventListener("mousedown", (e) => {
      if (currentScreenName !== "shared-presentation") return;
      if (e.button !== 1) return;
      const world = document.getElementById("shared-presentation-world");
      const onDeck =
        e.target === canvas ||
        e.target === world ||
        (world && world.contains(e.target));
      if (!onDeck) return;
      getSharedPresentationSpatialNav().beginPan(e.clientX, e.clientY);
      canvas.classList.add("panning");
      e.preventDefault();
    });
  }
  if (!window.__bevSharedPresGlobalPointer) {
    window.__bevSharedPresGlobalPointer = true;
    window.addEventListener("mousemove", (e) => {
      const nav = sharedPresentationSpatialNav;
      if (!nav || !nav.isPanningActive()) return;
      if (currentScreenName !== "shared-presentation") return;
      nav.movePan(e.clientX, e.clientY);
    });
    window.addEventListener("mouseup", () => {
      const nav = sharedPresentationSpatialNav;
      if (nav && nav.isPanningActive()) {
        nav.endPan();
        document
          .getElementById("shared-presentation-canvas")
          ?.classList.remove("panning");
      }
    });
  }
  installTouchSpatialSurface(canvas, {
    getNav: getSharedPresentationSpatialNav,
    pointerSpace: "client",
    scaleMin: PRESENTATION_SCALE_MIN,
    scaleMax: PRESENTATION_SCALE_MAX,
    viewOnly: true,
    shouldHandle: () =>
      currentScreenName === "shared-presentation" &&
      !!sharedPresentationSpatialNav &&
      !!sharedPresentation,
  });
}

function renderSharedPresentation() {
  const emptyEl = document.getElementById("shared-presentation-empty");
  const world = document.getElementById("shared-presentation-world");
  const canvas = document.getElementById("shared-presentation-canvas");
  if (!world) return;
  world.innerHTML = "";
  if (!sharedPresentation) {
    if (emptyEl) emptyEl.style.display = "block";
    if (canvas) canvas.style.display = "none";
    return;
  }
  if (!Array.isArray(sharedPresentation.items))
    sharedPresentation.items = [];
  const hasContent = !!(
    sharedPresentation.items.length ||
    (sharedPresentation.objects || []).length ||
    sharedPresentation.name
  );
  if (emptyEl) emptyEl.style.display = hasContent ? "none" : "block";
  if (canvas) canvas.style.display = hasContent ? "" : "none";
  if (!hasContent) return;
  (sharedPresentation.objects || []).forEach((obj) => {
    world.appendChild(createPresentationObjectEl(obj, { viewer: true }));
  });
  sharedPresentation.items.forEach((item) => {
    if (!item?.snapshot) return;
    world.appendChild(
      createPresentationProjectCardEl(item, item.snapshot, {
        viewer: true,
      }),
    );
  });
  requestAnimationFrame(() => {
    fitSharedPresentationViewport();
    ensureSharedPresentationSpatialNavigation();
  });
}

async function loadSharedPresentation(token) {
  show("loading");
  try {
    const snap = await promiseWithTimeout(
      publicPresentationRef(token).get(),
      45000,
      "Presentation load timed out — check your connection.",
    );
    sharedPresentation = snap.exists
      ? {
          ...snap.data(),
          objects: presentationObjectsFromRaw(snap.data().objects),
        }
      : null;
  } catch (e) {
    sharedPresentation = null;
  }
  const openAppLink = document.getElementById("shared-presentation-open-app");
  if (openAppLink) openAppLink.href = getBaseAppUrl();
  const appDeck = document.getElementById("shared-presentation-app-deck");
  const viewerWrap = document.getElementById("viewer-deck-wrap");
  if (appDeck) appDeck.style.display = "flex";
  if (viewerWrap) viewerWrap.style.display = "none";
  show("shared-presentation");
  renderSharedPresentation();
}

function getContentLines(text) {
  return String(text || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length);
}

function estimateTextMinWidth(
  text,
  {
    min = 160,
    max = 320,
    base = 140,
    charWidth = 4.5,
  } = {},
) {
  const lines = getContentLines(text);
  const longestLineLength = lines.reduce(
    (maxLen, line) => Math.max(maxLen, line.length),
    0,
  );
  const widthEstimate = base + Math.min(longestLineLength, 36) * charWidth;
  return Math.max(min, Math.min(max, Math.ceil(widthEstimate)));
}

function getOverviewItemMinSize(item, el) {
  if (isUnifiedTextNoteType(item.type)) {
    const content = el?.querySelector(".node-content");
    return {
      w: estimateTextMinWidth(content?.textContent || item.text || "", {
        min: 180,
        max: 280,
        base: 144,
        charWidth: 4,
      }),
      h: Math.max(84, Math.ceil((content?.scrollHeight || 0) + 46)),
    };
  }
  if (item.type === "frame") {
    const content = el?.querySelector(".content");
    return {
      w: estimateTextMinWidth(content?.textContent || item.text || "", {
        min: 220,
        max: 380,
        base: 190,
        charWidth: 5.5,
      }),
      h: Math.max(140, Math.ceil((content?.scrollHeight || 0) + 24)),
    };
  }
  if (item.type === "line") {
    return { w: 160, h: 2 };
  }
  return { w: 0, h: 0 };
}

function enforceOverviewItemMinSize(item, el) {
  if (!item || !el || ![...["frame", "line"], "text", "note"].includes(item.type)) return false;
  const min = getOverviewItemMinSize(item, el);
  let changed = false;
  if (item.type === "line") {
    if ((item.w || el.offsetWidth) < min.w) {
      item.w = min.w;
      el.style.width = item.w + "px";
      changed = true;
    }
    return changed;
  }
  if ((item.w || el.offsetWidth) < min.w) {
    item.w = min.w;
    el.style.width = item.w + "px";
    changed = true;
  }
  if ((item.h || el.offsetHeight) < min.h) {
    item.h = min.h;
    el.style.height = item.h + "px";
    changed = true;
  }
  return changed;
}

function calcProgress(p) {
  if (!p.nodes || !p.nodes.length) return 0;
  const pn = p.nodes.filter((n) => n.type === "progress");
  if (!pn.length) return 0;
  return Math.round(
    pn.reduce((s, n) => s + (n.value || 0), 0) / pn.length,
  );
}

// ===================== PROJECT MODAL =====================
function initColorSwatches() {
  const el = document.getElementById("color-swatches");
  const select = document.getElementById("proj-category-input");
  if (!el) return;
  el.innerHTML = "";
  if (!getCategoryById(selectedCategoryId))
    selectedCategoryId = workspaceCategories[0]?.id || null;
  const activeCategory = getCategoryById(selectedCategoryId);
  selectedColor = activeCategory?.color || getDefaultCategoryColor();
  if (select) {
    select.innerHTML = workspaceCategories
      .map(
        (category) =>
          `<option value="${esc(category.id)}">${esc(category.label)}</option>`,
      )
      .join("");
    select.value = selectedCategoryId || "";
    select.onchange = () => {
      selectedCategoryId = select.value;
      const category = getCategoryById(selectedCategoryId);
      if (!category) return;
      selectedColor = category.color;
      document.querySelectorAll(".color-swatch").forEach((swatch) => {
        swatch.classList.toggle(
          "selected",
          swatch.dataset.categoryId === selectedCategoryId,
        );
      });
    };
  }
  workspaceCategories.forEach((category) => {
    const sw = document.createElement("div");
    sw.dataset.categoryId = category.id;
    sw.className =
      "color-swatch" +
      (category.id === selectedCategoryId ? " selected" : "");
    sw.style.background = category.color;
    sw.addEventListener("click", () => {
      selectedCategoryId = category.id;
      selectedColor = category.color;
      if (select) select.value = category.id;
      document
        .querySelectorAll(".color-swatch")
        .forEach((s) => s.classList.remove("selected"));
      sw.classList.add("selected");
    });
    el.appendChild(sw);
  });
}
function openNewProjectModal() {
  editingProjectId = null;
  document.getElementById("modal-title").textContent = "Add Card";
  document.getElementById("proj-name-input").value = "";
  document.getElementById("proj-desc-input").value = "";
  document.getElementById("proj-status-input").value = "In Progress";
  applyTextDirection(document.getElementById("proj-name-input"));
  applyTextDirection(document.getElementById("proj-desc-input"));
  selectedCategoryId = workspaceCategories[0]?.id || null;
  selectedColor = getCategoryById(selectedCategoryId)?.color || getDefaultCategoryColor();
  initColorSwatches();
  document.getElementById("modal-overlay").classList.add("visible");
  setTimeout(
    () => document.getElementById("proj-name-input").focus(),
    50,
  );
}
function openEditProjectModal(id) {
  const p = projects.find((x) => x.id === id);
  if (!p) return;
  editingProjectId = id;
  document.getElementById("modal-title").textContent = "Edit Card";
  document.getElementById("proj-name-input").value = p.name || "";
  document.getElementById("proj-desc-input").value = p.desc || "";
  document.getElementById("proj-status-input").value =
    p.status || "In Progress";
  applyTextDirection(document.getElementById("proj-name-input"));
  applyTextDirection(document.getElementById("proj-desc-input"));
  selectedCategoryId = getProjectCategoryId(p);
  selectedColor =
    getCategoryById(selectedCategoryId)?.color ||
    p.color ||
    getDefaultCategoryColor();
  initColorSwatches();
  document.getElementById("modal-overlay").classList.add("visible");
  setTimeout(
    () => document.getElementById("proj-name-input").focus(),
    50,
  );
}
function closeModal() {
  document.getElementById("modal-overlay").classList.remove("visible");
}
function openConfirmDialog({
  title = "Delete",
  message = "Are you sure?",
  confirmLabel = "Delete",
  onConfirm = null,
}) {
  pendingConfirmAction = onConfirm;
  document.getElementById("confirm-title").textContent = title;
  document.getElementById("confirm-message").textContent = message;
  document.getElementById("confirm-action-btn").textContent =
    confirmLabel;
  document.getElementById("confirm-overlay").classList.add("visible");
}
function closeConfirmDialog() {
  pendingConfirmAction = null;
  document.getElementById("confirm-overlay").classList.remove("visible");
}
function runConfirmAction() {
  const action = pendingConfirmAction;
  closeConfirmDialog();
  if (typeof action === "function") action();
}
async function saveProject() {
  const name =
    document.getElementById("proj-name-input").value.trim() || "Untitled";
  const desc = document.getElementById("proj-desc-input").value.trim();
  const status = document.getElementById("proj-status-input").value;
  captureHistory();
  if (editingProjectId) {
    const p = projects.find((x) => x.id === editingProjectId);
    if (p) {
      p.name = name;
      p.desc = desc;
      p.status = status;
      assignProjectToCategory(p, selectedCategoryId);
      await saveToFirestore(p);
    }
  } else {
    const p = buildProject(name, desc);
    p.status = status;
    assignProjectToCategory(p, selectedCategoryId);
    projects.push(p);
    await saveToFirestore(p);
  }
  newProjectPosition = null;
  closeModal();
  renderDashboard();
  renderPresentationScreen();
  showToast(editingProjectId ? "Card updated" : "Project saved");
}
function buildProject(name, desc) {
  const pos = getNewProjectPosition();
  return {
    id: "p" + Date.now(),
    name,
    desc: desc || "",
    status: "In Progress",
    color: getCategoryById(selectedCategoryId)?.color || selectedColor,
    category:
      getCategoryById(selectedCategoryId)?.label ||
      categoryFromColor(selectedColor),
    created: Date.now(),
    nodes: [],
    connections: [],
    x: pos.x,
    y: pos.y,
    w: DEFAULT_PROJECT_CARD_WIDTH,
    h: DEFAULT_PROJECT_CARD_HEIGHT,
  };
}

function normalizeProjectLayout() {
  const changedProjects = [];
  projects.forEach((p, i) => {
    if (typeof p.x !== "number" || typeof p.y !== "number") {
      p.x = 100 + (i % 4) * 300;
      p.y = 100 + Math.floor(i / 4) * 210;
      changedProjects.push(p);
    }
    if (typeof p.w !== "number" || p.w < DEFAULT_PROJECT_CARD_WIDTH) {
      p.w = DEFAULT_PROJECT_CARD_WIDTH;
      if (!changedProjects.includes(p)) changedProjects.push(p);
    }
    if (typeof p.h !== "number" || p.h < DEFAULT_PROJECT_CARD_HEIGHT) {
      p.h = DEFAULT_PROJECT_CARD_HEIGHT;
      if (!changedProjects.includes(p)) changedProjects.push(p);
    }
    if (!p.category) {
      normalizeProjectCategory(p);
      if (!changedProjects.includes(p)) changedProjects.push(p);
    }
    normalizeProjectCategory(p);
    if (!p.status) {
      p.status = "In Progress";
      if (!changedProjects.includes(p)) changedProjects.push(p);
    }
  });
  changedProjects.forEach((p) => saveToFirestore(p));
}

function setDashboardTool(t) {
  dashboardTool = t;
  document
    .querySelectorAll('.tool-btn[id^="dashboard-tool-"]')
    .forEach((b) => b.classList.remove("active"));
  document.getElementById(`dashboard-tool-${t}`)?.classList.add("active");
  const canvas = document.getElementById("dashboard-canvas");
  if (canvas) canvas.style.cursor = t === "pan" ? "grab" : "default";
}

function applyOverviewSelectionClasses() {
  const count = selectedProjectIds.size + selectedOverviewItemIds.size;
  const indicator = document.getElementById(
    "dashboard-selection-indicator",
  );
  document.querySelectorAll(".project-card").forEach((el) => {
    const isSelected = selectedProjectIds.has(el.dataset.projectId);
    el.classList.toggle(
      "selected",
      isSelected && selectedProjectIds.size === 1,
    );
    el.classList.toggle(
      "multi-selected",
      isSelected && selectedProjectIds.size > 1,
    );
  });
  document.querySelectorAll(".overview-item").forEach((el) => {
    const isSelected = selectedOverviewItemIds.has(el.dataset.itemId);
    el.classList.toggle(
      "selected",
      isSelected && selectedOverviewItemIds.size === 1,
    );
    el.classList.toggle(
      "multi-selected",
      isSelected && selectedOverviewItemIds.size > 1,
    );
  });
  if (indicator) {
    indicator.textContent = count ? `${count} selected` : "No selection";
    indicator.classList.toggle("visible", count > 1);
  }
}

function setOverviewSelection(sel, additive = false) {
  overviewSelection = sel;
  if (!additive) {
    selectedProjectIds.clear();
    selectedOverviewItemIds.clear();
  }
  if (sel) {
    if (sel.type === "project") selectedProjectIds.add(sel.id);
    else selectedOverviewItemIds.add(sel.id);
  }
  applyOverviewSelectionClasses();
}

function deleteOverviewSelection() {
  if (
    !selectedProjectIds.size &&
    !selectedOverviewItemIds.size &&
    !overviewSelection
  )
    return;
  const cardCount = selectedProjectIds.size;
  const itemCount = selectedOverviewItemIds.size
    ? selectedOverviewItemIds.size
    : overviewSelection?.type === "item"
      ? 1
      : 0;
  const parts = [];
  if (cardCount)
    parts.push(`${cardCount} card${cardCount !== 1 ? "s" : ""}`);
  if (itemCount)
    parts.push(`${itemCount} item${itemCount !== 1 ? "s" : ""}`);
  openConfirmDialog({
    title: "Delete Selection",
    message: `Delete ${parts.join(" and ")}?`,
    confirmLabel: "Delete",
    onConfirm: () => {
      captureHistory();
      if (selectedProjectIds.size) {
        const ids = [...selectedProjectIds];
        projects = projects.filter((x) => !selectedProjectIds.has(x.id));
        ids.forEach((id) => deleteFromFirestore(id));
        selectedProjectIds.clear();
      }
      if (selectedOverviewItemIds.size) {
        overviewItems = overviewItems.filter(
          (x) => !selectedOverviewItemIds.has(x.id),
        );
        selectedOverviewItemIds.clear();
        queueOverviewSave();
      } else if (overviewSelection?.type === "item") {
        overviewItems = overviewItems.filter(
          (x) => x.id !== overviewSelection.id,
        );
        queueOverviewSave();
      }
      overviewSelection = null;
      applyOverviewSelectionClasses();
      renderDashboard();
      renderPresentationScreen();
    },
  });
}

function requestDeleteOverviewItemById(id) {
  const item = overviewItems.find((entry) => entry.id === id);
  if (!item) return;
  openConfirmDialog({
    title: "Delete Object",
    message: `Delete "${item.type}"?`,
    confirmLabel: "Delete",
    onConfirm: () => {
      captureHistory();
      overviewItems = overviewItems.filter((entry) => entry.id !== id);
      selectedOverviewItemIds.delete(id);
      if (overviewSelection?.type === "item" && overviewSelection.id === id) {
        overviewSelection = null;
      }
      queueOverviewSave();
      applyOverviewSelectionClasses();
      renderDashboard();
    },
  });
}

function makeOverviewItem(type, x, y) {
  const id = "o" + Date.now() + Math.floor(Math.random() * 1000);
  if (isSharedTextObjectType(type)) {
    return createSharedTextObjectState(id, type, x, y, {}, SURFACES.DASHBOARD);
  }
  if (type === "category") {
    const category = workspaceCategories[0] || null;
    return {
      id,
      type,
      x,
      y,
      hidden: false,
      categoryId: category?.id || null,
      categoryColor: category?.color || null,
      categoryLabel: category?.label || "Category",
    };
  }
  if (type === "line") return createSimpleLineItem(id, x, y);
  return createQuickNoteFallbackItem(id, type, x, y);
}

function addOverviewItem(type) {
  const pos = getNewProjectPosition();
  const item = makeOverviewItem(type, pos.x + 40, pos.y + 40);
  overviewItems.push(item);
  renderDashboard();
  queueOverviewSave();
}

function createOverviewItemEl(item) {
  const el = document.createElement("div");
  el.className = `overview-item overview-item-${item.type}`;
  if (isUnifiedTextNoteType(item.type)) {
    el.classList.add("node", `node-${item.type}`);
  }
  if (selectedOverviewItemIds.has(item.id))
    el.classList.add(
      selectedOverviewItemIds.size > 1 ? "multi-selected" : "selected",
    );
  el.dataset.itemId = item.id;
  el.style.left = item.x + "px";
  el.style.top = item.y + "px";
  if (item.type === "line") {
    el.innerHTML = `<div class="content overview-item-line"></div>`;
    el.style.width = (item.w || 220) + "px";
  } else if (item.type === "frame") {
    el.innerHTML = `${renderSharedTextObjectHTML(item.type, item.text || "Group")}
    <div class="overview-resize-handle resize-tl" data-dir="tl"></div><div class="overview-resize-handle resize-tr" data-dir="tr"></div><div class="overview-resize-handle resize-bl" data-dir="bl"></div><div class="overview-resize-handle resize-br" data-dir="br"></div>`;
    el.style.width = (item.w || 260) + "px";
    el.style.height = (item.h || 180) + "px";
    bindSharedTextObjectEditor(el.querySelector(".content"), item.type, (text) => {
      item.text = text;
      queueOverviewSave();
    });
    el.querySelectorAll(".overview-resize-handle").forEach((h) =>
      h.addEventListener("mousedown", (e) => {
        e.stopPropagation();
        e.preventDefault();
        setOverviewSelection({ type: "item", id: item.id });
        overviewResizeItemId = item.id;
        overviewResizeStart = {
          x: e.clientX,
          y: e.clientY,
          w: item.w || 260,
          h: item.h || 180,
          dir: h.dataset.dir,
          startX: item.x,
          startY: item.y,
        };
      }),
    );
  } else if (item.type === "category") {
    el.classList.add("overview-item-category");
    const category =
      getCategoryById(getOverviewItemCategoryId(item)) ||
      workspaceCategories[0];
    if (category) {
      setOverviewItemCategory(item, category.id);
      el.style.setProperty("--category-accent", category.color);
    }
    el.innerHTML = `<div class="overview-category-row">
      <div class="overview-category-controls">
        <button class="overview-category-btn" type="button" data-action="toggle-visibility" title="${item.hidden ? "Unhide cards" : "Hide cards"}">${item.hidden ? ">" : "v"}</button>
        <button class="overview-category-btn" type="button" data-action="resort-cards" title="Re-sort assigned cards">↻</button>
        <button class="overview-category-btn" type="button" data-action="edit-category" title="Change category">⋯</button>
        <div class="overview-category-picker${activeCategoryPickerId === item.id ? " open" : ""}">
          ${workspaceCategories
            .map(
              (option) =>
                `<button class="overview-category-option${option.id === category?.id ? " active" : ""}" type="button" data-action="pick-category" data-category-id="${option.id}"><span class="overview-category-option-dot" style="--option-color:${option.color}"></span><span>${esc(option.label)}</span></button>`,
            )
            .join("")}
        </div>
      </div>
      <div class="overview-category-pill">
        <span class="overview-category-dot"></span>
        <span class="overview-category-label">${esc(category?.label || item.categoryLabel || "Category")}</span>
      </div>
    </div>`;
  } else {
    el.innerHTML =
      item.type === "heading"
        ? renderSharedTextObjectHTML(item.type, item.text || "", "content")
        : renderSharedTextNoteShellHTML({
            type: item.type,
            text: item.text || "",
            label: "Note",
            accent: "#333",
            contentClassName: "content node-content",
            actionsHTML: `<button class="node-act-btn node-settings-btn" type="button">⋮</button><button class="node-act-btn" type="button" onclick="requestDeleteOverviewItemById('${item.id}')">✕</button>`,
            settingsHTML: `<div class="node-settings"><div class="node-settings-empty">No extra settings</div></div>`,
          }) +
          `<div class="node-resize-handle resize-tl" data-dir="tl"></div><div class="node-resize-handle resize-tr" data-dir="tr"></div><div class="node-resize-handle resize-bl" data-dir="bl"></div><div class="node-resize-handle resize-br" data-dir="br"></div>`;
    if (isUnifiedTextNoteType(item.type)) {
      if (item.w) el.style.width = item.w + "px";
      if (item.h) el.style.height = item.h + "px";
    }
    if (isUnifiedTextNoteType(item.type)) {
      bindUnifiedNoteObjectBehavior({
        el,
        type: item.type,
        onCommit: (text) => {
          item.text = text;
          queueOverviewSave();
        },
        onPointerDown: (e) => {
          e.stopPropagation();
          setOverviewSelection(
            { type: "item", id: item.id },
            e.shiftKey || selectedOverviewItemIds.has(item.id),
          );
          if (e.altKey && duplicateDashboardSelectionForDrag(e)) return;
          overviewDragItemId = item.id;
          overviewDragOffset = {
            x:
              (e.clientX -
                document
                  .getElementById("dashboard-canvas")
                  .getBoundingClientRect().left -
                dashboardViewOffset.x) /
                dashboardScale -
              item.x,
            y:
              (e.clientY -
                document
                  .getElementById("dashboard-canvas")
                  .getBoundingClientRect().top -
                dashboardViewOffset.y) /
                dashboardScale -
              item.y,
          };
          if (
            selectedOverviewItemIds.has(item.id) &&
            selectedProjectIds.size + selectedOverviewItemIds.size > 1
          ) {
            beginDashboardGroupDrag(e);
          }
        },
        onResizeStart: (e, dir) => {
          setOverviewSelection({ type: "item", id: item.id });
          overviewResizeItemId = item.id;
          overviewResizeStart = {
            x: e.clientX,
            y: e.clientY,
            w: item.w || el.offsetWidth,
            h: item.h || el.offsetHeight,
            dir,
            startX: item.x,
            startY: item.y,
          };
        },
      });
    } else {
      const contentEl = el.querySelector(".content");
      bindSharedTextObjectEditor(contentEl, item.type, (text) => {
        item.text = text;
        queueOverviewSave();
      });
    }
  }
  el.addEventListener("mousedown", (e) => {
    if (isUnifiedTextNoteType(item.type)) return;
    if (
      e.target.closest(".overview-category-btn") ||
      e.target.closest(".overview-category-picker") ||
      e.target.closest(".overview-resize-handle") ||
      e.target.closest(".node-resize-handle") ||
      e.target.closest(".node-act-btn") ||
      e.target.closest(".node-settings")
    )
      return;
    if (e.target.hasAttribute("contenteditable") && !e.altKey) {
      if (item.type === "heading") {
        beginHeadingTextDragOrEdit(e, (ev) =>
          dashboardOverviewItemDragFromPointer(item, el, ev),
        );
        return;
      }
      return;
    }
    dashboardOverviewItemDragFromPointer(item, el, e);
  });
  if (item.type === "category") {
    el.querySelector(".overview-category-picker")?.addEventListener(
      "mousedown",
      (e) => e.stopPropagation(),
    );
    el.querySelector("[data-action='toggle-visibility']")?.addEventListener(
      "click",
      (e) => {
        e.stopPropagation();
        item.hidden = !item.hidden;
        queueOverviewSave();
        renderDashboard();
      },
    );
    el.querySelector("[data-action='resort-cards']")?.addEventListener(
      "click",
      (e) => {
        e.stopPropagation();
        layoutCategoryCardsInCircle(item);
      },
    );
    el.querySelector("[data-action='edit-category']")?.addEventListener(
      "click",
      (e) => {
        e.stopPropagation();
        activeCategoryPickerId =
          activeCategoryPickerId === item.id ? null : item.id;
        renderDashboard();
      },
    );
    el.querySelectorAll("[data-action='pick-category']").forEach((btn) =>
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        setOverviewItemCategory(item, btn.dataset.categoryId);
        activeCategoryPickerId = null;
        queueOverviewSave();
        renderDashboard();
      }),
    );
  }
  return el;
}

function applyDashboardTransform() {
  getDashboardSpatialNav().apply();
}

function applyPresentationTransform() {
  getPresentationSpatialNav().apply();
}

function presentationResetView() {
  const canvas = document.getElementById("presentation-canvas");
  const world = document.getElementById("presentation-world");
  if (!canvas || !world) return;
  const rect = canvas.getBoundingClientRect();
  const isMobile = isMobileViewport();
  const els = [
    ...world.querySelectorAll(".presentation-card, .presentation-object"),
  ];
  if (!els.length) {
    const nav = getPresentationSpatialNav();
    const g = isMobile ? 40 : 56;
    const sc = Math.max(
      PRESENTATION_SCALE_MIN,
      Math.min(PRESENTATION_SCALE_MAX, isMobile ? 0.28 : 0.48),
    );
    nav.setState(g, g, sc, sc);
    applyPresentationTransform();
    return;
  }
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  els.forEach((el) => {
    const x = parseFloat(el.style.left) || 0;
    const y = parseFloat(el.style.top) || 0;
    const w = el.offsetWidth || 280;
    const h = el.offsetHeight || 200;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  });
  const pad = isMobile ? 340 : 220;
  const cw = maxX - minX + pad * 2;
  const ch = maxY - minY + pad * 2;
  const sc = Math.max(
    PRESENTATION_SCALE_MIN,
    Math.min(
      PRESENTATION_SCALE_MAX,
      Math.min(
        isMobile ? 0.3 : 0.5,
        Math.min(rect.width / cw, rect.height / ch),
      ),
    ),
  );
  const ox =
    (rect.width - cw * sc) / 2 - (minX - pad) * sc;
  const oy =
    (rect.height - ch * sc) / 2 - (minY - pad) * sc;
  getPresentationSpatialNav().setState(ox, oy, sc, sc);
  applyPresentationTransform();
}

function presentationZoomBy(delta) {
  const canvas = document.getElementById("presentation-canvas");
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  getPresentationSpatialNav().zoomByAdditive(
    delta,
    rect.width / 2,
    rect.height / 2,
  );
}

function updateDashboardInfo() {
  const cards = document.getElementById("dashboard-info-cards");
  const items = document.getElementById("dashboard-info-items");
  if (cards)
    cards.textContent =
      projects.length + " card" + (projects.length !== 1 ? "s" : "");
  if (items)
    items.textContent =
      overviewItems.length +
      " item" +
      (overviewItems.length !== 1 ? "s" : "");
}

function dashboardResetView() {
  const canvas = document.getElementById("dashboard-canvas");
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const isMobile = isMobileViewport();
  const nav = getDashboardSpatialNav();
  const items = [
    ...projects.map((p) => ({
      x: p.x || 0,
      y: p.y || 0,
      w: p.w || DEFAULT_PROJECT_CARD_WIDTH,
      h: p.h || DEFAULT_PROJECT_CARD_HEIGHT,
    })),
    ...overviewItems.map((i) => ({
      x: i.x || 0,
      y: i.y || 0,
      w: i.w || (i.type === "line" ? 220 : 220),
      h: i.h || (i.type === "line" ? 2 : 90),
    })),
  ];
  if (!items.length) {
    const o = isMobile ? { x: 120, y: 84 } : { x: 180, y: 110 };
    const sc = isMobile ? 0.34 : 0.52;
    nav.setState(o.x, o.y, sc, sc);
    applyDashboardTransform();
    return;
  }
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  items.forEach((it) => {
    minX = Math.min(minX, it.x);
    minY = Math.min(minY, it.y);
    maxX = Math.max(maxX, it.x + it.w);
    maxY = Math.max(maxY, it.y + it.h);
  });
  const pad = isMobile ? 360 : 260;
  const worldW = maxX - minX + pad * 2;
  const worldH = maxY - minY + pad * 2;
  const sc = Math.min(
    isMobile ? 0.34 : 0.52,
    Math.max(
      DASHBOARD_SCALE_MIN,
      Math.min(rect.width / worldW, rect.height / worldH),
    ),
  );
  const ox = (rect.width - worldW * sc) / 2 - (minX - pad) * sc;
  const oy = (rect.height - worldH * sc) / 2 - (minY - pad) * sc;
  nav.setState(ox, oy, sc, sc);
  applyDashboardTransform();
}

function dashboardZoomBy(delta) {
  const canvas = document.getElementById("dashboard-canvas");
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  getDashboardSpatialNav().zoomByAdditive(
    delta,
    rect.width / 2,
    rect.height / 2,
  );
}

function getNewProjectPosition() {
  if (newProjectPosition) return { ...newProjectPosition };
  const canvas = document.getElementById("dashboard-canvas");
  const rect = canvas.getBoundingClientRect();
  return {
    x: Math.max(
      60,
      Math.round(
        (rect.width / 2 - dashboardViewOffset.x) / dashboardScale -
          DEFAULT_PROJECT_CARD_WIDTH / 2,
      ),
    ),
    y: Math.max(
      60,
      Math.round(
        (rect.height / 2 - dashboardViewOffset.y) / dashboardScale -
          DEFAULT_PROJECT_CARD_HEIGHT / 2,
      ),
    ),
  };
}

function beginDashboardGroupDrag(e) {
  const rect = document
    .getElementById("dashboard-canvas")
    .getBoundingClientRect();
  const linkedProjectIds = [...selectedOverviewItemIds].flatMap((id) =>
    getCategoryObjectLinkedProjectIds(
      overviewItems.find((item) => item.id === id),
    ),
  );
  dashboardGroupDragProjects = [
    ...new Set([...selectedProjectIds, ...linkedProjectIds]),
  ]
    .map((id) => {
      const proj = projects.find((x) => x.id === id);
      return proj
        ? { id: proj.id, startX: proj.x, startY: proj.y }
        : null;
    })
    .filter(Boolean);
  dashboardGroupDragItems = [...selectedOverviewItemIds]
    .map((id) => {
      const item = overviewItems.find((x) => x.id === id);
      return item
        ? { id: item.id, startX: item.x, startY: item.y }
        : null;
    })
    .filter(Boolean);
  dashboardGroupDragStart = {
    x: (e.clientX - rect.left - dashboardViewOffset.x) / dashboardScale,
    y: (e.clientY - rect.top - dashboardViewOffset.y) / dashboardScale,
  };
  dashboardDragProjectId = null;
  overviewDragItemId = null;
  dashboardDragMoved = false;
  selectedProjectIds.forEach((id) =>
    document
      .querySelector(`.project-card[data-project-id="${id}"]`)
      ?.classList.add("dragging"),
  );
}

function duplicateDashboardSelectionForDrag(e) {
  const duplicatedProjects = [...selectedProjectIds]
    .map((id) => projects.find((project) => project.id === id))
    .filter(Boolean)
    .map((project) => duplicateProject(project, 24, 24));
  const duplicatedItems = [...selectedOverviewItemIds]
    .map((id) => overviewItems.find((item) => item.id === id))
    .filter(Boolean)
    .map((item) => duplicateOverviewItem(item, 24, 24));
  if (!duplicatedProjects.length && !duplicatedItems.length) return false;
  projects.push(...duplicatedProjects);
  overviewItems.push(...duplicatedItems);
  selectedProjectIds.clear();
  selectedOverviewItemIds.clear();
  duplicatedProjects.forEach((project) => selectedProjectIds.add(project.id));
  duplicatedItems.forEach((item) => selectedOverviewItemIds.add(item.id));
  renderDashboard();
  duplicatedProjects.forEach((project) => queueProjectSave(project));
  if (duplicatedItems.length) queueOverviewSave();
  applyOverviewSelectionClasses();
  beginDashboardGroupDrag(e);
  return true;
}

function startProjectDrag(e, p, el) {
  if (
    e.target.closest(".card-del") ||
    e.target.closest(".card-resize-handle") ||
    e.target.closest(".card-open") ||
    e.target.closest(".card-status") ||
    e.target.closest(".card-edit")
  )
    return;
  e.stopPropagation();
  if (e.altKey) {
    setOverviewSelection(
      { type: "project", id: p.id },
      e.shiftKey || selectedProjectIds.has(p.id),
    );
    if (duplicateDashboardSelectionForDrag(e)) return;
  }
  const rect = document
    .getElementById("dashboard-canvas")
    .getBoundingClientRect();
  if (
    selectedProjectIds.has(p.id) &&
    selectedProjectIds.size + selectedOverviewItemIds.size > 1
  ) {
    beginDashboardGroupDrag(e);
    return;
  }
  dashboardDragProjectId = p.id;
  dashboardDragMoved = false;
  dashboardDragOffset = {
    x:
      (e.clientX - rect.left - dashboardViewOffset.x) / dashboardScale -
      p.x,
    y:
      (e.clientY - rect.top - dashboardViewOffset.y) / dashboardScale -
      p.y,
  };
  if (!selectedProjectIds.has(p.id) || selectedProjectIds.size <= 1)
    setOverviewSelection({ type: "project", id: p.id });
  el.classList.add("dragging");
}

function startProjectResize(e, p, el, dir) {
  e.stopPropagation();
  e.preventDefault();
  dashboardResizeProjectId = p.id;
  dashboardResizeStart = {
    x: e.clientX,
    y: e.clientY,
    w: p.w || el.offsetWidth,
    h: p.h || el.offsetHeight,
    dir,
    startX: p.x,
    startY: p.y,
  };
}

function setupDashboardEvents() {
  if (dashboardReady) return;
  dashboardReady = true;
  const canvas = document.getElementById("dashboard-canvas");
  document
    .getElementById("workspace-menu")
    ?.addEventListener("click", (e) => e.stopPropagation());
  document
    .getElementById("workspace-menu")
    ?.addEventListener("mousedown", (e) => e.stopPropagation());
  document
    .getElementById("workspace-menu-btn")
    ?.addEventListener("click", (e) => {
      e.stopPropagation();
      workspaceMenuOpen = !workspaceMenuOpen;
      syncWorkspaceMenuVisibility();
    });
  const indicator = document.createElement("div");
  indicator.id = "dashboard-selection-indicator";
  indicator.className = "selection-indicator";
  indicator.textContent = "No selection";
  canvas.appendChild(indicator);
  dashboardSelectionRect = document.createElement("div");
  dashboardSelectionRect.className = "selection-box";
  canvas.appendChild(dashboardSelectionRect);
  installTouchSurface(canvas, "dashboard");
  canvas.addEventListener("mousedown", (e) => {
    const card = e.target.closest(".project-card");
    const item = e.target.closest(".overview-item");
    if (card || item) return;
    const rect = canvas.getBoundingClientRect();
    const shouldPan =
      e.button === 1 || (e.button === 0 && dashboardTool === "pan");
    if (shouldPan) {
      setOverviewSelection(null);
      getDashboardSpatialNav().beginPan(e.clientX - rect.left, e.clientY - rect.top);
      dashboardPanActive = true;
      canvas.classList.add("panning");
      return;
    }
    if (e.button !== 0 || dashboardTool !== "select") return;
    setOverviewSelection(null);
    dashboardSelectionMode = "marquee";
    dashboardSelectionStart = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    dashboardSelectionRect.style.display = "block";
    dashboardSelectionRect.style.left = dashboardSelectionStart.x + "px";
    dashboardSelectionRect.style.top = dashboardSelectionStart.y + "px";
    dashboardSelectionRect.style.width = "0px";
    dashboardSelectionRect.style.height = "0px";
  });
  canvas.addEventListener("dblclick", (e) => {
    if (e.target !== canvas) return;
    const rect = canvas.getBoundingClientRect();
    newProjectPosition = {
      x: Math.max(
        60,
        Math.round(
          (e.clientX - rect.left - dashboardViewOffset.x) /
            dashboardScale -
            200,
        ),
      ),
      y: Math.max(
        60,
        Math.round(
          (e.clientY - rect.top - dashboardViewOffset.y) /
            dashboardScale -
            120,
        ),
      ),
    };
    openNewProjectModal();
  });
  canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    syncCtxMenuSurface("dashboard");
    presentationCtxMenuObjectId = null;
    presentationCtxMenuItemId = null;
    presentationCtxMenuConnId = null;
    const cardEl = e.target.closest(".project-card");
    const itemEl = e.target.closest(".overview-item");
    if (cardEl) {
      const projectId = cardEl.dataset.projectId;
      if (projectId && !selectedProjectIds.has(projectId)) {
        setOverviewSelection({ type: "project", id: projectId });
      }
    } else if (itemEl) {
      const itemId = itemEl.dataset.itemId;
      if (itemId && !selectedOverviewItemIds.has(itemId)) {
        setOverviewSelection({ type: "item", id: itemId });
      }
    }
    document.getElementById("ctx-node-section").style.display = "none";
    document.getElementById("ctx-conn-section").style.display = "none";
    document.getElementById("ctx-dashboard-section").style.display =
      selectedProjectIds.size || selectedOverviewItemIds.size
        ? "block"
        : "none";
    const m = document.getElementById("ctx-menu");
    m.style.left = e.clientX + "px";
    m.style.top = e.clientY + "px";
    m.classList.add("visible");
  });
  canvas.addEventListener(
    "wheel",
    (e) => {
      getDashboardSpatialNav().wheel(e);
    },
    { passive: false },
  );
  window.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    if (dashboardSelectionMode === "marquee" && dashboardSelectionRect) {
      const x = Math.min(
        dashboardSelectionStart.x,
        e.clientX - rect.left,
      );
      const y = Math.min(dashboardSelectionStart.y, e.clientY - rect.top);
      const w = Math.abs(
        e.clientX - rect.left - dashboardSelectionStart.x,
      );
      const h = Math.abs(
        e.clientY - rect.top - dashboardSelectionStart.y,
      );
      dashboardSelectionRect.style.left = x + "px";
      dashboardSelectionRect.style.top = y + "px";
      dashboardSelectionRect.style.width = w + "px";
      dashboardSelectionRect.style.height = h + "px";
      selectedProjectIds.clear();
      selectedOverviewItemIds.clear();
      document.querySelectorAll(".project-card").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (
          r.left < rect.left + x + w &&
          r.right > rect.left + x &&
          r.top < rect.top + y + h &&
          r.bottom > rect.top + y
        )
          selectedProjectIds.add(el.dataset.projectId);
      });
      document.querySelectorAll(".overview-item").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (
          r.left < rect.left + x + w &&
          r.right > rect.left + x &&
          r.top < rect.top + y + h &&
          r.bottom > rect.top + y
        )
          selectedOverviewItemIds.add(el.dataset.itemId);
      });
      applyOverviewSelectionClasses();
      return;
    }
    const dashNav = dashboardSpatialNav;
    if (dashNav?.isPanningActive()) {
      dashNav.movePan(e.clientX - rect.left, e.clientY - rect.top);
      return;
    }
    if (dashboardGroupDragProjects) {
      const worldX =
        (e.clientX - rect.left - dashboardViewOffset.x) / dashboardScale;
      const worldY =
        (e.clientY - rect.top - dashboardViewOffset.y) / dashboardScale;
      const dx = worldX - dashboardGroupDragStart.x;
      const dy = worldY - dashboardGroupDragStart.y;
      dashboardGroupDragProjects.forEach((entry) => {
        const p = projects.find((x) => x.id === entry.id);
        const el = document.querySelector(
          `.project-card[data-project-id="${entry.id}"]`,
        );
        if (!p || !el) return;
        p.x = Math.max(20, Math.round(entry.startX + dx));
        p.y = Math.max(20, Math.round(entry.startY + dy));
        el.style.left = p.x + "px";
        el.style.top = p.y + "px";
      });
      dashboardDragMoved = true;
      return;
    }
    if (dashboardGroupDragItems) {
      const worldX =
        (e.clientX - rect.left - dashboardViewOffset.x) / dashboardScale;
      const worldY =
        (e.clientY - rect.top - dashboardViewOffset.y) / dashboardScale;
      const dx = worldX - dashboardGroupDragStart.x;
      const dy = worldY - dashboardGroupDragStart.y;
      dashboardGroupDragItems.forEach((entry) => {
        const item = overviewItems.find((x) => x.id === entry.id);
        const el = document.querySelector(
          `.overview-item[data-item-id="${entry.id}"]`,
        );
        if (!item || !el) return;
        item.x = Math.round(entry.startX + dx);
        item.y = Math.round(entry.startY + dy);
        el.style.left = item.x + "px";
        el.style.top = item.y + "px";
      });
      return;
    }
    if (overviewDragItemId) {
      const item = overviewItems.find((x) => x.id === overviewDragItemId);
      const el = document.querySelector(
        `.overview-item[data-item-id="${overviewDragItemId}"]`,
      );
      if (!item || !el) return;
      const prevX = item.x;
      const prevY = item.y;
      item.x = Math.round(
        (e.clientX - rect.left - dashboardViewOffset.x) / dashboardScale -
          overviewDragOffset.x,
      );
      item.y = Math.round(
        (e.clientY - rect.top - dashboardViewOffset.y) / dashboardScale -
          overviewDragOffset.y,
      );
      el.style.left = item.x + "px";
      el.style.top = item.y + "px";
      if (item.type === "category") {
        moveProjectsByIds(
          getCategoryObjectLinkedProjectIds(item),
          item.x - prevX,
          item.y - prevY,
        );
      }
      return;
    }
    if (overviewResizeItemId) {
      const item = overviewItems.find(
        (x) => x.id === overviewResizeItemId,
      );
      const el = document.querySelector(
        `.overview-item[data-item-id="${overviewResizeItemId}"]`,
      );
      if (!item || !el) return;
      const dx = (e.clientX - overviewResizeStart.x) / dashboardScale,
        dy = (e.clientY - overviewResizeStart.y) / dashboardScale;
      let w = overviewResizeStart.w,
        h = overviewResizeStart.h,
        x = overviewResizeStart.startX,
        y = overviewResizeStart.startY;
      if (overviewResizeStart.dir.includes("r"))
        w = Math.max(160, Math.round(overviewResizeStart.w + dx));
      if (overviewResizeStart.dir.includes("l")) {
        w = Math.max(160, Math.round(overviewResizeStart.w - dx));
        x = Math.round(
          overviewResizeStart.startX + (overviewResizeStart.w - w),
        );
      }
      if (overviewResizeStart.dir.includes("b"))
        h = Math.max(100, Math.round(overviewResizeStart.h + dy));
      if (overviewResizeStart.dir.includes("t")) {
        h = Math.max(100, Math.round(overviewResizeStart.h - dy));
        y = Math.round(
          overviewResizeStart.startY + (overviewResizeStart.h - h),
        );
      }
      const min = getOverviewItemMinSize(item, el);
      w = Math.max(w, min.w || 0);
      h = Math.max(h, min.h || 0);
      if (overviewResizeStart.dir.includes("l"))
        x = Math.round(overviewResizeStart.startX + (overviewResizeStart.w - w));
      if (overviewResizeStart.dir.includes("t"))
        y = Math.round(overviewResizeStart.startY + (overviewResizeStart.h - h));
      item.w = w;
      item.h = h;
      item.x = x;
      item.y = y;
      el.style.left = item.x + "px";
      el.style.top = item.y + "px";
      el.style.width = item.w + "px";
      el.style.height = item.h + "px";
      return;
    }
    if (dashboardResizeProjectId) {
      const p = projects.find((x) => x.id === dashboardResizeProjectId);
      const el = document.querySelector(
        `.project-card[data-project-id="${dashboardResizeProjectId}"]`,
      );
      if (!p || !el) return;
      const dx = (e.clientX - dashboardResizeStart.x) / dashboardScale,
        dy = (e.clientY - dashboardResizeStart.y) / dashboardScale;
      let w = dashboardResizeStart.w,
        h = dashboardResizeStart.h,
        x = dashboardResizeStart.startX,
        y = dashboardResizeStart.startY;
      if (dashboardResizeStart.dir.includes("r"))
        w = Math.max(
          DEFAULT_PROJECT_CARD_WIDTH,
          Math.round(dashboardResizeStart.w + dx),
        );
      if (dashboardResizeStart.dir.includes("l")) {
        w = Math.max(
          DEFAULT_PROJECT_CARD_WIDTH,
          Math.round(dashboardResizeStart.w - dx),
        );
        x = Math.round(
          dashboardResizeStart.startX + (dashboardResizeStart.w - w),
        );
      }
      if (dashboardResizeStart.dir.includes("b"))
        h = Math.max(
          DEFAULT_PROJECT_CARD_HEIGHT,
          Math.round(dashboardResizeStart.h + dy),
        );
      if (dashboardResizeStart.dir.includes("t")) {
        h = Math.max(
          DEFAULT_PROJECT_CARD_HEIGHT,
          Math.round(dashboardResizeStart.h - dy),
        );
        y = Math.round(
          dashboardResizeStart.startY + (dashboardResizeStart.h - h),
        );
      }
      const min = getProjectMinSize(p);
      w = Math.max(w, min.w);
      h = Math.max(h, min.h);
      if (dashboardResizeStart.dir.includes("l"))
        x = Math.round(
          dashboardResizeStart.startX + (dashboardResizeStart.w - w),
        );
      if (dashboardResizeStart.dir.includes("t"))
        y = Math.round(
          dashboardResizeStart.startY + (dashboardResizeStart.h - h),
        );
      p.w = w;
      p.h = h;
      p.x = x;
      p.y = y;
      el.style.left = p.x + "px";
      el.style.top = p.y + "px";
      el.style.width = p.w + "px";
      el.style.height = p.h + "px";
      return;
    }
    if (!dashboardDragProjectId) return;
    const p = projects.find((x) => x.id === dashboardDragProjectId);
    if (!p) return;
    p.x = Math.max(
      20,
      Math.round(
        (e.clientX - rect.left - dashboardViewOffset.x) / dashboardScale -
          dashboardDragOffset.x,
      ),
    );
    p.y = Math.max(
      20,
      Math.round(
        (e.clientY - rect.top - dashboardViewOffset.y) / dashboardScale -
          dashboardDragOffset.y,
      ),
    );
    const el = document.querySelector(
      `.project-card[data-project-id="${p.id}"]`,
    );
    if (el) {
      el.style.left = p.x + "px";
      el.style.top = p.y + "px";
    }
    dashboardDragMoved = true;
  });
  window.addEventListener("mouseup", () => {
    if (dashboardSelectionMode === "marquee" && dashboardSelectionRect) {
      dashboardSelectionMode = null;
      dashboardSelectionRect.style.display = "none";
      overviewSelection =
        selectedProjectIds.size === 1
          ? { type: "project", id: [...selectedProjectIds][0] }
          : selectedOverviewItemIds.size === 1
            ? { type: "item", id: [...selectedOverviewItemIds][0] }
            : null;
    }
    if (dashboardSpatialNav?.isPanningActive()) {
      dashboardSpatialNav.endPan();
      dashboardPanActive = false;
      canvas.classList.remove("panning");
    }
    if (dashboardGroupDragProjects) {
      const movedProjectIds = dashboardGroupDragProjects.map(
        (entry) => entry.id,
      );
      dashboardGroupDragProjects = null;
      dashboardGroupDragStart = null;
      document
        .querySelectorAll(".project-card.dragging")
        .forEach((el) => el.classList.remove("dragging"));
      movedProjectIds.forEach((id) => {
        const p = projects.find((x) => x.id === id);
        if (p) saveToFirestore(p);
      });
    }
    if (dashboardGroupDragItems) {
      dashboardGroupDragItems = null;
      dashboardGroupDragStart = null;
      queueOverviewSave();
    }
    if (dashboardDragProjectId) {
      const p = projects.find((x) => x.id === dashboardDragProjectId);
      const el = document.querySelector(
        `.project-card[data-project-id="${dashboardDragProjectId}"]`,
      );
      if (el) el.classList.remove("dragging");
      if (p && dashboardDragMoved) queueProjectSave(p);
      setTimeout(() => {
        dashboardDragMoved = false;
      }, 20);
      dashboardDragProjectId = null;
    }
    if (dashboardResizeProjectId) {
      const p = projects.find((x) => x.id === dashboardResizeProjectId);
      if (p) queueProjectSave(p);
      dashboardResizeProjectId = null;
      dashboardResizeStart = null;
    }
    if (overviewDragItemId) {
      const item = overviewItems.find((x) => x.id === overviewDragItemId);
      queueOverviewSave();
      if (item?.type === "category") {
        getCategoryObjectLinkedProjectIds(item).forEach((projectId) => {
          const project = projects.find((entry) => entry.id === projectId);
          if (project) queueProjectSave(project);
        });
      }
      overviewDragItemId = null;
    }
    if (overviewResizeItemId) {
      queueOverviewSave();
      overviewResizeItemId = null;
      overviewResizeStart = null;
    }
  });
  document.addEventListener("keydown", (e) => {
    if (
      document.getElementById("screen-dashboard").style.display === "none"
    )
      return;
    if (
      e.target.tagName === "INPUT" ||
      e.target.tagName === "TEXTAREA" ||
      e.target.hasAttribute("contenteditable")
    )
      return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
      e.preventDefault();
      copyCurrentSelection();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
      e.preventDefault();
      pasteClipboardSelection();
      return;
    }
    if (e.key === "Delete" || e.key === "Backspace")
      deleteOverviewSelection();
  });
}

// ===================== NODES =====================
function makeNode(type, x, y, data) {
  const id = "n" + nodeIdCounter++;
  if (isSharedTextObjectType(type)) {
    return createSharedTextObjectState(id, type, x, y, data, SURFACES.CANVAS);
  }
  if (type === "line")
    return {
      id,
      type,
      x,
      y,
      w: Math.max(LINE_MIN_LENGTH, data.w || 220),
      h: LINE_NODE_HEIGHT,
      lineAngle: Number.isFinite(data.lineAngle) ? data.lineAngle : 0,
    };
  if (type === "bullet")
    return {
      id,
      type,
      x,
      y,
      items: (data.items || ["Item 1"]).map((item) =>
        typeof item === "string" ? { text: item, done: false } : item,
      ),
      bulletFeatures: {
        checklist: !!data?.bulletFeatures?.checklist,
        connectors: !!data?.bulletFeatures?.connectors,
      },
    };
  if (type === "progress")
    return {
      id,
      type,
      x,
      y,
      title: data.title || "Progress",
      value: data.value || 0,
      steps: data.steps || [],
    };
  if (type === "file")
    return {
      id,
      type,
      x,
      y,
      name: data.name || "File",
      ext: data.ext || "FILE",
      size: data.size || "",
      src: data.src || null,
      assetId: data.assetId || "",
      mime: data.mime || "",
      fileKind: data.fileKind || (data.src ? "image" : "file"),
      uploading: false,
    };
  if (type === "embed")
    return {
      id,
      type,
      x,
      y,
      url: data.url || "",
      title: data.title || "Embed",
      w: data.w || 320,
      h: data.h || 220,
    };
  return { id, type, x, y, customTitle: data.customTitle || "" };
}

function duplicateProject(project, dx = 36, dy = 36) {
  const clone = JSON.parse(JSON.stringify(project));
  clone.id = "p" + Date.now() + Math.floor(Math.random() * 10000);
  clone.x = Math.max(20, Math.round((project.x || 0) + dx));
  clone.y = Math.max(20, Math.round((project.y || 0) + dy));
  clone.created = Date.now();
  return clone;
}

function duplicateOverviewItem(item, dx = 36, dy = 36) {
  const clone = JSON.parse(JSON.stringify(item));
  clone.id = "o" + Date.now() + Math.floor(Math.random() * 1000);
  clone.type = canonicalObjectType(clone.type);
  clone.x = Math.round((item.x || 0) + dx);
  clone.y = Math.round((item.y || 0) + dy);
  return clone;
}

function duplicateNodeData(node, dx = 36, dy = 36) {
  const clone = JSON.parse(JSON.stringify(node));
  clone.id = "n" + nodeIdCounter++;
  clone.type = canonicalObjectType(clone.type);
  clone.x = Math.round((node.x || 0) + dx);
  clone.y = Math.round((node.y || 0) + dy);
  return clone;
}

function duplicateNodeSelection(dx = 36, dy = 36) {
  const selectedIds = [...selectedNodeIds];
  if (!selectedIds.length) return [];
  const idMap = new Map();
  const clones = selectedIds
    .map((id) => nodes.find((node) => node.id === id))
    .filter(Boolean)
    .map((node) => {
      const clone = duplicateNodeData(node, dx, dy);
      idMap.set(node.id, clone.id);
      return clone;
    });
  const clonedConnections = connections
    .filter(
      (connection) =>
        idMap.has(connection.fromId) && idMap.has(connection.toId),
    )
    .map((connection) => ({
      ...JSON.parse(JSON.stringify(connection)),
      id: "c" + connIdCounter++,
      fromId: idMap.get(connection.fromId),
      toId: idMap.get(connection.toId),
    }));
  nodes.push(...clones);
  connections.push(...clonedConnections);
  selectedNodeIds.clear();
  clones.forEach((clone) => selectedNodeIds.add(clone.id));
  selectedNode = clones.length === 1 ? clones[0] : null;
  renderAll();
  applyNodeSelectionClasses();
  autosave();
  return clones;
}

function copyCurrentSelection() {
  if (currentProject) {
    const selectedIds = [...selectedNodeIds];
    if (!selectedIds.length) return false;
    appClipboard = {
      scope: "canvas",
      nodes: selectedIds
        .map((id) => nodes.find((node) => node.id === id))
        .filter(Boolean)
        .map((node) => JSON.parse(JSON.stringify(node))),
      connections: connections
        .filter(
          (connection) =>
            selectedNodeIds.has(connection.fromId) &&
            selectedNodeIds.has(connection.toId),
        )
        .map((connection) => JSON.parse(JSON.stringify(connection))),
    };
    showToast("Copied");
    return true;
  }
  const copiedProjects = [...selectedProjectIds]
    .map((id) => projects.find((project) => project.id === id))
    .filter(Boolean)
    .map((project) => JSON.parse(JSON.stringify(project)));
  const copiedItems = [...selectedOverviewItemIds]
    .map((id) => overviewItems.find((item) => item.id === id))
    .filter(Boolean)
    .map((item) => JSON.parse(JSON.stringify(item)));
  if (!copiedProjects.length && !copiedItems.length) return false;
  appClipboard = {
    scope: "dashboard",
    projects: copiedProjects,
    items: copiedItems,
  };
  showToast("Copied");
  return true;
}

function pasteClipboardSelection() {
  if (!appClipboard) return false;
  if (currentProject && appClipboard.scope === "canvas") {
    const idMap = new Map();
    const clones = (appClipboard.nodes || []).map((node) => {
      const clone = duplicateNodeData(node, 42, 42);
      idMap.set(node.id, clone.id);
      return clone;
    });
    const clonedConnections = (appClipboard.connections || [])
      .filter(
        (connection) =>
          idMap.has(connection.fromId) && idMap.has(connection.toId),
      )
      .map((connection) => ({
        ...JSON.parse(JSON.stringify(connection)),
        id: "c" + connIdCounter++,
        fromId: idMap.get(connection.fromId),
        toId: idMap.get(connection.toId),
      }));
    nodes.push(...clones);
    connections.push(...clonedConnections);
    selectedNodeIds.clear();
    clones.forEach((clone) => selectedNodeIds.add(clone.id));
    selectedNode = clones.length === 1 ? clones[0] : null;
    renderAll();
    applyNodeSelectionClasses();
    autosave();
    showToast("Pasted");
    return true;
  }
  if (!currentProject && appClipboard.scope === "dashboard") {
    const clonedProjects = (appClipboard.projects || []).map((project) =>
      duplicateProject(project, 42, 42),
    );
    const clonedItems = (appClipboard.items || []).map((item) =>
      duplicateOverviewItem(item, 42, 42),
    );
    projects.push(...clonedProjects);
    overviewItems.push(...clonedItems);
    selectedProjectIds.clear();
    selectedOverviewItemIds.clear();
    clonedProjects.forEach((project) => selectedProjectIds.add(project.id));
    clonedItems.forEach((item) => selectedOverviewItemIds.add(item.id));
    renderDashboard();
    clonedProjects.forEach((project) => queueProjectSave(project));
    if (clonedItems.length) queueOverviewSave();
    applyOverviewSelectionClasses();
    showToast("Pasted");
    return true;
  }
  return false;
}

// ===================== CANVAS =====================
function openProject(id, sourceScreen = "dashboard") {
  currentProject = projects.find((p) => p.id === id);
  if (!currentProject) return;
  canvasReturnScreen = sourceScreen;
  nodes = normalizeNodeDataList(
    JSON.parse(JSON.stringify(currentProject.nodes || [])),
  );
  connections = JSON.parse(
    JSON.stringify(currentProject.connections || []),
  );
  nodes.forEach((n) => {
    const num = parseInt(n.id.replace("n", ""));
    if (!isNaN(num) && num >= nodeIdCounter) nodeIdCounter = num + 1;
  });
  connections.forEach((c) => {
    const num = parseInt(c.id.replace("c", ""));
    if (!isNaN(num) && num >= connIdCounter) connIdCounter = num + 1;
  });
  const titleEl = document.getElementById("canvas-project-title");
  if (titleEl) {
    titleEl.textContent = currentProject.name || "";
    applyTextDirection(titleEl);
  }
  updateCanvasPathbar();
  viewOffset = { x: 0, y: 0 };
  viewScale = targetScale = 1;
  show("canvas");
  saveLastView("canvas", currentProject.id);
  renderAll();
  setTimeout(resetView, 60);
  updateInfoBar();
  startMinimapLoop();
  const backBtn = document.getElementById("back-btn");
  if (backBtn)
    backBtn.textContent =
      sourceScreen === "presentation" ? "← Presentation" : "←";
}

function goToDashboard() {
  autosave();
  if (minimapRAF) {
    cancelAnimationFrame(minimapRAF);
    minimapRAF = null;
  }
  currentProject = null;
  const backBtn = document.getElementById("back-btn");
  if (backBtn) backBtn.textContent = "←";
  if (canvasReturnScreen === "presentation") {
    show("presentation");
    renderPresentationScreen();
    saveLastView("presentation", null, currentPresentation?.id || null);
    return;
  }
  show("dashboard");
  saveLastView("dashboard");
  renderDashboard();
  setTimeout(dashboardResetView, 60);
}

function renderAll() {
  applyTransform();
  renderNodes();
  renderConnections();
  updateInfoBar();
}

function getLineEndpoints(nd) {
  const width = Math.max(LINE_MIN_LENGTH, Number(nd?.w) || 220);
  const height = Number(nd?.h) || LINE_NODE_HEIGHT;
  const angle = Number(nd?.lineAngle) || 0;
  const center = {
    x: (nd?.x || 0) + width / 2,
    y: (nd?.y || 0) + height / 2,
  };
  const dx = Math.cos(angle) * (width / 2);
  const dy = Math.sin(angle) * (width / 2);
  return {
    start: { x: center.x - dx, y: center.y - dy },
    end: { x: center.x + dx, y: center.y + dy },
    center,
  };
}

function setLineFromEndpoints(nd, start, end) {
  const length = Math.max(
    LINE_MIN_LENGTH,
    Math.hypot((end?.x || 0) - (start?.x || 0), (end?.y || 0) - (start?.y || 0)),
  );
  const centerX = ((start?.x || 0) + (end?.x || 0)) / 2;
  const centerY = ((start?.y || 0) + (end?.y || 0)) / 2;
  nd.w = Math.round(length);
  nd.h = LINE_NODE_HEIGHT;
  nd.lineAngle = Math.atan2(
    (end?.y || 0) - (start?.y || 0),
    (end?.x || 0) - (start?.x || 0),
  );
  nd.x = Math.round(centerX - nd.w / 2);
  nd.y = Math.round(centerY - nd.h / 2);
}

function applyTransform() {
  getCanvasSpatialNav().apply();
}

// ===================== NODE RENDERING =====================
function renderNodes() {
  document.querySelectorAll(".node").forEach((n) => n.remove());
  nodes.forEach((nd) => {
    const el = createNodeEl(nd);
    document.getElementById("canvas-world").appendChild(el);
    enforceNodeMinSize(nd, el);
    syncImageFileNodeSize(nd, el);
  });
}

function applyNodeSelectionClasses() {
  const indicator = document.getElementById("canvas-selection-indicator");
  document.querySelectorAll(".node").forEach((el) => {
    const isSelected = selectedNodeIds.has(el.id.replace("node-", ""));
    el.classList.toggle(
      "selected",
      isSelected && selectedNodeIds.size === 1,
    );
    el.classList.toggle(
      "multi-selected",
      isSelected && selectedNodeIds.size > 1,
    );
  });
  if (indicator) {
    indicator.textContent = selectedNodeIds.size
      ? `${selectedNodeIds.size} selected`
      : "No selection";
    indicator.classList.toggle("visible", selectedNodeIds.size > 1);
  }
}

function createNodeEl(nd) {
  const el = document.createElement("div");
  el.className = `node node-${nd.type}`;
  const isFileNode = nd.type === "file";
  const isImageFile = isFileNode && nd.fileKind === "image";
  const isLiveEmbed = nd.type === "embed" && !!String(nd.url || "").trim();
  if (isImageFile) el.classList.add("is-image-file");
  if (isLiveEmbed) el.classList.add("is-live-embed");
  el.id = `node-${nd.id}`;
  el.style.left = nd.x + "px";
  el.style.top = nd.y + "px";
  if (nd.type !== "heading" && nd.w) el.style.width = nd.w + "px";
  if (nd.type !== "heading" && nd.h) el.style.height = nd.h + "px";
  if (nd.type === "line") {
    el.style.transform = `rotate(${Number(nd.lineAngle) || 0}rad)`;
  }
  if (selectedNodeIds.has(nd.id))
    el.classList.add(
      selectedNodeIds.size > 1 ? "multi-selected" : "selected",
    );
  const labels = {
    text: "Note",
    heading: "Heading",
    line: "Line",
    bullet: "Bullets",
    progress: "Progress",
    file: "File",
    embed: "Embed",
    note: "Note",
    frame: "Annotate",
  };
  const nodeTitle = nd.customTitle ?? labels[nd.type] ?? nd.type;
  const fileLinkHref = getFileNodeLinkHref(nd);
  const fileLinkLabel = getFileNodeLinkLabel(nd);
  const isSharedNoteNode = usesUnifiedNoteObjectBehavior(nd.type);
  const nodeHandleMarkup =
    nd.type === "heading"
      ? `
    <div class="conn-handle" data-node="${nd.id}" data-pos="top"></div>
    <div class="conn-handle" data-node="${nd.id}" data-pos="bottom"></div>
    <div class="conn-handle" data-node="${nd.id}" data-pos="left"></div>
    <div class="conn-handle" data-node="${nd.id}" data-pos="right"></div>`
      : `
    <div class="conn-handle" data-node="${nd.id}" data-pos="top"></div>
    <div class="conn-handle" data-node="${nd.id}" data-pos="bottom"></div>
    <div class="conn-handle" data-node="${nd.id}" data-pos="left"></div>
    <div class="conn-handle" data-node="${nd.id}" data-pos="right"></div>
    <div class="node-resize-handle resize-tl" data-dir="tl"></div>
    <div class="node-resize-handle resize-tr" data-dir="tr"></div>
    <div class="node-resize-handle resize-bl" data-dir="bl"></div>
    <div class="node-resize-handle resize-br" data-dir="br"></div>`;
  el.innerHTML = `${buildNodeShell(nd, {
        editable: true,
        accent: currentProject?.color || "#333",
        label: nodeTitle,
        fileLinkHref,
        fileLinkLabel,
        actionsHTML: `<button class="node-act-btn node-settings-btn" type="button">⋮</button><button class="node-act-btn" onclick="requestDeleteNodeById('${nd.id}')">✕</button>`,
        settingsHTML: `<div class="node-settings">${nodeSettingsHTML(nd)}</div>`,
      }).html}
    ${nodeHandleMarkup}`;

  if (isSharedNoteNode) {
    bindUnifiedNoteObjectBehavior({
      el,
      type: nd.type,
      contentEditableDragMode:
        nd.type === "heading" ? "deferHeading" : "default",
      beforeDeferHeadingDrag:
        nd.type === "heading" ? (e) => currentTool === "connect" : null,
      onCommit: (text) => {
        nd.text = text;
        autosave();
      },
      onLabelCommit: (label) => {
        nd.customTitle =
          nd.type === "heading" ? label || "Heading" : label;
        autosave();
      },
      onPointerDown: (e) => {
        if (currentTool === "connect") return;
        e.stopPropagation();
        if (e.altKey) {
          selectNode(nd.id, e.shiftKey || selectedNodeIds.has(nd.id));
          if (duplicateCanvasSelectionForDrag()) {
            isDragging = false;
            nodeGroupDragIds = [...selectedNodeIds]
              .map((id) => {
                const node = nodes.find((n) => n.id === id);
                return node
                  ? { id: node.id, startX: node.x, startY: node.y }
                  : null;
              })
              .filter(Boolean);
            const wp = s2w(e.clientX, e.clientY);
            nodeGroupDragStart = { x: wp.x, y: wp.y };
            return;
          }
        }
        selectNode(nd.id, e.shiftKey || selectedNodeIds.has(nd.id));
        isDragging = true;
        if (selectedNodeIds.has(nd.id) && selectedNodeIds.size > 1) {
          isDragging = false;
          nodeGroupDragIds = [...selectedNodeIds]
            .map((id) => {
              const node = nodes.find((n) => n.id === id);
              return node
                ? { id: node.id, startX: node.x, startY: node.y }
                : null;
            })
            .filter(Boolean);
          const wp = s2w(e.clientX, e.clientY);
          nodeGroupDragStart = { x: wp.x, y: wp.y };
          return;
        }
        const wp = s2w(e.clientX, e.clientY);
        dragOffset = { x: wp.x - nd.x, y: wp.y - nd.y };
      },
      onResizeStart: (e, dir) => {
        selectNode(nd.id);
        isResizingNode = true;
        resizingNodeId = nd.id;
        nodeResizeStart = {
          x: e.clientX,
          y: e.clientY,
          w: el.offsetWidth,
          h: el.offsetHeight,
          dir,
          startX: nd.x,
          startY: nd.y,
        };
      },
    });
  } else {
    el.addEventListener("mousedown", (e) => {
      if (
        e.target.classList.contains("conn-handle") ||
        e.target.classList.contains("line-end-handle") ||
        e.target.classList.contains("node-act-btn") ||
        e.target.classList.contains("node-resize-handle") ||
        e.target.closest(".node-settings") ||
        e.target.closest(".node-file-topbar") ||
        e.target.closest(".node-embed-topbar")
      )
        return;
      if (
        e.target.tagName === "INPUT" ||
        e.target.tagName === "TEXTAREA" ||
        e.target.tagName === "A"
      )
        return;
      if (e.target.isContentEditable && !e.altKey) {
        return;
      }
      if (currentTool === "connect") return;
      canvasNodeDragFromPointer(nd, el, e);
    });
  }
  if (nd.type === "line") {
    el.querySelectorAll(".line-end-handle").forEach((handle) => {
      handle.addEventListener("mousedown", (e) => {
        e.stopPropagation();
        e.preventDefault();
        selectNode(nd.id);
        const endpoints = getLineEndpoints(nd);
        lineEndpointDrag = {
          nodeId: nd.id,
          endpoint: handle.dataset.end,
          anchor:
            handle.dataset.end === "start"
              ? endpoints.end
              : endpoints.start,
        };
      });
    });
  }
  if (!isSharedNoteNode) el.addEventListener("dblclick", (e) => {
    if (e.target.isContentEditable) return;
    const c = el.querySelector(".node-content");
    if (c) {
      c.focus();
      saAll(c);
    }
  });
  el.querySelectorAll(".conn-handle").forEach((h) => {
    h.addEventListener("mousedown", (e) => {
      e.stopPropagation();
      e.preventDefault();
      pendingConn = {
        nodeId: nd.id,
        pos: h.dataset.pos,
        bulletIndex:
          h.dataset.bulletIndex !== undefined
            ? Number(h.dataset.bulletIndex)
            : null,
      };
      pendingConnCursor = { x: e.clientX, y: e.clientY };
      pendingConnTarget = null;
      setTool("connect");
      requestConnectionRender();
    });
  });
  if (!isSharedNoteNode) el.querySelectorAll(".node-resize-handle").forEach((h) =>
    h.addEventListener("mousedown", (e) => {
      e.stopPropagation();
      e.preventDefault();
      selectNode(nd.id);
      isResizingNode = true;
      resizingNodeId = nd.id;
      nodeResizeStart = {
        x: e.clientX,
        y: e.clientY,
        w: el.offsetWidth,
        h: el.offsetHeight,
        dir: h.dataset.dir,
        startX: nd.x,
        startY: nd.y,
      };
    }),
  );
  if (!isSharedNoteNode) el.querySelector(".node-settings-btn")?.addEventListener(
    "click",
    (e) => {
      e.stopPropagation();
      document
        .querySelectorAll(".node-settings.open")
        .forEach((panel) => {
          if (panel !== el.querySelector(".node-settings"))
            panel.classList.remove("open");
        });
      el.querySelector(".node-settings")?.classList.toggle("open");
    },
  );
  if (nd.type === "progress") {
    const bar = el.querySelector(".progress-bar-bg");
    if (bar)
      bar.addEventListener("click", (e) => {
        const r = bar.getBoundingClientRect();
        nd.value = Math.max(
          0,
          Math.min(
            100,
            Math.round(((e.clientX - r.left) / r.width) * 100),
          ),
        );
        const fill = bar.querySelector(".progress-bar-fill"),
          val = el.querySelector(".progress-val");
        if (fill) fill.style.width = nd.value + "%";
        if (val) val.textContent = nd.value + "%";
        autosave();
      });
    el.querySelectorAll(".step-check").forEach((ch, i) => {
      ch.addEventListener("click", () => {
        nd.steps[i].done = !nd.steps[i].done;
        ch.classList.toggle("done", nd.steps[i].done);
        ch.textContent = nd.steps[i].done ? "✓" : "";
        autosave();
      });
    });
  }
  if (nd.type === "file")
    el
      .querySelector(nd.fileKind === "image" ? ".img-wrap" : ".doc-wrap")
      ?.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      imageNodeTarget = nd.id;
      const fi = document.getElementById("file-input");
      fi.accept = "*";
      fi.click();
    });
  if (nd.type === "bullet") {
    const body = el.querySelector(".node-body");
    body.classList.toggle("has-checks", !!nd.bulletFeatures?.checklist);
    body.classList.toggle(
      "has-connectors",
      !!nd.bulletFeatures?.connectors,
    );
    el.querySelector(".bullet-add-btn")?.addEventListener("click", () => {
      nd.items.push({ text: "New item", done: false });
      refreshBulletNodeContent(nd, el, nd.items.length - 1);
      autosave();
    });
    bindBulletNode(nd, el);
  }
  if (isSharedTextObjectType(nd.type) && !isSharedNoteNode) {
    const editorTarget =
      nd.type === "heading"
        ? el.querySelector(".content")
        : el.querySelector(".node-content");
    bindSharedTextObjectEditor(editorTarget, nd.type, (text) => {
      nd.text = text;
      autosave();
    });
  }
  applyTextDirectionToAll(el);
  bindNodeSettings(nd, el);
  if (nd.type === "embed") {
    const input =
      el.querySelector(".embed-input") ||
      el.querySelector(".embed-settings-input");
    const preview = el.querySelector(".embed-preview");
    if (input && preview) {
      input.addEventListener("change", () => {
        nd.url = input.value.trim();
        renderAll();
        applyNodeSelectionClasses();
        autosave();
      });
      input.addEventListener("blur", () => {
        nd.url = input.value.trim();
        renderAll();
        applyNodeSelectionClasses();
        autosave();
      });
    }
  }
  el.querySelectorAll("[contenteditable]").forEach((ce) => {
    if (!ce.dataset.sharedObjectEditorBound) bindPlainTextPaste(ce);
    if (ce.dataset.sharedObjectEditorBound) return;
    ce.addEventListener("blur", () => {
      updateNodeFromEl(nd);
      autosave();
    });
  });
  return el;
}

function getNodeMinSize(nd, el) {
  const headerHeight = el?.querySelector(".node-header")?.offsetHeight || 28;
  const body = el?.querySelector(".node-body");
  const bodyHeight = body?.scrollHeight || 0;
  if (nd.type === "heading") {
    const contentEl = body?.querySelector(".node-content");
    const contentRect = contentEl?.getBoundingClientRect();
    const text = body?.querySelector(".node-content")?.textContent || nd.text || "";
    const estimatedWidth = estimateTextMinWidth(text, {
      min: 24,
      max: 640,
      base: 24,
      charWidth: 10,
    });
    return {
      w: Math.max(
        24,
        Math.ceil(contentRect?.width || estimatedWidth),
      ),
      h: Math.max(
        22,
        Math.ceil(contentRect?.height || bodyHeight || 22),
      ),
    };
  }
  if (nd.type === "line") {
    return {
      w: LINE_MIN_LENGTH,
      h: LINE_NODE_HEIGHT,
    };
  }
  let contentWidth = 0;
  const base = {
    w: 160,
    h: headerHeight + 44,
  };
  if (isUnifiedTextNoteType(nd.type)) {
    base.w = 180;
    base.h = headerHeight + 56;
    contentWidth = estimateTextMinWidth(
      body?.querySelector(".node-content")?.textContent || nd.text || "",
      {
        min: base.w,
        max: 280,
        base: 144,
        charWidth: 4,
      },
    );
  } else if (nd.type === "bullet") {
    const list = body?.querySelector(".bullet-list");
    const items = [...(list?.querySelectorAll("li") || [])];
    const longestTextLength = items.reduce((maxLen, li) => {
      const textEl = li.querySelector(".bullet-item-text");
      const textLength = String(textEl?.textContent || "").trim().length;
      return Math.max(maxLen, textLength);
    }, 0);
    const widthEstimate = 150 + Math.min(longestTextLength, 22) * 5;
    base.w = Math.max(180, Math.min(280, Math.ceil(widthEstimate)));
    base.h = headerHeight + 82;
    contentWidth = base.w;
  } else if (nd.type === "progress") {
    base.w = 260;
    base.h = headerHeight + 118;
    const longestStepLength = (nd.steps || []).reduce(
      (maxLen, step) =>
        Math.max(maxLen, String(step?.label || "").trim().length),
      0,
    );
    contentWidth = Math.max(
      base.w,
      estimateTextMinWidth(
        [nd.title || "", " ".repeat(longestStepLength)].join("\n"),
        {
          min: base.w,
          max: 360,
          base: 188,
          charWidth: 4.5,
        },
      ),
    );
  } else if (nd.type === "file") {
    if (nd.fileKind === "image" && nd.src) {
      return {
        w: 80,
        h: 80,
      };
    }
    base.w = 220;
    base.h =
      nd.fileKind === "image" ? headerHeight + 160 : headerHeight + 84;
    contentWidth =
      nd.fileKind === "image"
        ? 220
        : estimateTextMinWidth(nd.name || "File", {
            min: 220,
            max: 340,
            base: 176,
            charWidth: 5,
          });
  } else if (nd.type === "embed") {
    base.w = 320;
    base.h = 220;
    contentWidth = base.w;
  } else if (nd.type === "frame") {
    base.w = 220;
    base.h = 140;
    contentWidth = estimateTextMinWidth(
      body?.querySelector(".node-content")?.textContent || nd.text || "",
      {
        min: base.w,
        max: 380,
        base: 184,
        charWidth: 5.5,
      },
    );
  } else if (nd.type === "line") {
    base.w = 180;
    base.h = 28;
    contentWidth = base.w;
  } else {
    contentWidth = base.w;
  }
  return {
    w: Math.max(base.w, contentWidth),
    h: Math.max(base.h, Math.ceil(headerHeight + bodyHeight + 20)),
  };
}

function enforceNodeMinSize(nd, el) {
  if (!nd || !el) return false;
  if (nd.type === "heading") return false;
  const min = getNodeMinSize(nd, el);
  let changed = false;
  if ((nd.w || el.offsetWidth) < min.w) {
    nd.w = min.w;
    el.style.width = nd.w + "px";
    changed = true;
  }
  if ((nd.h || el.offsetHeight) < min.h) {
    nd.h = min.h;
    el.style.height = nd.h + "px";
    changed = true;
  }
  return changed;
}

function normalizeEmbedUrl(raw) {
  const url = String(raw || "").trim();
  if (!url) return { type: "empty", src: "" };
  if (/\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(url))
    return { type: "image", src: url };
  if (/\.(mp4|webm|ogg)(\?.*)?$/i.test(url))
    return { type: "video", src: url };
  const yt =
    url.match(/youtube\.com\/watch\?v=([^&]+)/i) ||
    url.match(/youtu\.be\/([^?&]+)/i);
  if (yt)
    return {
      type: "iframe",
      src: `https://www.youtube.com/embed/${yt[1]}`,
    };
  const vimeo = url.match(/vimeo\.com\/(\d+)/i);
  if (vimeo)
    return {
      type: "iframe",
      src: `https://player.vimeo.com/video/${vimeo[1]}`,
    };
  if (/^https?:\/\//i.test(url))
    return {
      type: "website",
      src: url,
      preview: `https://image.thum.io/get/width/1600/noanimate/${url}`,
    };
  return { type: "empty", src: "" };
}

function embedPreviewHTML(url) {
  const embed = normalizeEmbedUrl(url);
  if (embed.type === "image")
    return `<img src="${esc(embed.src)}" alt="">`;
  if (embed.type === "video")
    return `<video src="${esc(embed.src)}" controls playsinline></video>`;
  if (embed.type === "iframe")
    return `<iframe src="${esc(embed.src)}" loading="lazy" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
  if (embed.type === "website")
    return `<img src="${esc(embed.preview)}" alt="" draggable="false">`;
  return `<div class="embed-placeholder">Paste a direct image URL, video URL, YouTube, Vimeo, or embeddable link.</div>`;
}

function nodeBodyHTML(nd) {
  return renderNodeContentHTML(nd, { editable: true });
}

function getBulletItemsFromText(text) {
  const lines = String(text || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  return (lines.length ? lines : ["New item"]).map((line) => ({
    text: line,
    done: false,
  }));
}

function removeBulletConnectionsForNode(nodeId) {
  connections = connections.filter(
    (connection) =>
      !(
        (connection.fromId === nodeId &&
          connection.fromBulletIndex !== null &&
          connection.fromBulletIndex !== undefined) ||
        (connection.toId === nodeId &&
          connection.toBulletIndex !== null &&
          connection.toBulletIndex !== undefined)
      ),
  );
  if (
    pendingConn?.nodeId === nodeId &&
    pendingConn?.bulletIndex !== null &&
    pendingConn?.bulletIndex !== undefined
  ) {
    clearPendingConnection();
  }
}

function convertNodeType(nd, targetType) {
  if (!nd || nd.type === targetType) return;
  updateNodeFromEl(nd);
  if (targetType === "bullet") {
    nd.type = "bullet";
    nd.items = getBulletItemsFromText(nd.text || "");
    nd.bulletFeatures = nd.bulletFeatures || {
      checklist: false,
      connectors: false,
    };
  } else if (targetType === "text") {
    const bulletItems = Array.isArray(nd.items) ? nd.items : [];
    nd.text = bulletItems
      .map((item) =>
        typeof item === "string" ? item : String(item?.text || "").trim(),
      )
      .filter(Boolean)
      .join("\n");
    nd.type = "text";
    removeBulletConnectionsForNode(nd.id);
  } else {
    return;
  }
  renderAll();
  applyNodeSelectionClasses();
  autosave();
}

function nodeSettingsHTML(nd) {
  if (nd.type === "bullet") {
    return `<button class="node-setting-toggle${nd.bulletFeatures?.checklist ? " active" : ""}" type="button" data-feature="checklist"><span>Checklist</span><span class="state">${nd.bulletFeatures?.checklist ? "On" : "Off"}</span></button>
    <button class="node-setting-toggle${nd.bulletFeatures?.connectors ? " active" : ""}" type="button" data-feature="connectors"><span>Connectors</span><span class="state">${nd.bulletFeatures?.connectors ? "On" : "Off"}</span></button>
    <button class="node-setting-toggle" type="button" data-action="convert-to-text"><span>Convert to text</span><span class="state">Plain</span></button>`;
  }
  if (isUnifiedTextNoteType(nd.type)) {
    return `<button class="node-setting-toggle" type="button" data-action="convert-to-bullet"><span>Convert to bullets</span><span class="state">List</span></button>`;
  }
  if (nd.type === "embed") {
    return `<label class="form-label" style="margin-bottom:6px">URL</label>
    <input class="embed-settings-input form-input" type="url" placeholder="Paste website URL" value="${esc(nd.url || "")}" style="margin-bottom:0">`;
  }
  return `<div class="node-settings-empty">No extra settings</div>`;
}

function bindNodeSettings(nd, el) {
  el.querySelectorAll(".node-setting-toggle").forEach((btn) =>
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const feature = btn.dataset.feature;
      const action = btn.dataset.action;
      if (nd.type === "bullet") {
        if (feature) {
          nd.bulletFeatures = nd.bulletFeatures || {
            checklist: false,
            connectors: false,
          };
          nd.bulletFeatures[feature] = !nd.bulletFeatures[feature];
          el.querySelector(".node-body").innerHTML = nodeBodyHTML(nd);
          el.querySelector(".node-settings").innerHTML =
            nodeSettingsHTML(nd);
          bindBulletNode(nd, el);
          bindNodeSettings(nd, el);
          autosave();
          return;
        }
        if (action === "convert-to-text") {
          convertNodeType(nd, "text");
          return;
        }
      }
      if (isUnifiedTextNoteType(nd.type) && action === "convert-to-bullet") {
        convertNodeType(nd, "bullet");
      }
    }),
  );
}

function bulletItemHTML(nd, index) {
  const item = nd.items?.[index] || { text: "", done: false };
  return `<li data-bullet-index="${index}">
    ${nd.bulletFeatures?.checklist ? `<button class="bullet-item-check${item.done ? " done" : ""}" type="button">${item.done ? "✓" : ""}</button>` : ""}
    <span contenteditable="true" class="node-content bullet-item-text">${esc(item.text || "")}</span>
    ${nd.bulletFeatures?.connectors ? `<div class="conn-handle bullet-item-handle" data-node="${nd.id}" data-bullet-index="${index}" data-pos="right"></div>` : ""}
  </li>`;
}

function refreshBulletNodeContent(nd, el, focusIndex = null) {
  const body = el?.querySelector(".node-body");
  if (!body) return;
  body.innerHTML = nodeBodyHTML(nd);
  body.classList.toggle("has-checks", !!nd.bulletFeatures?.checklist);
  body.classList.toggle(
    "has-connectors",
    !!nd.bulletFeatures?.connectors,
  );
  el.querySelector(".bullet-add-btn")?.addEventListener("click", () => {
    nd.items.push({ text: "New item", done: false });
    refreshBulletNodeContent(nd, el, nd.items.length - 1);
    autosave();
  });
  bindBulletNode(nd, el);
  if (focusIndex !== null) {
    const target = el.querySelector(
      `.bullet-list li[data-bullet-index="${focusIndex}"] .bullet-item-text`,
    );
    if (target) {
      target.focus();
      const range = document.createRange();
      range.selectNodeContents(target);
      range.collapse(false);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }
}

function removeBulletItem(nd, el, index) {
  if (!Array.isArray(nd.items) || index < 0 || index >= nd.items.length)
    return;
  nd.items.splice(index, 1);
  connections = connections
    .filter((connection) => {
      if (
        connection.fromId === nd.id &&
        connection.fromBulletIndex === index
      )
        return false;
      if (connection.toId === nd.id && connection.toBulletIndex === index)
        return false;
      return true;
    })
    .map((connection) => {
      if (
        connection.fromId === nd.id &&
        typeof connection.fromBulletIndex === "number" &&
        connection.fromBulletIndex > index
      ) {
        connection.fromBulletIndex -= 1;
      }
      if (
        connection.toId === nd.id &&
        typeof connection.toBulletIndex === "number" &&
        connection.toBulletIndex > index
      ) {
        connection.toBulletIndex -= 1;
      }
      return connection;
    });
  const nextFocusIndex = nd.items.length
    ? Math.min(index, nd.items.length - 1)
    : null;
  refreshBulletNodeContent(nd, el, nextFocusIndex);
  requestConnectionRender();
  autosave();
}

function bindBulletItem(el, nd, li, index) {
  li.classList.toggle("is-done", !!nd.items[index]?.done);
  li.querySelector(".bullet-item-text")?.addEventListener("blur", (e) => {
    const text = e.target.textContent.trim();
    if (!text) {
      removeBulletItem(nd, el, index);
      return;
    }
    nd.items[index].text = text;
    autosave();
  });
  li.querySelector(".bullet-item-text")?.addEventListener(
    "keydown",
    (e) => {
      const text = e.target.textContent.trim();
      if ((e.key === "Backspace" || e.key === "Delete") && !text) {
        e.preventDefault();
        removeBulletItem(nd, el, index);
      }
    },
  );
  li.querySelector(".bullet-item-check")?.addEventListener(
    "click",
    () => {
      nd.items[index].done = !nd.items[index].done;
      const check = li.querySelector(".bullet-item-check");
      li.classList.toggle("is-done", nd.items[index].done);
      check.classList.toggle("done", nd.items[index].done);
      check.textContent = nd.items[index].done ? "✓" : "";
      autosave();
    },
  );
  li.querySelector(".bullet-item-handle")?.addEventListener(
    "mousedown",
    (e) => {
      e.stopPropagation();
      e.preventDefault();
      pendingConn = {
        nodeId: nd.id,
        pos: "right",
        bulletIndex: Number(li.dataset.bulletIndex),
      };
      pendingConnCursor = { x: e.clientX, y: e.clientY };
      pendingConnTarget = null;
      setTool("connect");
      requestConnectionRender();
    },
  );
}

function bindBulletNode(nd, el) {
  el.querySelectorAll(".bullet-list li").forEach((li, index) => {
    li.dataset.bulletIndex = index;
    bindBulletItem(el, nd, li, index);
  });
}

function updateNodeFromEl(nd) {
  const el = document.getElementById(`node-${nd.id}`);
  if (!el) return;
  const label = el.querySelector(".node-type-label");
  if (label) nd.customTitle = label.textContent.trim();
  if (["text", "heading", "note"].includes(nd.type)) {
    const c = el.querySelector(".node-content");
    if (c) nd.text = getEditablePlainText(c);
  }
  if (nd.type === "frame") {
    const c = el.querySelector(".node-content");
    if (c) nd.text = getEditablePlainText(c);
  }
  if (nd.type === "progress") {
    const t = el.querySelector(".progress-title");
    if (t) nd.title = t.textContent;
  }
  if (nd.type === "file") {
    const n = el.querySelector(".doc-name");
    if (n) nd.name = n.textContent;
  }
  if (nd.type === "embed") {
    const input = el.querySelector(".embed-input");
    if (input) nd.url = input.value.trim();
  }
}
function updBullet(e, nid, i) {
  const nd = nodes.find((n) => n.id === nid);
  if (nd) {
    nd.items[i] = e.target.textContent;
    autosave();
  }
}
function updStep(e, nid, i) {
  const nd = nodes.find((n) => n.id === nid);
  if (nd && nd.steps[i]) {
    nd.steps[i].label = e.target.textContent;
    autosave();
  }
}
function addStep(nid) {
  const nd = nodes.find((n) => n.id === nid);
  if (!nd) return;
  nd.steps.push({ label: "New step", done: false });
  const el = document.getElementById(`node-${nid}`);
  if (el) {
    el.querySelector(".node-body").innerHTML = nodeBodyHTML(nd);
    rebindProgress(nd, el);
  }
  autosave();
}
function rebindProgress(nd, el) {
  const bar = el.querySelector(".progress-bar-bg");
  if (bar)
    bar.addEventListener("click", (e) => {
      const r = bar.getBoundingClientRect();
      nd.value = Math.max(
        0,
        Math.min(100, Math.round(((e.clientX - r.left) / r.width) * 100)),
      );
      el.querySelector(".progress-bar-fill").style.width = nd.value + "%";
      el.querySelector(".progress-val").textContent = nd.value + "%";
      autosave();
    });
  el.querySelectorAll(".step-check").forEach((ch, i) => {
    ch.addEventListener("click", () => {
      nd.steps[i].done = !nd.steps[i].done;
      ch.classList.toggle("done", nd.steps[i].done);
      ch.textContent = nd.steps[i].done ? "✓" : "";
      autosave();
    });
  });
  el.querySelectorAll("[contenteditable]").forEach((ce) =>
    ce.addEventListener("blur", () => {
      updateNodeFromEl(nd);
      autosave();
    }),
  );
}

// ===================== CONNECTIONS =====================
function renderConnections() {
  const svg = document.getElementById("connections-svg");
  svg.innerHTML = "";
  document
    .querySelectorAll(".bullet-item-handle.has-connection")
    .forEach((handle) => handle.classList.remove("has-connection"));
  connections.forEach((c) => {
    const fn = nodes.find((n) => n.id === c.fromId),
      tn = nodes.find((n) => n.id === c.toId);
    if (!fn || !tn) return;
    if (c.fromBulletIndex !== null && c.fromBulletIndex !== undefined) {
      document
        .querySelector(
          `#node-${c.fromId} .bullet-item-handle[data-bullet-index="${c.fromBulletIndex}"]`,
        )
        ?.classList.add("has-connection");
    }
    if (c.toBulletIndex !== null && c.toBulletIndex !== undefined) {
      document
        .querySelector(
          `#node-${c.toId} .bullet-item-handle[data-bullet-index="${c.toBulletIndex}"]`,
        )
        ?.classList.add("has-connection");
    }
    const f = getConnectionPoint(fn, c.fromBulletIndex, c.fromPos),
      t = getConnectionPoint(tn, c.toBulletIndex, c.toPos);
    const path = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "path",
    );
    path.setAttribute("d", curve(f, t));
    path.setAttribute(
      "class",
      "conn-line" + (c.id === selectedConn?.id ? " selected" : ""),
    );
    path.dataset.connectionId = c.id;
    path.addEventListener("click", (e) => {
      e.stopPropagation();
      selectedConn = connections.find((x) => x.id === c.id);
      selectedNode = null;
      selectedNodeIds.clear();
      document
        .querySelectorAll(".conn-line")
        .forEach((l) => l.classList.remove("selected"));
      path.classList.add("selected");
      applyNodeSelectionClasses();
    });
    svg.appendChild(path);
    const ang = Math.atan2(t.y - f.y, t.x - f.x),
      ax = t.x - 10 * Math.cos(ang),
      ay = t.y - 10 * Math.sin(ang);
    const arr = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "polygon",
    );
    arr.setAttribute(
      "points",
      `${t.x},${t.y} ${ax + 4 * Math.sin(ang)},${ay - 4 * Math.cos(ang)} ${ax - 4 * Math.sin(ang)},${ay + 4 * Math.cos(ang)}`,
    );
    arr.setAttribute("fill", c.id === selectedConn?.id ? "#fff" : "#333");
    arr.style.pointerEvents = "none";
    svg.appendChild(arr);
  });
  if (pendingConn && pendingConnCursor) {
    const fromNode = nodes.find((n) => n.id === pendingConn.nodeId);
    if (fromNode) {
      const from = getConnectionPoint(
        fromNode,
        pendingConn.bulletIndex ?? null,
        pendingConn.pos || "right",
      );
      const to = s2w(pendingConnCursor.x, pendingConnCursor.y);
      const preview = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path",
      );
      preview.setAttribute("d", curve(from, to));
      preview.setAttribute("class", "conn-preview");
      svg.appendChild(preview);
    }
  }
}
function curve(f, t) {
  const dx = t.x - f.x;
  return `M${f.x},${f.y} C${f.x + dx * 0.5},${f.y} ${f.x + dx * 0.5},${t.y} ${t.x},${t.y}`;
}

function prunePresentationSpatialConnections(removedIds) {
  if (!currentPresentation || !removedIds?.length) return;
  const drop = new Set(removedIds.map(String));
  const arr = currentPresentation.spatialConnections || [];
  const next = arr.filter(
    (c) => c && !drop.has(String(c.fromId)) && !drop.has(String(c.toId)),
  );
  if (next.length !== arr.length) {
    currentPresentation.spatialConnections = next;
    queuePresentationSave(currentPresentation);
  }
}

function getPresentationSpatialEndpointCenter(id) {
  const sid = String(id);
  const world = document.getElementById("presentation-world");
  if (world) {
    const el =
      world.querySelector(`[data-object-id="${sid}"]`) ||
      world.querySelector(`[data-presentation-item-id="${sid}"]`);
    if (el) {
      const x = parseFloat(el.style.left) || el.offsetLeft || 0;
      const y = parseFloat(el.style.top) || el.offsetTop || 0;
      const w = el.offsetWidth || 200;
      const h = el.offsetHeight || 120;
      return { x: x + w / 2, y: y + h / 2 };
    }
  }
  if (!currentPresentation) return null;
  const obj = (currentPresentation.objects || []).find(
    (o) => String(o.id) === sid,
  );
  if (obj) {
    const w = obj.w || 200;
    const h = obj.h || (obj.type === "line" ? 4 : 100);
    return {
      x: (obj.x || 0) + w / 2,
      y: (obj.y || 0) + h / 2,
    };
  }
  const item = (currentPresentation.items || []).find(
    (it) => String(it.id) === sid,
  );
  if (item) {
    const project = projects.find((p) => p.id === item.projectId);
    const w = project
      ? Math.max(project.w || DEFAULT_PROJECT_CARD_WIDTH, 200)
      : 280;
    const h = project
      ? Math.max(project.h || DEFAULT_PROJECT_CARD_HEIGHT, 120)
      : 200;
    return { x: (item.x || 0) + w / 2, y: (item.y || 0) + h / 2 };
  }
  return null;
}

function requestPresentationSpatialConnRender() {
  if (pendingPresConnRenderRAF) return;
  pendingPresConnRenderRAF = requestAnimationFrame(() => {
    pendingPresConnRenderRAF = null;
    renderPresentationSpatialConnections();
  });
}

function clearPendingPresSpatialTargetVisual() {
  document
    .querySelectorAll(
      "#presentation-world .presentation-card.connect-target, #presentation-world .presentation-object.connect-target",
    )
    .forEach((node) => node.classList.remove("connect-target"));
}

function syncPendingPresSpatialConnTarget(clientX, clientY) {
  if (!pendingPresConn) return;
  const target = document.elementFromPoint(clientX, clientY);
  const handle = target?.closest?.(".pres-spatial-handle");
  let next = null;
  if (handle) {
    const ep = handle.dataset.presEp;
    const pos = handle.dataset.pos || "right";
    if (ep && String(ep) !== String(pendingPresConn.endpointId)) {
      next = { endpointId: String(ep), pos, handle };
    }
  }
  const prevId = pendingPresConnTarget?.endpointId;
  const nextId = next?.endpointId;
  if (prevId !== nextId) {
    clearPendingPresSpatialTargetVisual();
    pendingPresConnTarget = next;
    if (next?.handle) {
      next.handle
        .closest(".presentation-card, .presentation-object")
        ?.classList.add("connect-target");
    }
  }
}

function clearPendingPresentationSpatialConn() {
  clearPendingPresSpatialTargetVisual();
  pendingPresConnTarget = null;
  pendingPresConn = null;
  pendingPresConnCursor = null;
  requestPresentationSpatialConnRender();
}

function startPendingPresentationSpatialConn(endpointId, pos, clientX, clientY) {
  clearPendingPresSpatialTargetVisual();
  pendingPresConnTarget = null;
  pendingPresConn = {
    endpointId: String(endpointId),
    pos: pos || "right",
  };
  pendingPresConnCursor = { x: clientX, y: clientY };
  requestPresentationSpatialConnRender();
}

function getPresentationSpatialConnectionPoint(endpointId, pos) {
  const sid = String(endpointId);
  if (!pos) return getPresentationSpatialEndpointCenter(sid);
  const world = document.getElementById("presentation-world");
  if (!world) return getPresentationSpatialEndpointCenter(sid);
  const el =
    world.querySelector(`[data-presentation-item-id="${sid}"]`) ||
    world.querySelector(`[data-object-id="${sid}"]`);
  if (!el) return getPresentationSpatialEndpointCenter(sid);
  const handle = el.querySelector(`.pres-spatial-handle[data-pos="${pos}"]`);
  if (!handle) return getPresentationSpatialEndpointCenter(sid);
  const hr = handle.getBoundingClientRect();
  return presentationClientToWorld(
    hr.left + hr.width / 2,
    hr.top + hr.height / 2,
  );
}

function tryCompletePendingPresentationSpatialConn(clientX, clientY) {
  if (!pendingPresConn || !currentPresentation) return;
  if (clientX != null && clientY != null) {
    syncPendingPresSpatialConnTarget(clientX, clientY);
  }
  const tgt = pendingPresConnTarget;
  const fromId = pendingPresConn.endpointId;
  const fromPos = pendingPresConn.pos;
  if (!tgt || tgt.endpointId === fromId) {
    clearPendingPresentationSpatialConn();
    setPresentationTool("select");
    return;
  }
  const toId = tgt.endpointId;
  const toPos = tgt.pos;
  currentPresentation.spatialConnections =
    currentPresentation.spatialConnections || [];
  const dup = currentPresentation.spatialConnections.some(
    (c) =>
      String(c.fromId) === String(fromId) &&
      String(c.toId) === String(toId) &&
      (c.fromPos || null) === (fromPos || null) &&
      (c.toPos || null) === (toPos || null),
  );
  if (!dup) {
    currentPresentation.spatialConnections.push({
      id: `pc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      fromId: String(fromId),
      toId: String(toId),
      fromPos,
      toPos,
    });
    queuePresentationSave(currentPresentation);
    showToast("Connection created");
  }
  clearPendingPresentationSpatialConn();
  setPresentationTool("select");
}

function renderPresentationSpatialConnections() {
  const svg = document.getElementById("presentation-connections-svg");
  if (!svg || !currentPresentation) return;
  svg.innerHTML = "";
  const conns = currentPresentation.spatialConnections || [];
  conns.forEach((c) => {
    if (!c?.fromId || !c.toId) return;
    const f = getPresentationSpatialConnectionPoint(c.fromId, c.fromPos);
    const t = getPresentationSpatialConnectionPoint(c.toId, c.toPos);
    if (!f || !t) return;
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", curve(f, t));
    path.setAttribute("class", "conn-line presentation-conn-line");
    path.dataset.presentationConnectionId = c.id;
    if (presentationSelectedConnId && c.id === presentationSelectedConnId) {
      path.classList.add("selected");
    }
    svg.appendChild(path);
    const ang = Math.atan2(t.y - f.y, t.x - f.x);
    const ax = t.x - 10 * Math.cos(ang);
    const ay = t.y - 10 * Math.sin(ang);
    const arr = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    arr.setAttribute(
      "points",
      `${t.x},${t.y} ${ax + 4 * Math.sin(ang)},${ay - 4 * Math.cos(ang)} ${ax - 4 * Math.sin(ang)},${ay + 4 * Math.cos(ang)}`,
    );
    arr.setAttribute(
      "fill",
      presentationSelectedConnId && c.id === presentationSelectedConnId
        ? "#fff"
        : "#333",
    );
    arr.style.pointerEvents = "none";
    svg.appendChild(arr);
  });
  if (pendingPresConn && pendingPresConnCursor) {
    const from = getPresentationSpatialConnectionPoint(
      pendingPresConn.endpointId,
      pendingPresConn.pos,
    );
    const to = presentationClientToWorld(
      pendingPresConnCursor.x,
      pendingPresConnCursor.y,
    );
    if (from && to) {
      const preview = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path",
      );
      preview.setAttribute("d", curve(from, to));
      preview.setAttribute("class", "conn-preview");
      svg.appendChild(preview);
    }
  }
}

function clearPresentationSpatialSelection() {
  presentationSelectedConnId = null;
  document
    .querySelectorAll(".presentation-conn-line.selected")
    .forEach((el) => el.classList.remove("selected"));
}

function prunePresentationDeckSelection() {
  if (!currentPresentation) {
    selectedPresentationItemIds.clear();
    selectedPresentationObjectIds.clear();
    return;
  }
  const itemIds = new Set(
    (currentPresentation.items || []).map((it) => String(it.id)),
  );
  const objectIds = new Set(
    (currentPresentation.objects || []).map((o) => String(o.id)),
  );
  [...selectedPresentationItemIds].forEach((id) => {
    if (!itemIds.has(String(id))) selectedPresentationItemIds.delete(id);
  });
  [...selectedPresentationObjectIds].forEach((id) => {
    if (!objectIds.has(String(id))) selectedPresentationObjectIds.delete(id);
  });
}

function presentationDeckSelectionCount() {
  return (
    selectedPresentationItemIds.size + selectedPresentationObjectIds.size
  );
}

function applyPresentationDeckSelectionClasses() {
  const world = document.getElementById("presentation-world");
  if (!world) return;
  const count = presentationDeckSelectionCount();
  const indicator = document.getElementById(
    "presentation-selection-indicator",
  );
  world.querySelectorAll(".presentation-card").forEach((el) => {
    const id = el.dataset.presentationItemId;
    const on = id && selectedPresentationItemIds.has(id);
    el.classList.toggle("selected", on && count === 1);
    el.classList.toggle("multi-selected", on && count > 1);
  });
  world.querySelectorAll(".presentation-object").forEach((el) => {
    const id = el.dataset.objectId;
    const on = id && selectedPresentationObjectIds.has(id);
    el.classList.toggle("selected", on && count === 1);
    el.classList.toggle("multi-selected", on && count > 1);
  });
  if (indicator) {
    indicator.textContent = count ? `${count} selected` : "No selection";
    indicator.classList.toggle("visible", count > 1);
  }
}

function clearPresentationDeckSelection() {
  selectedPresentationItemIds.clear();
  selectedPresentationObjectIds.clear();
  applyPresentationDeckSelectionClasses();
}

function togglePresentationItemSelection(itemId) {
  const id = String(itemId);
  if (selectedPresentationItemIds.has(id))
    selectedPresentationItemIds.delete(id);
  else selectedPresentationItemIds.add(id);
  applyPresentationDeckSelectionClasses();
}

function togglePresentationObjectSelection(objectId) {
  const id = String(objectId);
  if (selectedPresentationObjectIds.has(id))
    selectedPresentationObjectIds.delete(id);
  else selectedPresentationObjectIds.add(id);
  applyPresentationDeckSelectionClasses();
}

function beginPresentationGroupDrag(e) {
  const canvas = document.getElementById("presentation-canvas");
  if (!canvas || !currentPresentation) return;
  const rect = canvas.getBoundingClientRect();
  const sc = presentationScale || 1;
  const ox = presentationViewOffset.x;
  const oy = presentationViewOffset.y;
  presentationGroupDragEntries = [];
  selectedPresentationItemIds.forEach((id) => {
    const item = (currentPresentation.items || []).find(
      (it) => String(it.id) === String(id),
    );
    if (item)
      presentationGroupDragEntries.push({
        kind: "item",
        id: String(id),
        startX: item.x || 0,
        startY: item.y || 0,
      });
  });
  selectedPresentationObjectIds.forEach((id) => {
    const obj = (currentPresentation.objects || []).find(
      (o) => String(o.id) === String(id),
    );
    if (obj)
      presentationGroupDragEntries.push({
        kind: "object",
        id: String(id),
        startX: obj.x || 0,
        startY: obj.y || 0,
      });
  });
  if (!presentationGroupDragEntries.length) {
    presentationGroupDragEntries = null;
    presentationGroupDragStart = null;
    return;
  }
  presentationGroupDragStart = {
    x: (e.clientX - rect.left - ox) / sc,
    y: (e.clientY - rect.top - oy) / sc,
  };
  presentationDragItemId = null;
  presentationDragObjectId = null;
  presentationGroupDragEntries.forEach((entry) => {
    const sel =
      entry.kind === "item"
        ? `.presentation-card[data-presentation-item-id="${entry.id}"]`
        : `.presentation-object[data-object-id="${entry.id}"]`;
    document.querySelector(`#presentation-world ${sel}`)?.classList.add("dragging");
  });
}

function startPresentationItemResize(e, item, project, el, dir) {
  if (!currentPresentation || !item || !project) return;
  e.stopPropagation();
  e.preventDefault();
  presentationResizeItemId = item.id;
  presentationItemResizeStart = {
    x: e.clientX,
    y: e.clientY,
    w: project.w || el.offsetWidth,
    h: project.h || el.offsetHeight,
    dir,
    itemX: item.x || 0,
    itemY: item.y || 0,
    projectId: project.id,
  };
}

function setPresentationTool(t) {
  presentationTool = t;
  if (t !== "connect") clearPendingPresentationSpatialConn();
  presentationSelectionMode = null;
  if (presentationSelectionRect) {
    presentationSelectionRect.style.display = "none";
  }
  updatePresentationToolbar();
  const pc = document.getElementById("presentation-canvas");
  if (pc && currentScreenName === "presentation") {
    pc.classList.toggle("pres-connect-tool", t === "connect");
    pc.style.cursor =
      t === "connect" ? "crosshair" : t === "pan" ? "grab" : "default";
  }
}

function updatePresentationToolbar() {
  document.querySelectorAll(".pres-tool-mode").forEach((btn) => {
    const mode = btn.getAttribute("data-pres-tool");
    btn.classList.toggle("active", mode === presentationTool);
  });
}

function addPresentationObjectFromMenu(type) {
  if (!currentPresentation) return;
  document.getElementById("ctx-menu")?.classList.remove("visible");
  const p = presentationCtxWorldPos || getPresentationViewportCenter();
  currentPresentation.objects = currentPresentation.objects || [];
  currentPresentation.objects.push(makePresentationObjectAt(type, p.x, p.y));
  queuePresentationSave(currentPresentation);
  renderPresentationScreen();
}

function deletePresentationCtxObject() {
  const id = presentationCtxMenuObjectId;
  presentationCtxMenuObjectId = null;
  document.getElementById("ctx-menu")?.classList.remove("visible");
  if (!id || !currentPresentation) return;
  prunePresentationSpatialConnections([id]);
  currentPresentation.objects = (currentPresentation.objects || []).filter(
    (o) => String(o.id) !== String(id),
  );
  queuePresentationSave(currentPresentation);
  renderPresentationScreen();
}

function removePresentationCtxCard() {
  const id = presentationCtxMenuItemId;
  presentationCtxMenuItemId = null;
  document.getElementById("ctx-menu")?.classList.remove("visible");
  if (!id) return;
  removePresentationItem(id);
}

function deletePresentationCtxConnection() {
  const id = presentationCtxMenuConnId;
  presentationCtxMenuConnId = null;
  document.getElementById("ctx-menu")?.classList.remove("visible");
  if (!currentPresentation || !id) return;
  currentPresentation.spatialConnections = (
    currentPresentation.spatialConnections || []
  ).filter((c) => String(c.id) !== String(id));
  presentationSelectedConnId = null;
  queuePresentationSave(currentPresentation);
  renderPresentationSpatialConnections();
}

/** @param {"canvas" | "dashboard" | "presentation"} surface */
function syncCtxMenuSurface(surface) {
  const show = (id, on) => {
    const el = document.getElementById(id);
    if (el) el.style.display = on ? "block" : "none";
  };
  const isPres = surface === "presentation";
  const isCanvas = surface === "canvas";
  const isDash = surface === "dashboard";
  show("ctx-canvas-add-section", isCanvas || isDash);
  show("ctx-node-section", false);
  show("ctx-conn-section", false);
  show("ctx-dashboard-section", false);
  show("ctx-fit-canvas-wrap", isCanvas);
  show("ctx-fit-presentation-wrap", isPres);
  show("ctx-pres-add-section", isPres);
  show("ctx-pres-object-section", false);
  show("ctx-pres-card-section", false);
  show("ctx-pres-conn-section", false);
}

function getElementWorldCenter(el) {
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  return s2w(rect.left + rect.width / 2, rect.top + rect.height / 2);
}
function getConnectionPoint(nd, bulletIndex = null, pos = null) {
  const el = document.getElementById(`node-${nd.id}`);
  if (bulletIndex !== null && el) {
    const bulletHandle = el.querySelector(
      `.bullet-item-handle[data-bullet-index="${bulletIndex}"]`,
    );
    const point = getElementWorldCenter(bulletHandle);
    if (point) return point;
  }
  if (el && pos) {
    const handle = el.querySelector(
      `.conn-handle[data-pos="${pos}"]:not([data-bullet-index])`,
    );
    const point = getElementWorldCenter(handle);
    if (point) return point;
  }
  return getCenter(nd, pos);
}
function getCenter(nd, pos = null) {
  const el = document.getElementById(`node-${nd.id}`);
  if (!el) return { x: nd.x + 80, y: nd.y + 40 };
  if (pos) {
    const width = el.offsetWidth;
    const height = el.offsetHeight;
    if (pos === "top") return { x: nd.x + width / 2, y: nd.y };
    if (pos === "bottom") return { x: nd.x + width / 2, y: nd.y + height };
    if (pos === "left") return { x: nd.x, y: nd.y + height / 2 };
    if (pos === "right") return { x: nd.x + width, y: nd.y + height / 2 };
  }
  return { x: nd.x + el.offsetWidth / 2, y: nd.y + el.offsetHeight / 2 };
}

function setupPresentationEvents() {
  const titleInput = document.getElementById("presentation-title-input");
  const pickerOverlay = document.getElementById("presentation-picker-overlay");
  if (titleInput && !titleInput.dataset.bound) {
    titleInput.dataset.bound = "1";
    titleInput.addEventListener("input", () => {
      if (!currentPresentation) return;
      currentPresentation.name =
        titleInput.value.trim() || "Untitled Presentation";
      queuePresentationSave(currentPresentation);
      renderPresentationList();
    });
    titleInput.addEventListener("blur", () => {
      if (!currentPresentation) return;
      titleInput.value =
        currentPresentation.name || "Untitled Presentation";
      queuePresentationSave(currentPresentation);
    });
  }
  if (pickerOverlay && !pickerOverlay.dataset.bound) {
    pickerOverlay.dataset.bound = "1";
    pickerOverlay.addEventListener("mousedown", (e) => {
      if (e.target === pickerOverlay) closePresentationPicker();
    });
  }
  if (!window.__bevPresentationCanvasNavBound) {
    window.__bevPresentationCanvasNavBound = true;
    const presCanvas = document.getElementById("presentation-canvas");
    if (presCanvas) {
      if (!presCanvas.dataset.presSelectionUi) {
        presCanvas.dataset.presSelectionUi = "1";
        const ind = document.createElement("div");
        ind.id = "presentation-selection-indicator";
        ind.className = "selection-indicator";
        ind.textContent = "No selection";
        presCanvas.appendChild(ind);
        presentationSelectionRect = document.createElement("div");
        presentationSelectionRect.className = "selection-box";
        presentationSelectionRect.style.display = "none";
        presCanvas.appendChild(presentationSelectionRect);
      }
      installTouchSurface(presCanvas, "presentation");
      presCanvas.addEventListener("mousedown", (e) => {
        if (currentScreenName !== "presentation" || !currentPresentation)
          return;
        const pan =
          e.button === 1 ||
          (e.button === 0 && presentationTool === "pan");
        if (pan) {
          getPresentationSpatialNav().beginPan(e.clientX, e.clientY);
          presCanvas.classList.add("panning");
          e.preventDefault();
          return;
        }
        const world = document.getElementById("presentation-world");
        const onEmpty =
          e.target === presCanvas ||
          e.target === world ||
          e.target.id === "presentation-connections-svg" ||
          e.target.classList.contains("presentation-conn-line") ||
          e.target.closest("#presentation-empty-state");
        if (
          onEmpty &&
          e.button === 0 &&
          presentationTool === "select" &&
          !e.target.closest("#presentation-empty-state button")
        ) {
          clearPresentationSpatialSelection();
          clearPendingPresentationSpatialConn();
          clearPresentationDeckSelection();
          const crect = presCanvas.getBoundingClientRect();
          presentationSelectionMode = "marquee";
          presentationSelectionStart = {
            x: e.clientX - crect.left,
            y: e.clientY - crect.top,
          };
          if (presentationSelectionRect) {
            presentationSelectionRect.style.display = "block";
            presentationSelectionRect.style.left =
              presentationSelectionStart.x + "px";
            presentationSelectionRect.style.top =
              presentationSelectionStart.y + "px";
            presentationSelectionRect.style.width = "0px";
            presentationSelectionRect.style.height = "0px";
          }
          e.preventDefault();
          return;
        }
        if (e.target.closest(".presentation-card, .presentation-object"))
          return;
      });
      presCanvas.addEventListener("contextmenu", (e) => {
        if (currentScreenName !== "presentation" || !currentPresentation)
          return;
        if (e.target.closest("#presentation-empty-state button")) return;
        e.preventDefault();
        presentationCtxWorldPos = presentationClientToWorld(
          e.clientX,
          e.clientY,
        );
        presentationCtxMenuObjectId = null;
        presentationCtxMenuItemId = null;
        presentationCtxMenuConnId = null;
        syncCtxMenuSurface("presentation");
        document.getElementById("ctx-pres-object-section").style.display =
          "none";
        document.getElementById("ctx-pres-card-section").style.display =
          "none";
        document.getElementById("ctx-pres-conn-section").style.display =
          "none";
        const connEl = e.target.closest(".presentation-conn-line");
        const objEl = e.target.closest(".presentation-object");
        const cardEl = e.target.closest(".presentation-card");
        if (connEl) {
          presentationCtxMenuConnId =
            connEl.dataset.presentationConnectionId || null;
          presentationSelectedConnId = presentationCtxMenuConnId;
          document.getElementById("ctx-pres-conn-section").style.display =
            "block";
          renderPresentationSpatialConnections();
        } else if (objEl) {
          presentationCtxMenuObjectId = objEl.dataset.objectId || null;
          document.getElementById("ctx-pres-object-section").style.display =
            "block";
        } else if (cardEl) {
          presentationCtxMenuItemId =
            cardEl.dataset.presentationItemId || null;
          document.getElementById("ctx-pres-card-section").style.display =
            "block";
        }
        const m = document.getElementById("ctx-menu");
        m.style.left = e.clientX + "px";
        m.style.top = e.clientY + "px";
        m.classList.add("visible");
      });
    }
  }
  if (!window.__bevPresentationMainWheelBound) {
    window.__bevPresentationMainWheelBound = true;
    const presWheelCanvas = document.getElementById("presentation-canvas");
    if (presWheelCanvas) {
      presWheelCanvas.addEventListener(
        "wheel",
        (e) => {
          if (currentScreenName !== "presentation" || !currentPresentation)
            return;
          getPresentationSpatialNav().wheel(e);
        },
        { passive: false },
      );
    }
  }
  if (!window.__bevPresentationKeysBound) {
    window.__bevPresentationKeysBound = true;
    document.addEventListener("keydown", (e) => {
      if (currentScreenName !== "presentation" || !currentPresentation)
        return;
      if (isActiveEditableElement(e.target)) return;
      if (e.key === " ") {
        e.preventDefault();
        setPresentationTool(
          presentationTool === "pan" ? "select" : "pan",
        );
        return;
      }
      if (e.key === "Escape") {
        clearPendingPresentationSpatialConn();
        clearPresentationSpatialSelection();
        clearPresentationDeckSelection();
        renderPresentationSpatialConnections();
        setPresentationTool("select");
      }
    });
  }
  if (!window.__bevPresentationDragBound) {
    window.__bevPresentationDragBound = true;
    window.addEventListener("mousemove", (e) => {
      const canvas = document.getElementById("presentation-canvas");
      if (!canvas || !currentPresentation) return;
      const rect = canvas.getBoundingClientRect();
      const sc = presentationScale || 1;
      const ox = presentationViewOffset.x;
      const oy = presentationViewOffset.y;
      const presNav = presentationSpatialNav;
      if (presNav && presNav.isPanningActive()) {
        presNav.movePan(e.clientX, e.clientY);
        return;
      }
      if (pendingPresConn) {
        pendingPresConnCursor = { x: e.clientX, y: e.clientY };
        syncPendingPresSpatialConnTarget(e.clientX, e.clientY);
        requestPresentationSpatialConnRender();
        return;
      }
      if (
        presentationSelectionMode === "marquee" &&
        presentationSelectionRect &&
        presentationSelectionStart
      ) {
        const x = Math.min(
          presentationSelectionStart.x,
          e.clientX - rect.left,
        );
        const y = Math.min(
          presentationSelectionStart.y,
          e.clientY - rect.top,
        );
        const w = Math.abs(
          e.clientX - rect.left - presentationSelectionStart.x,
        );
        const h = Math.abs(
          e.clientY - rect.top - presentationSelectionStart.y,
        );
        presentationSelectionRect.style.left = x + "px";
        presentationSelectionRect.style.top = y + "px";
        presentationSelectionRect.style.width = w + "px";
        presentationSelectionRect.style.height = h + "px";
        selectedPresentationItemIds.clear();
        selectedPresentationObjectIds.clear();
        const pworld = document.getElementById("presentation-world");
        pworld?.querySelectorAll(".presentation-card").forEach((el) => {
          const r = el.getBoundingClientRect();
          if (
            r.left < rect.left + x + w &&
            r.right > rect.left + x &&
            r.top < rect.top + y + h &&
            r.bottom > rect.top + y
          ) {
            const id = el.dataset.presentationItemId;
            if (id) selectedPresentationItemIds.add(id);
          }
        });
        pworld?.querySelectorAll(".presentation-object").forEach((el) => {
          const r = el.getBoundingClientRect();
          if (
            r.left < rect.left + x + w &&
            r.right > rect.left + x &&
            r.top < rect.top + y + h &&
            r.bottom > rect.top + y
          ) {
            const id = el.dataset.objectId;
            if (id) selectedPresentationObjectIds.add(id);
          }
        });
        applyPresentationDeckSelectionClasses();
        return;
      }
      if (presentationGroupDragEntries && presentationGroupDragStart) {
        const worldX = (e.clientX - rect.left - ox) / sc;
        const worldY = (e.clientY - rect.top - oy) / sc;
        const dx = worldX - presentationGroupDragStart.x;
        const dy = worldY - presentationGroupDragStart.y;
        presentationGroupDragEntries.forEach((entry) => {
          if (entry.kind === "item") {
            const item = (currentPresentation.items || []).find(
              (it) => String(it.id) === entry.id,
            );
            const nodeEl = document.querySelector(
              `#presentation-world .presentation-card[data-presentation-item-id="${entry.id}"]`,
            );
            if (!item || !nodeEl) return;
            item.x = Math.max(20, Math.round(entry.startX + dx));
            item.y = Math.max(20, Math.round(entry.startY + dy));
            nodeEl.style.left = `${item.x}px`;
            nodeEl.style.top = `${item.y}px`;
          } else {
            const obj = (currentPresentation.objects || []).find(
              (o) => String(o.id) === entry.id,
            );
            const nodeEl = document.querySelector(
              `#presentation-world .presentation-object[data-object-id="${entry.id}"]`,
            );
            if (!obj || !nodeEl) return;
            obj.x = Math.max(20, Math.round(entry.startX + dx));
            obj.y = Math.max(20, Math.round(entry.startY + dy));
            nodeEl.style.left = `${obj.x}px`;
            nodeEl.style.top = `${obj.y}px`;
          }
        });
        renderPresentationSpatialConnections();
        return;
      }
      if (presentationDragItemId) {
        const el = document.querySelector(
          `.presentation-card[data-presentation-item-id="${presentationDragItemId}"]`,
        );
        const item = currentPresentation.items.find(
          (entry) => entry.id === presentationDragItemId,
        );
        if (!el || !item) return;
        item.x = Math.max(
          20,
          Math.round(
            (e.clientX - rect.left - ox) / sc - presentationDragOffset.x,
          ),
        );
        item.y = Math.max(
          20,
          Math.round(
            (e.clientY - rect.top - oy) / sc - presentationDragOffset.y,
          ),
        );
        el.style.left = `${item.x}px`;
        el.style.top = `${item.y}px`;
        renderPresentationSpatialConnections();
        return;
      }
      if (presentationDragObjectId) {
        const el = document.querySelector(
          `.presentation-object[data-object-id="${presentationDragObjectId}"]`,
        );
        const obj = (currentPresentation.objects || []).find(
          (entry) => entry.id === presentationDragObjectId,
        );
        if (!el || !obj) return;
        obj.x = Math.max(
          20,
          Math.round(
            (e.clientX - rect.left - ox) / sc -
              presentationObjectDragOffset.x,
          ),
        );
        obj.y = Math.max(
          20,
          Math.round(
            (e.clientY - rect.top - oy) / sc -
              presentationObjectDragOffset.y,
          ),
        );
        el.style.left = `${obj.x}px`;
        el.style.top = `${obj.y}px`;
        renderPresentationSpatialConnections();
        return;
      }
      if (presentationResizeObjectId) {
        const el = document.querySelector(
          `.presentation-object[data-object-id="${presentationResizeObjectId}"]`,
        );
        const obj = (currentPresentation.objects || []).find(
          (entry) => entry.id === presentationResizeObjectId,
        );
        if (!el || !obj || !presentationResizeStart) return;
        const dx = (e.clientX - presentationResizeStart.x) / sc;
        const dy = (e.clientY - presentationResizeStart.y) / sc;
        let w = presentationResizeStart.w;
        let h = presentationResizeStart.h;
        let x = presentationResizeStart.startX;
        let y = presentationResizeStart.startY;
        if (presentationResizeStart.dir.includes("r"))
          w = Math.max(180, Math.round(presentationResizeStart.w + dx));
        if (presentationResizeStart.dir.includes("l")) {
          w = Math.max(180, Math.round(presentationResizeStart.w - dx));
          x = Math.round(
            presentationResizeStart.startX +
              (presentationResizeStart.w - w),
          );
        }
        if (presentationResizeStart.dir.includes("b"))
          h = Math.max(
            obj.type === "frame" ? 140 : 84,
            Math.round(presentationResizeStart.h + dy),
          );
        if (presentationResizeStart.dir.includes("t")) {
          h = Math.max(
            obj.type === "frame" ? 140 : 84,
            Math.round(presentationResizeStart.h - dy),
          );
          y = Math.round(
            presentationResizeStart.startY +
              (presentationResizeStart.h - h),
          );
        }
        obj.w = w;
        obj.h = h;
        obj.x = x;
        obj.y = y;
        el.style.width = `${w}px`;
        el.style.height = `${h}px`;
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
        renderPresentationSpatialConnections();
        return;
      }
      if (presentationResizeItemId && presentationItemResizeStart) {
        const item = (currentPresentation.items || []).find(
          (it) => String(it.id) === String(presentationResizeItemId),
        );
        const project = projects.find(
          (p) => p.id === presentationItemResizeStart.projectId,
        );
        const el = document.querySelector(
          `.presentation-card[data-presentation-item-id="${presentationResizeItemId}"]`,
        );
        if (!item || !project || !el) return;
        const dx = (e.clientX - presentationItemResizeStart.x) / sc;
        const dy = (e.clientY - presentationItemResizeStart.y) / sc;
        const dir = presentationItemResizeStart.dir;
        let w = presentationItemResizeStart.w;
        let h = presentationItemResizeStart.h;
        let ix = presentationItemResizeStart.itemX;
        let iy = presentationItemResizeStart.itemY;
        if (dir.includes("r"))
          w = Math.max(
            DEFAULT_PROJECT_CARD_WIDTH,
            Math.round(presentationItemResizeStart.w + dx),
          );
        if (dir.includes("l")) {
          w = Math.max(
            DEFAULT_PROJECT_CARD_WIDTH,
            Math.round(presentationItemResizeStart.w - dx),
          );
          ix = Math.round(
            presentationItemResizeStart.itemX +
              (presentationItemResizeStart.w - w),
          );
        }
        if (dir.includes("b"))
          h = Math.max(
            DEFAULT_PROJECT_CARD_HEIGHT,
            Math.round(presentationItemResizeStart.h + dy),
          );
        if (dir.includes("t")) {
          h = Math.max(
            DEFAULT_PROJECT_CARD_HEIGHT,
            Math.round(presentationItemResizeStart.h - dy),
          );
          iy = Math.round(
            presentationItemResizeStart.itemY +
              (presentationItemResizeStart.h - h),
          );
        }
        const min = getProjectMinSize(project);
        w = Math.max(w, min.w);
        h = Math.max(h, min.h);
        if (dir.includes("l"))
          ix = Math.round(
            presentationItemResizeStart.itemX +
              (presentationItemResizeStart.w - w),
          );
        if (dir.includes("t"))
          iy = Math.round(
            presentationItemResizeStart.itemY +
              (presentationItemResizeStart.h - h),
          );
        project.w = w;
        project.h = h;
        item.x = ix;
        item.y = iy;
        const autoSize = getProjectAutoSize(
          project,
          false,
          (project.desc || "").trim().length > 72,
        );
        const cardWidth = Math.max(w, autoSize.w);
        const cardHeight = Math.max(h, autoSize.h);
        el.style.left = `${ix}px`;
        el.style.top = `${iy}px`;
        el.style.width = `${cardWidth}px`;
        el.style.height = `${cardHeight}px`;
        renderPresentationSpatialConnections();
      }
    });
    window.addEventListener("mouseup", (e) => {
      if (presentationSelectionMode === "marquee" && presentationSelectionRect) {
        presentationSelectionMode = null;
        presentationSelectionRect.style.display = "none";
      }
      if (
        pendingPresConn &&
        currentScreenName === "presentation" &&
        currentPresentation
      ) {
        tryCompletePendingPresentationSpatialConn(e.clientX, e.clientY);
      }
      if (presentationSpatialNav?.isPanningActive()) {
        presentationSpatialNav.endPan();
        document
          .getElementById("presentation-canvas")
          ?.classList.remove("panning");
      }
      if (presentationGroupDragEntries && currentPresentation) {
        presentationGroupDragEntries = null;
        presentationGroupDragStart = null;
        document
          .querySelectorAll(
            "#presentation-world .presentation-card.dragging, #presentation-world .presentation-object.dragging",
          )
          .forEach((node) => node.classList.remove("dragging"));
        queuePresentationSave(currentPresentation);
        renderPresentationSpatialConnections();
      }
      if (presentationResizeItemId && currentPresentation) {
        const pid = presentationItemResizeStart?.projectId;
        presentationResizeItemId = null;
        presentationItemResizeStart = null;
        const p = pid ? projects.find((x) => x.id === pid) : null;
        if (p) queueProjectSave(p);
        queuePresentationSave(currentPresentation);
        renderPresentationSpatialConnections();
      }
      if (
        !presentationDragItemId &&
        !presentationDragObjectId &&
        !presentationResizeObjectId
      )
        return;
      document
        .querySelectorAll(".presentation-card.dragging, .presentation-object.dragging")
        .forEach((el) => el.classList.remove("dragging"));
      presentationDragItemId = null;
      presentationDragObjectId = null;
      presentationResizeObjectId = null;
      presentationResizeStart = null;
      queuePresentationSave(currentPresentation);
      renderPresentationSpatialConnections();
    });
  }
}

// ===================== CANVAS EVENTS =====================
function setupCanvasEvents() {
  const con = document.getElementById("canvas-container");
  const world = document.getElementById("canvas-world");
  const indicator = document.createElement("div");
  indicator.id = "canvas-selection-indicator";
  indicator.className = "selection-indicator";
  indicator.textContent = "No selection";
  con.appendChild(indicator);
  canvasSelectionRect = document.createElement("div");
  canvasSelectionRect.className = "selection-box";
  con.appendChild(canvasSelectionRect);
  installTouchSurface(con, "canvas");

  con.addEventListener("dragover", (e) => {
    if (![...(e.dataTransfer?.items || [])].some((item) => item.kind === "file")) {
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  });

  con.addEventListener("drop", (e) => {
    if (!currentProject) return;
    const files = [...(e.dataTransfer?.files || [])].filter(isImageFile);
    if (!files.length) return;
    e.preventDefault();
    const point = s2w(e.clientX, e.clientY);
    files.forEach((file, index) => {
      handlePastedImageFile(file, {
        x: point.x + index * 28,
        y: point.y + index * 28,
      });
    });
  });

  con.addEventListener("mousedown", (e) => {
    const onE =
      e.target === con ||
      e.target === world ||
      e.target.id === "connections-svg" ||
      e.target.id === "canvas-world";
    const pan =
      e.button === 1 || (e.button === 0 && currentTool === "pan");
    if (pan) {
      getCanvasSpatialNav().beginPan(e.clientX, e.clientY);
      isPanning = true;
      con.style.cursor = "grabbing";
      e.preventDefault();
      return;
    }
    if (onE && e.button === 0 && currentTool === "select") {
      selectNode(null);
      selectedConn = null;
      document
        .querySelectorAll(".conn-line")
        .forEach((l) => l.classList.remove("selected"));
      const r = con.getBoundingClientRect();
      canvasSelectionStart = {
        x: e.clientX - r.left,
        y: e.clientY - r.top,
      };
      canvasSelectionRect.style.display = "block";
      canvasSelectionRect.style.left = canvasSelectionStart.x + "px";
      canvasSelectionRect.style.top = canvasSelectionStart.y + "px";
      canvasSelectionRect.style.width = "0px";
      canvasSelectionRect.style.height = "0px";
    }
  });

  con.addEventListener("dblclick", (e) => {
    const onEmptySpace =
      e.target === con ||
      e.target === world ||
      e.target.id === "connections-svg" ||
      e.target.id === "canvas-world";
    if (!onEmptySpace || !currentProject) return;
    const point = s2w(e.clientX, e.clientY);
    addNodeAt("note", point.x, point.y);
  });

  window.addEventListener("mousemove", (e) => {
    if (pendingConn) {
      pendingConnCursor = { x: e.clientX, y: e.clientY };
      syncPendingConnectionTarget(e.clientX, e.clientY);
      requestConnectionRender();
    }
    if (lineEndpointDrag) {
      const nd = nodes.find((n) => n.id === lineEndpointDrag.nodeId);
      const el = nd ? document.getElementById(`node-${nd.id}`) : null;
      if (!nd || !el) return;
      const point = s2w(e.clientX, e.clientY);
      if (lineEndpointDrag.endpoint === "start") {
        setLineFromEndpoints(nd, point, lineEndpointDrag.anchor);
      } else {
        setLineFromEndpoints(nd, lineEndpointDrag.anchor, point);
      }
      el.style.left = nd.x + "px";
      el.style.top = nd.y + "px";
      el.style.width = nd.w + "px";
      el.style.height = nd.h + "px";
      el.style.transform = `rotate(${Number(nd.lineAngle) || 0}rad)`;
      renderConnections();
      return;
    }
    if (canvasSelectionStart && canvasSelectionRect) {
      const r = con.getBoundingClientRect();
      const x = Math.min(canvasSelectionStart.x, e.clientX - r.left);
      const y = Math.min(canvasSelectionStart.y, e.clientY - r.top);
      const w = Math.abs(e.clientX - r.left - canvasSelectionStart.x);
      const h = Math.abs(e.clientY - r.top - canvasSelectionStart.y);
      canvasSelectionRect.style.left = x + "px";
      canvasSelectionRect.style.top = y + "px";
      canvasSelectionRect.style.width = w + "px";
      canvasSelectionRect.style.height = h + "px";
      selectedNodeIds.clear();
      document.querySelectorAll(".node").forEach((el) => {
        const nr = el.getBoundingClientRect();
        if (
          nr.left < r.left + x + w &&
          nr.right > r.left + x &&
          nr.top < r.top + y + h &&
          nr.bottom > r.top + y
        )
          selectedNodeIds.add(el.id.replace("node-", ""));
      });
      selectedNode =
        selectedNodeIds.size === 1
          ? nodes.find((n) => n.id === [...selectedNodeIds][0])
          : null;
      applyNodeSelectionClasses();
      return;
    }
    const canvasNav = canvasSpatialNav;
    if (canvasNav?.isPanningActive()) {
      canvasNav.movePan(e.clientX, e.clientY);
      return;
    }
    if (nodeGroupDragIds) {
      const wp = s2w(e.clientX, e.clientY);
      const dx = wp.x - nodeGroupDragStart.x;
      const dy = wp.y - nodeGroupDragStart.y;
      nodeGroupDragIds.forEach((entry) => {
        const nd = nodes.find((n) => n.id === entry.id);
        const el = document.getElementById(`node-${entry.id}`);
        if (!nd || !el) return;
        nd.x = Math.round(entry.startX + dx);
        nd.y = Math.round(entry.startY + dy);
        el.style.left = nd.x + "px";
        el.style.top = nd.y + "px";
      });
      renderConnections();
      return;
    }
    if (isResizingNode && resizingNodeId) {
      const nd = nodes.find((n) => n.id === resizingNodeId);
      const el = nd ? document.getElementById(`node-${nd.id}`) : null;
      if (nd && el) {
        const dx = (e.clientX - nodeResizeStart.x) / viewScale,
          dy = (e.clientY - nodeResizeStart.y) / viewScale;
        let w = nodeResizeStart.w,
          h = nodeResizeStart.h,
          x = nodeResizeStart.startX,
          y = nodeResizeStart.startY;
        if (nodeResizeStart.dir.includes("r"))
          w = Math.max(140, Math.round(nodeResizeStart.w + dx));
        if (nodeResizeStart.dir.includes("l")) {
          w = Math.max(140, Math.round(nodeResizeStart.w - dx));
          x = Math.round(
            nodeResizeStart.startX + (nodeResizeStart.w - w),
          );
        }
        if (nodeResizeStart.dir.includes("b"))
          h = Math.max(70, Math.round(nodeResizeStart.h + dy));
        if (nodeResizeStart.dir.includes("t")) {
          h = Math.max(70, Math.round(nodeResizeStart.h - dy));
          y = Math.round(
            nodeResizeStart.startY + (nodeResizeStart.h - h),
          );
        }
        const min = getNodeMinSize(nd, el);
        w = Math.max(w, min.w);
        h = Math.max(h, min.h);
        if (nodeResizeStart.dir.includes("l"))
          x = Math.round(nodeResizeStart.startX + (nodeResizeStart.w - w));
        if (nodeResizeStart.dir.includes("t"))
          y = Math.round(nodeResizeStart.startY + (nodeResizeStart.h - h));
        if (nd.type === "file" && nd.fileKind === "image") {
          nd.manualImageSize = true;
        }
        nd.w = w;
        nd.h = h;
        nd.x = x;
        nd.y = y;
        el.style.left = nd.x + "px";
        el.style.top = nd.y + "px";
        el.style.width = nd.w + "px";
        el.style.height = nd.h + "px";
        renderConnections();
      }
      return;
    }
    if (isDragging && selectedNode) {
      const wp = s2w(e.clientX, e.clientY);
      selectedNode.x = Math.round(wp.x - dragOffset.x);
      selectedNode.y = Math.round(wp.y - dragOffset.y);
      const el = document.getElementById(`node-${selectedNode.id}`);
      if (el) {
        el.style.left = selectedNode.x + "px";
        el.style.top = selectedNode.y + "px";
      }
      renderConnections();
    }
  });

  window.addEventListener("mouseup", (e) => {
    if (canvasSpatialNav?.isPanningActive()) {
      canvasSpatialNav.endPan();
      isPanning = false;
      con.style.cursor = currentTool === "pan" ? "grab" : "default";
    }
    if (lineEndpointDrag) {
      lineEndpointDrag = null;
      autosave();
    }
    if (canvasSelectionStart && canvasSelectionRect) {
      canvasSelectionStart = null;
      canvasSelectionRect.style.display = "none";
    }
    if (isDragging) {
      isDragging = false;
      autosave();
    }
    if (nodeGroupDragIds) {
      nodeGroupDragIds = null;
      nodeGroupDragStart = null;
      autosave();
    }
    if (isResizingNode) {
      isResizingNode = false;
      resizingNodeId = null;
      nodeResizeStart = null;
      autosave();
    }
    if (pendingConn) syncPendingConnectionTarget(e.clientX, e.clientY);
    if (pendingConn && pendingConnTarget) {
      const toId = pendingConnTarget.nodeId;
      const toBulletIndex = pendingConnTarget.bulletIndex;
      if (toId && toId !== pendingConn.nodeId) {
        const exists = connections.some(
          (c) =>
            (c.fromId === pendingConn.nodeId &&
              c.toId === toId &&
              c.fromBulletIndex === (pendingConn.bulletIndex ?? null) &&
              c.toBulletIndex === toBulletIndex) ||
            (c.fromId === toId &&
              c.toId === pendingConn.nodeId &&
              c.fromBulletIndex === toBulletIndex &&
              c.toBulletIndex === (pendingConn.bulletIndex ?? null)),
        );
        if (!exists) {
          connections.push({
            id: "c" + connIdCounter++,
            fromId: pendingConn.nodeId,
            toId,
            fromPos: pendingConn.pos || "right",
            toPos: pendingConnTarget.pos || "left",
            fromBulletIndex: pendingConn.bulletIndex ?? null,
            toBulletIndex,
          });
          requestConnectionRender();
          autosave();
          showToast("Connection created");
        }
      }
      clearPendingConnection();
    } else if (pendingConn) {
      clearPendingConnection();
    }
  });

  con.addEventListener(
    "wheel",
    (e) => {
      getCanvasSpatialNav().wheel(e);
    },
    { passive: false },
  );

  con.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    syncCtxMenuSurface("canvas");
    presentationCtxMenuObjectId = null;
    presentationCtxMenuItemId = null;
    presentationCtxMenuConnId = null;
    ctxMenuPos = s2w(e.clientX, e.clientY);
    const nodeEl = e.target.closest(".node");
    const connEl = e.target.closest(".conn-line");
    ctxMenuNodeId = nodeEl ? nodeEl.id.replace("node-", "") : null;
    selectedConn = connEl
      ? connections.find((x) => x.id === connEl.dataset.connectionId) || null
      : null;
    if (selectedConn) {
      selectedNode = null;
      selectedNodeIds.clear();
    }
    document
      .querySelectorAll(".conn-line")
      .forEach((line) =>
        line.classList.toggle(
          "selected",
          line.dataset.connectionId === selectedConn?.id,
        ),
      );
    applyNodeSelectionClasses();
    document.getElementById("ctx-node-section").style.display =
      ctxMenuNodeId ? "block" : "none";
    document.getElementById("ctx-conn-section").style.display =
      selectedConn ? "block" : "none";
    document.getElementById("ctx-dashboard-section").style.display =
      "none";
    const m = document.getElementById("ctx-menu");
    m.style.left = e.clientX + "px";
    m.style.top = e.clientY + "px";
    m.classList.add("visible");
  });

  document.addEventListener("click", () => {
    document.getElementById("ctx-menu").classList.remove("visible");
    closeStatusMenus();
    workspaceMenuOpen = false;
    activeCategoryPickerId = null;
    syncWorkspaceMenuVisibility();
    document
      .querySelectorAll(".node-settings.open")
      .forEach((panel) => panel.classList.remove("open"));
  });

  document.addEventListener("keydown", (e) => {
    if (!currentProject) return;
    if (isActiveEditableElement(e.target))
      return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
      e.preventDefault();
      copyCurrentSelection();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
      e.preventDefault();
      pasteClipboardSelection();
      return;
    }
    if (e.key === "Delete" || e.key === "Backspace") deleteSelected();
    if (e.key === "Escape") {
      if (pendingConn) clearPendingConnection();
      else setTool("select");
    }
    if (e.key === " ") {
      e.preventDefault();
      setTool(currentTool === "pan" ? "select" : "pan");
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      autosave();
      showToast("Saved");
    }
  });
  document.addEventListener("paste", handleCanvasPaste);

  document
    .getElementById("file-input")
    .addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file || !imageNodeTarget) return;
      const nd = nodes.find((n) => n.id === imageNodeTarget);
      if (!nd) return;
      populateFileNodeFromFile(nd, file, () => {
        e.target.value = "";
        imageNodeTarget = null;
      });
    });
}

// ===================== TOOLS & VIEW =====================
function s2w(sx, sy) {
  const r = document
    .getElementById("canvas-container")
    .getBoundingClientRect();
  return {
    x: (sx - r.left - viewOffset.x) / viewScale,
    y: (sy - r.top - viewOffset.y) / viewScale,
  };
}
function selectNode(id, additive = false) {
  selectedConn = null;
  document
    .querySelectorAll(".conn-line")
    .forEach((l) => l.classList.remove("selected"));
  if (!additive) selectedNodeIds.clear();
  if (id) selectedNodeIds.add(id);
  selectedNode = id ? nodes.find((n) => n.id === id) : null;
  if (!id) selectedNode = null;
  applyNodeSelectionClasses();
}
function setTool(t) {
  currentTool = t;
  document
    .querySelectorAll('.tool-btn[id^="tool-"]')
    .forEach((b) => b.classList.remove("active"));
  document.getElementById(`tool-${t}`)?.classList.add("active");
  const c = document.getElementById("canvas-container");
  c.style.cursor =
    t === "connect" ? "crosshair" : t === "pan" ? "grab" : "default";
}
function addNodeCtx(type) {
  if (!currentProject) return;
  const r = document
    .getElementById("canvas-container")
    .getBoundingClientRect();
  const p = s2w(
    r.left + r.width / 2 + (Math.random() - 0.5) * 200,
    r.top + r.height / 2 + (Math.random() - 0.5) * 200,
  );
  addNodeAt(type, p.x, p.y);
}
function addNodeFromMenu(type) {
  addNodeAt(type, ctxMenuPos.x, ctxMenuPos.y);
}
function getCanvasViewportCenterWorld() {
  const rect = document
    .getElementById("canvas-container")
    .getBoundingClientRect();
  return s2w(rect.left + rect.width / 2, rect.top + rect.height / 2);
}
function mergeNodeDefaults(type, data = {}) {
  const defs = {
    text: { text: "New note" },
    heading: { text: "Heading" },
    line: { w: 220, h: LINE_NODE_HEIGHT, lineAngle: 0 },
    bullet: { items: ["Item 1", "Item 2"] },
    progress: {
      title: "Progress tracker",
      value: 0,
      steps: [{ label: "Step one", done: false }],
    },
    file: {
      name: "File",
      ext: "FILE",
      size: "",
      src: null,
      mime: "",
      fileKind: "file",
    },
    embed: { url: "", title: "Embed", w: 320, h: 220 },
    frame: { text: "Group", w: 260, h: 180 },
  };
  return { ...(defs[type] || {}), ...data };
}
function addNodeAt(type, x, y, data = null) {
  const nd = makeNode(
    type,
    Math.round(x - (type === "line" ? 110 : 80)),
    Math.round(y - (type === "line" ? LINE_NODE_HEIGHT / 2 : 40)),
    mergeNodeDefaults(type, data || {}),
  );
  nodes.push(nd);
  const el = createNodeEl(nd);
  document.getElementById("canvas-world").appendChild(el);
  enforceNodeMinSize(nd, el);
  selectNode(nd.id);
  updateInfoBar();
  autosave();
  return nd;
}

function duplicateCanvasSelectionForDrag() {
  const clones = duplicateNodeSelection(24, 24);
  return clones.length > 0;
}

function handlePastedImageFile(file, point) {
  if (!file || !currentProject) return;
  const nd = addNodeAt("file", point.x, point.y, {
    name: file.name || "Image",
    ext: "IMG",
    fileKind: "image",
    size: fmtBytes(file.size || 0),
    mime: file.type || "",
  });
  populateFileNodeFromFile(nd, file);
}
function handleCanvasPaste(e) {
  if (!currentProject) return;
  const target = e.target;
  if (isActiveEditableElement(target))
    return;
  const clipboard = e.clipboardData;
  if (!clipboard) return;
  const center = getCanvasViewportCenterWorld();
  let offsetIndex = 0;
  let handled = false;
  [...(clipboard.items || [])].forEach((item) => {
    if (!item || item.kind !== "file" || !item.type.startsWith("image/"))
      return;
    const file = item.getAsFile();
    if (!file) return;
    handled = true;
    handlePastedImageFile(file, {
      x: center.x + offsetIndex * 36,
      y: center.y + offsetIndex * 36,
    });
    offsetIndex += 1;
  });
  if (handled) {
    e.preventDefault();
    return;
  }
  const text = String(clipboard.getData("text/plain") || "").trim();
  if (!text) return;
  e.preventDefault();
  if (/^https?:\/\//i.test(text)) {
    addNodeAt("embed", center.x, center.y, {
      url: text,
    });
    return;
  }
  addNodeAt("note", center.x, center.y, {
    text,
  });
}
function deleteSelected() {
  if (selectedNodeIds.size > 1) {
    openConfirmDialog({
      title: "Delete Nodes",
      message: `Delete ${selectedNodeIds.size} selected nodes?`,
      confirmLabel: "Delete",
      onConfirm: () => {
        [...selectedNodeIds].forEach((id) => deleteNodeById(id, false));
        selectedNodeIds.clear();
        selectedNode = null;
        renderConnections();
        updateInfoBar();
        autosave();
      },
    });
    return;
  }
  if (selectedNode) requestDeleteNodeById(selectedNode.id);
  else if (selectedConn) deleteSelectedConnection();
}
function requestDeleteNodeById(id) {
  const node = nodes.find((n) => n.id === id);
  if (!node) return;
  openConfirmDialog({
    title: "Delete Node",
    message: `Delete "${node.customTitle || node.type || "node"}"?`,
    confirmLabel: "Delete",
    onConfirm: () => deleteNodeById(id),
  });
}
function deleteNodeById(id, saveNow = true) {
  const node = nodes.find((n) => n.id === id);
  if (saveNow) captureHistory();
  nodes = nodes.filter((n) => n.id !== id);
  connections = connections.filter(
    (c) => c.fromId !== id && c.toId !== id,
  );
  if (
    node?.type === "file" &&
    node.fileKind === "image" &&
    currentProject?.id
  ) {
    deleteImageAsset(currentProject.id, id);
  }
  document.getElementById(`node-${id}`)?.remove();
  selectedNodeIds.delete(id);
  if (selectedNode?.id === id) selectedNode = null;
  renderConnections();
  updateInfoBar();
  applyNodeSelectionClasses();
  if (saveNow) autosave();
}
function deleteSelectedConnection() {
  if (!selectedConn) return;
  const connectionId = selectedConn.id;
  openConfirmDialog({
    title: "Delete Connection",
    message: "Delete this connection?",
    confirmLabel: "Delete",
    onConfirm: () => {
      connections = connections.filter((c) => c.id !== connectionId);
      selectedConn = null;
      renderConnections();
      updateInfoBar();
      autosave();
    },
  });
}
function startConnectionFromMenu() {
  if (ctxMenuNodeId) {
    pendingConn = { nodeId: ctxMenuNodeId };
    pendingConnCursor = null;
    pendingConnTarget = null;
    setTool("connect");
    showToast("Click a node handle to connect");
  }
}
function updateInfoBar() {
  document.getElementById("info-nodes").textContent =
    nodes.length + " node" + (nodes.length !== 1 ? "s" : "");
  document.getElementById("info-conns").textContent =
    connections.length +
    " connection" +
    (connections.length !== 1 ? "s" : "");
}

function resetView() {
  const con = document.getElementById("canvas-container"),
    r = con.getBoundingClientRect();
  const isMobile = isMobileViewport();
  const nav = getCanvasSpatialNav();
  if (!nodes.length) {
    const o = isMobile ? { x: 40, y: 40 } : { x: 56, y: 56 };
    const sc = isMobile ? 0.28 : 0.48;
    nav.setState(o.x, o.y, sc, sc);
    applyTransform();
    return;
  }
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  nodes.forEach((nd) => {
    const el = document.getElementById(`node-${nd.id}`);
    const w = el ? el.offsetWidth : 140,
      h = el ? el.offsetHeight : 80;
    minX = Math.min(minX, nd.x);
    minY = Math.min(minY, nd.y);
    maxX = Math.max(maxX, nd.x + w);
    maxY = Math.max(maxY, nd.y + h);
  });
  const pad = isMobile ? 340 : 220,
    cw = maxX - minX + pad * 2,
    ch = maxY - minY + pad * 2;
  const sc = Math.min(
    isMobile ? 0.3 : 0.5,
    Math.max(CANVAS_SCALE_MIN, Math.min(r.width / cw, r.height / ch)),
  );
  const ox = (r.width - cw * sc) / 2 - (minX - pad) * sc;
  const oy = (r.height - ch * sc) / 2 - (minY - pad) * sc;
  nav.setState(ox, oy, sc, sc);
  applyTransform();
}
function zoomBy(d) {
  const r = document
    .getElementById("canvas-container")
    .getBoundingClientRect();
  getCanvasSpatialNav().zoomByAdditive(
    d,
    r.width / 2,
    r.height / 2,
  );
}

// ===================== MINIMAP =====================
function startMinimapLoop() {
  const loop = () => {
    drawMinimap();
    minimapRAF = requestAnimationFrame(loop);
  };
  if (minimapRAF) cancelAnimationFrame(minimapRAF);
  loop();
}
function drawMinimap() {
  const canvas = document.getElementById("minimap-canvas"),
    ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, width, height);
  if (!nodes.length) return;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  nodes.forEach((nd) => {
    minX = Math.min(minX, nd.x);
    minY = Math.min(minY, nd.y);
    maxX = Math.max(maxX, nd.x + 150);
    maxY = Math.max(maxY, nd.y + 100);
  });
  const pad = 30,
    rng = {
      x: minX - pad,
      y: minY - pad,
      w: maxX - minX + pad * 2,
      h: maxY - minY + pad * 2,
    };
  const s = Math.min(width / rng.w, height / rng.h) * 0.9,
    ox = (width - rng.w * s) / 2,
    oy = (height - rng.h * s) / 2;
  connections.forEach((c) => {
    const f = nodes.find((n) => n.id === c.fromId),
      t = nodes.find((n) => n.id === c.toId);
    if (!f || !t) return;
    ctx.beginPath();
    ctx.moveTo(ox + (f.x - rng.x + 70) * s, oy + (f.y - rng.y + 40) * s);
    ctx.lineTo(ox + (t.x - rng.x + 70) * s, oy + (t.y - rng.y + 40) * s);
    ctx.strokeStyle = "#2a2a2a";
    ctx.lineWidth = 1;
    ctx.stroke();
  });
  nodes.forEach((nd) => {
    ctx.fillStyle = nd.id === selectedNode?.id ? "#fff" : "#333";
    ctx.fillRect(
      ox + (nd.x - rng.x) * s,
      oy + (nd.y - rng.y) * s,
      Math.max(8, 140 * s),
      Math.max(4, 80 * s),
    );
  });
  const con = document.getElementById("canvas-container"),
    cr = con.getBoundingClientRect();
  ctx.strokeStyle = "rgba(255,255,255,.3)";
  ctx.lineWidth = 1;
  ctx.strokeRect(
    ox + (-viewOffset.x / viewScale - rng.x) * s,
    oy + (-viewOffset.y / viewScale - rng.y) * s,
    (cr.width / viewScale) * s,
    (cr.height / viewScale) * s,
  );
}

function drawDashboardMinimap() {
  const canvas = document.getElementById("dashboard-minimap-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, width, height);
  const items = [
    ...projects.map((p) => ({
      x: p.x || 0,
      y: p.y || 0,
      w: p.w || DEFAULT_PROJECT_CARD_WIDTH,
      h: p.h || DEFAULT_PROJECT_CARD_HEIGHT,
      color: p.color || "#555",
    })),
    ...overviewItems.map((i) => ({
      x: i.x || 0,
      y: i.y || 0,
      w: i.w || (i.type === "line" ? 220 : 220),
      h: i.h || (i.type === "line" ? 2 : 80),
      color: "#666",
    })),
  ];
  if (!items.length) return;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  items.forEach((it) => {
    minX = Math.min(minX, it.x);
    minY = Math.min(minY, it.y);
    maxX = Math.max(maxX, it.x + it.w);
    maxY = Math.max(maxY, it.y + it.h);
  });
  const pad = 40,
    rng = {
      x: minX - pad,
      y: minY - pad,
      w: maxX - minX + pad * 2,
      h: maxY - minY + pad * 2,
    };
  const s = Math.min(width / rng.w, height / rng.h) * 0.9,
    ox = (width - rng.w * s) / 2,
    oy = (height - rng.h * s) / 2;
  items.forEach((it) => {
    ctx.fillStyle = it.color;
    ctx.globalAlpha = 0.6;
    ctx.fillRect(
      ox + (it.x - rng.x) * s,
      oy + (it.y - rng.y) * s,
      Math.max(4, it.w * s),
      Math.max(2, it.h * s),
    );
    ctx.globalAlpha = 1;
  });
  const rect = document
    .getElementById("dashboard-canvas")
    .getBoundingClientRect();
  ctx.strokeStyle = "rgba(255,255,255,.3)";
  ctx.lineWidth = 1;
  ctx.strokeRect(
    ox + (-dashboardViewOffset.x / dashboardScale - rng.x) * s,
    oy + (-dashboardViewOffset.y / dashboardScale - rng.y) * s,
    (rect.width / dashboardScale) * s,
    (rect.height / dashboardScale) * s,
  );
}

// ===================== UTILS =====================
function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function fmtBytes(b) {
  if (b < 1024) return b + " B";
  if (b < 1048576) return (b / 1024).toFixed(1) + " KB";
  return (b / 1048576).toFixed(1) + " MB";
}
function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2200);
}
function saAll(el) {
  const r = document.createRange();
  r.selectNodeContents(el);
  const s = window.getSelection();
  s.removeAllRanges();
  s.addRange(r);
}

function installTouchSurface(el, kind) {
  const configs = {
    dashboard: {
      getNav: getDashboardSpatialNav,
      pointerSpace: "container",
      scaleMin: DASHBOARD_SCALE_MIN,
      scaleMax: DASHBOARD_SCALE_MAX,
      viewOnly: false,
      onAllPointersUp: null,
    },
    canvas: {
      getNav: getCanvasSpatialNav,
      pointerSpace: "client",
      scaleMin: CANVAS_SCALE_MIN,
      scaleMax: CANVAS_SCALE_MAX,
      viewOnly: false,
      onAllPointersUp: () => {
        if (currentProject) autosave();
      },
    },
    presentation: {
      getNav: getPresentationSpatialNav,
      pointerSpace: "client",
      scaleMin: PRESENTATION_SCALE_MIN,
      scaleMax: PRESENTATION_SCALE_MAX,
      viewOnly: false,
      onAllPointersUp: null,
    },
  };
  const cfg = configs[kind];
  if (!cfg) return;
  installTouchSpatialSurface(el, cfg);
}

document
  .getElementById("canvas-project-title")
  .addEventListener("blur", function () {
    if (currentProject) {
      currentProject.name =
        this.textContent.trim() || currentProject.name;
      applyTextDirection(this);
      updateCanvasPathbar();
      autosave();
    }
  });
document.addEventListener(
  "focusin",
  (e) => {
    applyTextDirection(e.target);
  },
  true,
);
document.addEventListener(
  "input",
  (e) => {
    applyTextDirection(e.target);
  },
  true,
);
document.addEventListener(
  "change",
  (e) => {
    applyTextDirection(e.target);
  },
  true,
);
setInterval(() => {
  if (currentProject) autosave();
}, 60000);

document.addEventListener("keydown", (e) => {
  if (isActiveEditableElement(e.target))
    return;
  const mod = e.metaKey || e.ctrlKey;
  if (!mod || e.key.toLowerCase() !== "z") return;
  e.preventDefault();
  if (e.shiftKey) redoHistory();
  else undoHistory();
});

applyTextDirectionToAll(document);
startup();
