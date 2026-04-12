/* ============================================================
   BEV — Presentation Share Integration
   Drop-in replacements / additions for bev-app.js.

   These functions replace the share-link flow so it uses
   BEVViewer.buildShareUrl() and BEVViewer.copyToClipboard().
   ============================================================ */

/**
 * Generates (or reuses) a share token, publishes the presentation
 * to public_presentations/{token}, then copies the viewer URL.
 *
 * Replaces the original copyCurrentPresentationShareLink().
 */
async function copyCurrentPresentationShareLink() {
  if (!currentPresentation) return;

  // Ensure a share token exists
  if (!currentPresentation.shareToken) {
    currentPresentation.shareToken = makePresentationShareToken();
  }

  // Persist + publish to Firestore
  try {
    await savePresentationToFirestore(currentPresentation);
  } catch (e) {
    showToast('Could not publish presentation: ' + e.message);
    return;
  }

  // Build the viewer URL using the viewer module
  const shareUrl = BEVViewer.buildShareUrl(currentPresentation.shareToken);

  // Update privacy UI
  renderPresentationScreen();

  // Copy to clipboard (with execCommand fallback)
  const copied = await BEVViewer.copyToClipboard(shareUrl);

  if (copied) {
    showToast('Viewer link copied — share it with anyone');
  } else {
    // Last resort: prompt the user to copy manually
    window.prompt('Copy this viewer link and share it with anyone:', shareUrl);
  }
}

/**
 * Revoke a share link by clearing the token and deleting the
 * public Firestore document. Presentation becomes private again.
 */
async function revokeCurrentPresentationShareLink() {
  if (!currentPresentation?.shareToken) {
    showToast('This presentation has no active share link');
    return;
  }

  openConfirmDialog({
    title: 'Revoke Share Link',
    message: 'This will disable the viewer link. Anyone with the old URL will no longer be able to view it.',
    confirmLabel: 'Revoke',
    onConfirm: async () => {
      const token = currentPresentation.shareToken;
      currentPresentation.shareToken = null;

      // Delete the public document
      try {
        await publicPresentationRef(token).delete();
      } catch {}

      // Save the presentation without the token
      await savePresentationToFirestore(currentPresentation);
      renderPresentationScreen();
      showToast('Share link revoked');
    },
  });
}

/**
 * Build the public viewer URL for a given token.
 * Thin wrapper so the rest of bev-app.js can call this
 * without importing from viewer.js directly.
 */
function getSharedPresentationUrl(token) {
  return BEVViewer.buildShareUrl(token);
}

/* ── Presentation privacy UI update ─────────────────────── */

/**
 * Sync the privacy dot + label + pathbar status in the
 * presentation editor header.
 */
function updatePresentationPrivacyUI() {
  const dot       = document.getElementById('presentation-privacy-dot');
  const label     = document.getElementById('presentation-privacy-label');
  const pathStatus = document.getElementById('presentation-path-status');

  const shared = !!currentPresentation?.shareToken;

  if (dot) {
    dot.className = 'sync-dot ' + (shared ? 'shared' : 'private');
  }
  if (label) {
    label.textContent = shared ? 'Shared' : 'Private';
  }
  if (pathStatus) {
    pathStatus.textContent = shared ? 'Shared — anyone with the link can view' : 'Private Presentation';
  }
}
