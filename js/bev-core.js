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
  };
})(typeof window !== "undefined" ? window : globalThis);
