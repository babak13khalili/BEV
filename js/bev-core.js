/**
 * BEV shared spatial object model — single source of truth for:
 * - canonical types (e.g. text → note)
 * - shared text / frame state used on dashboard, canvas, and presentation
 * - presentation spatial allowlist + normalization helpers
 *
 * Loaded before js/bev-app.js (see index.html).
 */
(function (global) {
  "use strict";

  const SURFACES = Object.freeze({
    CANVAS: "canvas",
    DASHBOARD: "dashboard",
    PRESENTATION: "presentation",
  });

  /** Types that share one editor / HTML path across surfaces. */
  const SHARED_TEXT_TYPES = Object.freeze([
    "text",
    "note",
    "heading",
    "frame",
  ]);

  /** Objects allowed on a presentation canvas (legacy "text" kept for filters before normalize). */
  const PRESENTATION_SPATIAL_SET = new Set([
    "text",
    "note",
    "heading",
    "line",
    "frame",
  ]);

  function isUnifiedTextNoteType(type) {
    return type === "text" || type === "note";
  }

  function canonicalObjectType(type) {
    return isUnifiedTextNoteType(type) ? "note" : type;
  }

  function isSharedTextObjectType(type) {
    return SHARED_TEXT_TYPES.includes(type);
  }

  function isPresentationSpatialType(type) {
    return PRESENTATION_SPATIAL_SET.has(type);
  }

  function normalizeOverviewItemDataList(itemList) {
    return (itemList || []).map((item) => {
      item.type = canonicalObjectType(item.type);
      return item;
    });
  }

  function presentationObjectsFromRaw(rawObjects) {
    return normalizeOverviewItemDataList(
      JSON.parse(JSON.stringify(rawObjects || [])),
    ).filter((item) => isPresentationSpatialType(item.type));
  }

  function createSharedTextObjectState(
    id,
    type,
    x,
    y,
    data = {},
    surface = SURFACES.CANVAS,
  ) {
    type = canonicalObjectType(type);
    const isCardLikeSurface =
      surface === SURFACES.DASHBOARD || surface === SURFACES.PRESENTATION;
    const textDefaults = {
      text: isCardLikeSurface ? "Quick note" : "New note",
      note: "Note...",
      heading: isCardLikeSurface ? "Section Heading" : "Heading",
      frame: "Group",
    };
    const base = { id, type, x, y };
    if (type === "frame") {
      return {
        ...base,
        text: data.text ?? textDefaults.frame,
        w: data.w || 260,
        h: data.h || 180,
      };
    }
    return {
      ...base,
      text: data.text ?? textDefaults[type] ?? "New note",
    };
  }

  /** Simple line chip used on dashboard + presentation (canvas lines add angle/height via makeNode). */
  function createSimpleLineItem(id, x, y, w = 220) {
    return { id, type: "line", x, y, w };
  }

  function createQuickNoteFallbackItem(id, type, x, y) {
    return { id, type, x, y, text: "Quick note" };
  }

  function escapeHTML(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
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
      return `<img src="${escapeHTML(embed.src)}" alt="">`;
    if (embed.type === "video")
      return `<video src="${escapeHTML(embed.src)}" controls playsinline></video>`;
    if (embed.type === "iframe")
      return `<iframe src="${escapeHTML(embed.src)}" loading="lazy" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
    if (embed.type === "website")
      return `<img src="${escapeHTML(embed.preview)}" alt="" draggable="false">`;
    return `<div class="embed-placeholder">No URL</div>`;
  }

  function renderNodeContentHTML(node, opts = {}) {
    const editable = !!opts.editable;
    const t = canonicalObjectType(node?.type);
    if (isSharedTextObjectType(t)) {
      const inner = escapeHTML(String(node?.text || "")).replace(/\n/g, "<br>");
      const cls =
        t === "heading"
          ? "content node-content shared-heading-text"
          : "node-content";
      const ce = editable
        ? 'contenteditable="true" spellcheck="false"'
        : 'contenteditable="false" spellcheck="false"';
      return `<div class="${cls}" ${ce}>${inner}</div>`;
    }
    if (t === "line") {
      return editable
        ? `<div class="node-content line-content" spellcheck="false"></div>
    <button class="line-end-handle" data-end="start" type="button" aria-label="Move line start"></button>
    <button class="line-end-handle" data-end="end" type="button" aria-label="Move line end"></button>`
        : `<div class="node-content line-content" spellcheck="false"></div>`;
    }
    if (t === "bullet") {
      const lis = (node?.items || [])
        .map((it, i) => {
          const text =
            typeof it === "string" ? it : String(it?.text || "");
          const done = typeof it === "object" && it?.done;
          if (editable) {
            return `<li data-bullet-index="${i}">
    ${node?.bulletFeatures?.checklist ? `<button class="bullet-item-check${done ? " done" : ""}" type="button">${done ? "✓" : ""}</button>` : ""}
    <span contenteditable="true" class="node-content bullet-item-text">${escapeHTML(text)}</span>
    ${node?.bulletFeatures?.connectors ? `<div class="conn-handle bullet-item-handle" data-node="${escapeHTML(node?.id || "")}" data-bullet-index="${i}" data-pos="right"></div>` : ""}
  </li>`;
          }
          return `<li>
            <button class="bullet-item-check${done ? " done" : ""}" type="button" disabled aria-hidden="true">${done ? "✓" : ""}</button>
            <span class="node-content bullet-item-text">${escapeHTML(text).replace(/\n/g, "<br>")}</span>
          </li>`;
        })
        .join("");
      return editable
        ? `<ul class="bullet-list">${lis}</ul><button class="bullet-add-btn">+ Add item</button>`
        : `<ul class="bullet-list">${lis || `<li><span class="node-content bullet-item-text">Empty</span></li>`}</ul>`;
    }
    if (t === "progress") {
      const val = Math.round(
        Math.min(100, Math.max(0, Number(node?.value) || 0)),
      );
      const steps = (node?.steps || [])
        .map((s, i) => {
          const lab = escapeHTML(String(s?.label || `Step ${i + 1}`));
          const done = !!s?.done;
          return editable
            ? `<div class="step-item"><div class="step-check${done ? " done" : ""}">${done ? "✓" : ""}</div><span contenteditable="true" class="node-content" onblur="updStep(event,'${escapeHTML(node?.id || "")}',${i})">${lab}</span></div>`
            : `<div class="step-item"><div class="step-check${done ? " done" : ""}">${done ? "✓" : ""}</div><span class="node-content">${lab}</span></div>`;
        })
        .join("");
      return `<div class="progress-title"${editable ? ` contenteditable="true" spellcheck="false"` : ""}>${escapeHTML(node?.title || "")}</div>
<div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${val}%"></div></div>
<div class="progress-val">${val}%</div>
<div class="progress-steps">${steps}${editable ? `<button class="bullet-add-btn" onclick="addStep('${escapeHTML(node?.id || "")}')">+ Add step</button>` : ""}</div>`;
    }
    if (t === "file") {
      const src = String(node?.src || "").trim();
      const isImg =
        node?.fileKind === "image" ||
        node?.type === "image" ||
        (src.startsWith("data:image/") && node?.type === "file");
      if (isImg && src) {
        return `<div class="img-wrap"><img src="${escapeHTML(src)}" alt="" draggable="false"></div>`;
      }
      return `<div class="doc-wrap"><div class="doc-icon">${escapeHTML(node?.ext || "FILE")}</div><div><div class="doc-name"${editable ? ` contenteditable="true" spellcheck="false"` : ""}>${escapeHTML(node?.name || "File")}</div><div class="doc-meta">${escapeHTML(node?.size || (editable ? "Click to attach file" : "File"))}</div></div></div>`;
    }
    if (t === "embed") {
      if (editable && !String(node?.url || "").trim()) {
        return `<div class="embed-wrap">
      <input class="embed-input" type="url" placeholder="Paste image, video, YouTube, Vimeo, or embed URL" value="${escapeHTML(node?.url || "")}">
      <div class="embed-preview">${embedPreviewHTML(node?.url || "")}</div>
    </div>`;
      }
      return `<div class="embed-preview">${embedPreviewHTML(node?.url || "")}</div>`;
    }
    return "";
  }

  function buildNodeShell(node, opts = {}) {
    const t = canonicalObjectType(node?.type);
    const editable = !!opts.editable;
    const accent = escapeHTML(opts.accent || "#888");
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
    const label = escapeHTML(opts.label ?? node?.customTitle ?? labels[t] ?? t);
    const src = String(node?.src || "").trim();
    const fileLinkHref = escapeHTML(String(opts.fileLinkHref || "").trim());
    const fileLinkLabel = escapeHTML(String(opts.fileLinkLabel || "File"));
    const embedUrl = escapeHTML(String(node?.url || "").trim());
    const headerActionsHTML = String(opts.headerActionsHTML ?? opts.actionsHTML ?? "");
    const fileTopbarActionsHTML = String(
      opts.fileTopbarActionsHTML ?? opts.actionsHTML ?? "",
    );
    const embedTopbarActionsHTML = String(
      opts.embedTopbarActionsHTML ?? opts.actionsHTML ?? "",
    );
    const settingsHTML = String(opts.settingsHTML || "");
    const fileTopbar =
      t === "file"
        ? `<div class="node-file-topbar">
${fileLinkHref ? `<a class="node-file-link" href="${fileLinkHref}" target="_blank" rel="noreferrer" title="${fileLinkHref}">${fileLinkLabel}</a>` : `<span class="node-file-link" title="${fileLinkLabel}">${fileLinkLabel}</span>`}
${fileTopbarActionsHTML ? `<div class="node-file-topbar-actions">${fileTopbarActionsHTML}</div>` : ""}
</div>`
        : "";
    const embedTopbar =
      t === "embed" && embedUrl
        ? `<div class="node-embed-topbar">
<a class="node-embed-link" href="${embedUrl}" target="_blank" rel="noreferrer" title="${embedUrl}">${embedUrl}</a>
${embedTopbarActionsHTML ? `<div class="node-embed-topbar-actions">${embedTopbarActionsHTML}</div>` : ""}
</div>`
        : "";
    const labelEditableAttr = editable
      ? ` contenteditable="true" spellcheck="false"`
      : "";
    const html = `<div class="node-accent-line" style="background:${accent}"></div>
${fileTopbar}
${embedTopbar}
<div class="node-header"><span class="node-type-label"${labelEditableAttr}>${label}</span><div class="node-actions">${headerActionsHTML}</div></div>
<div class="node-body">${renderNodeContentHTML(node, { editable })}</div>${settingsHTML}`;
    const isImageFile =
      t === "file" &&
      (node?.fileKind === "image" ||
        node?.type === "image" ||
        src.startsWith("data:image/"));
    return { type: t, html, isImageFile };
  }

  function buildReadonlyNodeShell(node, opts = {}) {
    return buildNodeShell(node, {
      ...opts,
      editable: false,
      actionsHTML: "",
      headerActionsHTML: "",
      fileTopbarActionsHTML: "",
      embedTopbarActionsHTML: "",
      settingsHTML: "",
    });
  }

  // ---------- Shared viewport navigation (canvas / dashboard / presentation / viewer) ----------
  const NAVIGATION_TUNING = Object.freeze({
    zoomLerpDesktop: 0.24,
    zoomLerpMobile: 0.16,
    wheelZoomSensitivity: 0.0032,
    wheelPanMultiplier: 1.35,
    pinchZoomExponentDesktop: 1.08,
    pinchZoomExponentMobile: 0.24,
  });

  /** Default min/max scale for presentation, shared viewer, and other full deck surfaces. */
  const DEFAULT_SPATIAL_SCALE_RANGE = Object.freeze({ min: 0.05, max: 5 });

  function isMobileViewport() {
    return (
      typeof global.innerWidth === "number" && global.innerWidth <= 820
    );
  }

  function normalizeWheelDelta(delta, deltaMode, pageSize) {
    if (deltaMode === 1) return delta * 16;
    if (deltaMode === 2) return delta * pageSize;
    return delta;
  }

  /**
   * One frame of smooth zoom toward targetScale; mutates offset toward zoomOrigin.
   * @returns {boolean} true when converged
   */
  function stepSmoothZoom({
    scale,
    targetScale,
    offset,
    zoomOrigin,
    scaleMin,
    scaleMax,
    lerpMobile = NAVIGATION_TUNING.zoomLerpMobile,
    lerpDesktop = NAVIGATION_TUNING.zoomLerpDesktop,
    isMobile = isMobileViewport(),
  }) {
    const diff = targetScale - scale;
    if (Math.abs(diff) < 0.0005) {
      const clamped = Math.max(
        scaleMin,
        Math.min(scaleMax, targetScale),
      );
      return {
        done: true,
        scale: clamped,
        targetScale: clamped,
        offset,
      };
    }
    const prev = scale;
    const nextScale =
      scale + diff * (isMobile ? lerpMobile : lerpDesktop);
    const ratio = nextScale / prev;
    return {
      done: false,
      scale: nextScale,
      targetScale,
      offset: {
        x: zoomOrigin.x - ratio * (zoomOrigin.x - offset.x),
        y: zoomOrigin.y - ratio * (zoomOrigin.y - offset.y),
      },
    };
  }

  /**
   * Transform-based pan + wheel zoom (ctrl/meta) + smooth zoom, with optional CSS grid vars on container.
   * @param {object} opts
   * @param {() => HTMLElement|null} opts.getContainer
   * @param {() => HTMLElement|null} opts.getWorld
   * @param {string|null} [opts.cssVarPrefix] e.g. "canvas" -> --canvas-scale
   * @param {number} [opts.scaleMin]
   * @param {number} [opts.scaleMax]
   * @param {() => HTMLElement|null} [opts.getZoomLevelEl]
   */
  function createSpatialViewport(opts) {
    const getContainer = opts.getContainer;
    const getWorld = opts.getWorld;
    const cssVarPrefix = opts.cssVarPrefix || null;
    const scaleMin = opts.scaleMin ?? 0.05;
    const scaleMax = opts.scaleMax ?? 5;
    const getZoomLevelEl = opts.getZoomLevelEl || null;

    const offset = {
      x: opts.initialOffset?.x ?? 0,
      y: opts.initialOffset?.y ?? 0,
    };
    let scale = opts.initialScale ?? 1;
    let targetScale =
      opts.initialTargetScale != null ? opts.initialTargetScale : scale;
    let isZooming = false;
    let raf = null;
    let zoomOrigin = { x: 0, y: 0 };
    let isPanning = false;
    let panStart = { x: 0, y: 0 };

    function apply() {
      const world = getWorld && getWorld();
      const container = getContainer && getContainer();
      if (world) {
        world.style.transform = `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`;
      }
      if (container && cssVarPrefix) {
        container.style.setProperty(`--${cssVarPrefix}-scale`, String(scale));
        container.style.setProperty(
          `--${cssVarPrefix}-grid-x`,
          `${offset.x}px`,
        );
        container.style.setProperty(
          `--${cssVarPrefix}-grid-y`,
          `${offset.y}px`,
        );
      }
      const zel = getZoomLevelEl && getZoomLevelEl();
      if (zel) zel.textContent = Math.round(scale * 100) + "%";
      if (typeof opts.onApply === "function") {
        opts.onApply({ offset, scale, targetScale, isZooming });
      }
    }

    function tickZoom() {
      const step = stepSmoothZoom({
        scale,
        targetScale,
        offset,
        zoomOrigin,
        scaleMin,
        scaleMax,
      });
      if (step.done) {
        scale = step.scale;
        targetScale = step.targetScale;
        isZooming = false;
        raf = null;
        apply();
        return;
      }
      scale = step.scale;
      offset.x = step.offset.x;
      offset.y = step.offset.y;
      apply();
      raf = global.requestAnimationFrame(tickZoom);
    }

    function startZoomLoop() {
      isZooming = true;
      if (raf) global.cancelAnimationFrame(raf);
      raf = global.requestAnimationFrame(tickZoom);
    }

    function wheel(e) {
      const container = getContainer && getContainer();
      if (!container) return;
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const wheelDeltaX = normalizeWheelDelta(
        e.deltaX,
        e.deltaMode,
        rect.width,
      );
      const wheelDeltaY = normalizeWheelDelta(
        e.deltaY,
        e.deltaMode,
        rect.height,
      );
      if (e.ctrlKey || e.metaKey) {
        zoomOrigin = { x: px, y: py };
        const baseScale = isZooming ? targetScale : scale;
        const zoomFactor = Math.exp(
          -wheelDeltaY * NAVIGATION_TUNING.wheelZoomSensitivity,
        );
        targetScale = Math.max(
          scaleMin,
          Math.min(scaleMax, baseScale * zoomFactor),
        );
        startZoomLoop();
        return;
      }
      offset.x -= wheelDeltaX * NAVIGATION_TUNING.wheelPanMultiplier;
      offset.y -= wheelDeltaY * NAVIGATION_TUNING.wheelPanMultiplier;
      apply();
    }

    return {
      getOffset: () => offset,
      getScale: () => scale,
      getTargetScale: () => targetScale,
      getIsZooming: () => isZooming,
      setState(ox, oy, sc, tsc) {
        offset.x = ox;
        offset.y = oy;
        scale = Math.max(scaleMin, Math.min(scaleMax, sc));
        targetScale = Math.max(scaleMin, Math.min(scaleMax, tsc));
      },
      setZoomOrigin(px, py) {
        zoomOrigin = { x: px, y: py };
      },
      apply,
      wheel,
      zoomByAdditive(delta, centerPx, centerPy) {
        zoomOrigin = { x: centerPx, y: centerPy };
        targetScale = Math.max(
          scaleMin,
          Math.min(scaleMax, targetScale + delta),
        );
        startZoomLoop();
      },
      beginPan(clientX, clientY) {
        isPanning = true;
        panStart = { x: clientX - offset.x, y: clientY - offset.y };
      },
      movePan(clientX, clientY) {
        if (!isPanning) return;
        offset.x = clientX - panStart.x;
        offset.y = clientY - panStart.y;
        apply();
      },
      endPan() {
        isPanning = false;
      },
      isPanningActive: () => isPanning,
      destroy() {
        if (raf) global.cancelAnimationFrame(raf);
        raf = null;
        isPanning = false;
        isZooming = false;
      },
    };
  }

  global.BEVCore = {
    SURFACES,
    SHARED_TEXT_TYPES,
    PRESENTATION_SPATIAL_SET,
    isUnifiedTextNoteType,
    canonicalObjectType,
    isSharedTextObjectType,
    isPresentationSpatialType,
    normalizeOverviewItemDataList,
    presentationObjectsFromRaw,
    createSharedTextObjectState,
    createSimpleLineItem,
    createQuickNoteFallbackItem,
    NAVIGATION_TUNING,
    isMobileViewport,
    normalizeWheelDelta,
    stepSmoothZoom,
    createSpatialViewport,
    DEFAULT_SPATIAL_SCALE_RANGE,
    renderNodeContentHTML,
    buildNodeShell,
    buildReadonlyNodeShell,
  };
})(typeof window !== "undefined" ? window : globalThis);
