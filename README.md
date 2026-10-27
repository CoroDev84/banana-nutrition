# Banana Nutrition

A mobile-first food and fitness tracker with Google sign-in, a dated food diary, barcode scanning, nutrition targets, weight trends, walking history and strength goals.

This repository contains only the static mobile frontend. Authentication uses Firebase; authenticated data requests go to an existing Cloud Run API backed by Firestore. Each account has its own records. No backend deployment or database migration is included here.

## Files

- `index.html`: app entry point
- `login.html`: Google sign-in
- `nutrition-app.js`, `wellness-ui.js`, `nutrition.css`: interface and behavior
- `nutrition-firebase.js`, `nutrition-config.js`: browser authentication and API configuration
- `banana-nutrition.webmanifest`, `banana-mascot-v1-*.png`: home-screen name and icons

## GitHub Pages setup

1. Push this repository under the chosen GitHub owner with repository name `banana-nutrition`.
2. In repository Settings → Pages, deploy from branch `main`, folder `/ (root)`.
3. Add the exact owner.github.io hostname to Firebase Authentication's authorized domains.
4. Add the HTTPS origin for that hostname to the API's existing CORS_ALLOW_ORIGINS, preserving existing origins and other environment variables.
5. Keep ALLOWED_EMAILS explicitly empty on the API to allow all authenticated users. Removing that environment variable activates the backend's restricted default list.
6. Check any Firebase API-key website restrictions and Google sign-in branding for the new deployment. Do not broaden unrelated API access.
7. Test Google sign-in, food data, a goal save, camera/manual barcode lookup, and adding the app to a phone home screen at the Pages URL.

The app uses relative paths and supports the `/banana-nutrition/` Pages subdirectory. The existing app and this copy share accounts and data because they use the same backend. GitHub Pages does not run the Python backend. Never copy admin scripts, private exports, service account files, or secret API keys into this repository.

Firebase browser configuration is intentionally client-visible; it is not an admin credential. Backend authentication and authorization must remain enforced. External dependencies load from Google's Firebase CDN and, when needed, the barcode scanner CDN. No analytics SDK is loaded.

## Local preview

Run `python -m http.server 8000` in this directory and open `http://localhost:8000`. Local configuration expects an API on port 8080. Without a running configured API and authorized Firebase domain, this is a layout/source preview, not a functioning offline app.

## Status

Prepared as a fresh standalone repository. GitHub publication and new-domain authentication/CORS setup are pending selection of the GitHub owner. Existing live data is not copied into this repository.
