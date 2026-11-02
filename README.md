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

## Google and GitHub sign-in

Google and GitHub are the only active providers. GitHub is enabled in nutrition-config.js following Firebase provider setup. The app uses Firebase popups and requests GitHub email access, not repository access. No passwords or provider secrets are stored here.

Existing users should sign in with Google first, then connect GitHub under Account > Sign-in methods. Linking keeps the original Firebase UID and records; credential conflicts never automatically merge or delete accounts. The original personal-site mobile version shares Firebase users/data but has a separate browser session.

Local source is ready for publication; this change has not been pushed or deployed. Deploy the prepared backend optional-email/profile-preservation update before publishing. Preserve explicitly empty ALLOWED_EMAILS and existing environment variables. Then push the reviewed frontend changes to the Pages branch and test real login/linking on mobile and desktop.

Run offline helper checks with: node tests/auth.test.cjs. Mocked checks do not replace real OAuth tests. Microsoft and Facebook are out of the current release.

## Saved barcode corrections — November 2, 2026

Implemented locally: `saved-products.js` converts consumed nutrition into one-serving corrections; the food form offers Save barcode correction separately from Save/Update Entry. Barcode lookups prefer the authenticated user's saved product over public API data. Explicit zeros and unknown optional nutrients persist. Previous diary entries, favorites and saved meals are not rewritten.

Requires the corresponding shared backend release: authenticated GET/PUT `/api/saved-products/{barcode}` and saved-product-first `/api/foods/lookup`. Firestore stores `users/{uid}/saved_products/{barcode padded to 14 digits}`; first save creates the collection. Backend also fixes per-100g fallback labels and mixed-basis optional nutrients, and allows clearing optional diary fields. No backend code or secrets belong in this static repository.

Deploy the shared backend first, then publish both mobile frontends. This work is local only: no push, deployment or live data change. Validate correction save/reload/repeated scan, consumed totals and account isolation after deployment. Run `node tests/saved-products.test.cjs` and `node tests/auth.test.cjs` for offline checks.

## Repository synchronization

Every future Banana Nutrition change must be reviewed and applied to the corresponding app files in both this repository and the html repository in the same session. Preserve site-specific login routes, metadata and hosting configuration. The backend remains shared and maintained separately in html; record backend-only integration/release changes here. The main roadmap contains the detailed working agreement.


## Deployment update — November 2, 2026

The shared backend release is now deployed as `nutrition-api-00017-9bj`, serving 100% of traffic. Health, saved-product route availability and unauthenticated rejection checks passed. Existing environment variables, IAM and service settings were preserved. This supersedes earlier backend-not-deployed notes. Both current mobile frontend releases still need publication, followed by authenticated save/reload/scan and account-isolation checks. No live product or diary records were changed by the deployment.
