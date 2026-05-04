# BEV

Single-page Firebase + Firestore project mind map app.

## Local setup

1. Open `js/firebase-config.js`.
2. Set `window.BEV_FIREBASE_CONFIG` to your Firebase web app config object (or edit the existing fields).
3. In Firebase Console, make sure these are enabled:
   - Authentication -> Sign-in method -> Google
   - Firestore Database
4. Open `index.html` in a browser (or load the site root on GitHub Pages; it serves `index.html` automatically).

## GitHub Pages deployment

1. Create a new GitHub repository.
2. Push this folder to that repository.
3. In GitHub: `Settings -> Pages`.
4. Set:
   - Source: `Deploy from a branch`
   - Branch: `main`
   - Folder: `/ (root)`
5. Your site will publish at:
   - `https://<your-github-username>.github.io/<repo-name>/`
   - Or `https://<your-github-username>.github.io/` if the repo is named `<your-github-username>.github.io`

## Firebase settings for GitHub Pages

After you know your GitHub Pages URL, add the domain in Firebase:

1. Authentication -> Settings -> Authorized domains
2. Add:
   - `<your-github-username>.github.io`

## Cross-device sync

Everything that should follow the user across devices lives in Firestore
under the signed-in user's UID. Sign in on any device with the same Google
account and the app loads + listens to the same data via `onSnapshot`, so
edits propagate live (Miro-style) without a refresh.

```
users/{uid}/
  projects/{projectId}              ← canvas projects (nodes + connections)
  presentations/{presentationId}    ← presentation decks (items + objects)
  image_assets/{assetId}            ← image blobs split out of projects
  meta/dashboard                    ← dashboard overview cards + lines
  meta/workspace                    ← categories, sort order, UI prefs
  meta/todosDaily                   ← Daily To-Do widget state
  meta/todosGeneral                 ← General To-Do widget state

public_presentations/{shareToken}   ← anonymous viewer links
```

Only two things stay in `localStorage`, by design:

- `bev_fb_config` — Firebase project config (needed before any auth happens).
- `bev_last_view` — last screen + project the tab was on (per-device tab state).

On the first sign-in after upgrading from an older build, any legacy
`bev_workspace_prefs` / `bev_daily_todos` / `bev_general_todos` payloads are
migrated to `meta/*` once and then removed from `localStorage`.

### Firestore rules

```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/projects/{projectId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /users/{userId}/presentations/{presentationId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /users/{userId}/meta/{docId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /users/{userId}/image_assets/{assetId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /public_presentations/{shareToken} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
```
