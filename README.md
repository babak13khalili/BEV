# BEV

Single-page Firebase + Firestore project mind map app.

## Local setup

1. Open `firebase-config.js`.
2. Replace `null` with your Firebase web app config object.
3. In Firebase Console, make sure these are enabled:
   - Authentication -> Sign-in method -> Google
   - Firestore Database
4. Open `BEV.html` in a browser.

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

For Firestore, this app reads and writes per signed-in user under:

- `users/{uid}/projects/{projectId}`

If your Firestore rules are still locked down, start with rules that allow each signed-in user to access only their own data.

```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/projects/{projectId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```
