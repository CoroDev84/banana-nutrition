# Banana Nutrition

- This is the standalone mobile frontend only. Keep it independent of personal websites and desktop pages.
- Preserve relative paths so GitHub Pages project-site hosting works.
- Do not add personal names, emails, website links, exported health records or credentials to public files or commit metadata.
- Firebase client configuration is public browser configuration; admin credentials and third-party secret API keys belong on the backend only.
- Preserve Google authentication and per-account data separation. Backend is maintained separately.
- Preserve the white/gray/navy design, mascot icon, date-filtered food diary and existing barcode/favorites/saved-meal features.
- Workout scheduling and expanded BigQuery reporting are separate future tasks.

- Keep every Banana Nutrition change synchronized with the corresponding mobile app files in the html repository in the same session. Preserve each host's login/configuration paths. The shared backend stays in html; document backend-only integration/release changes here without copying server code or secrets. Verify both app copies before reporting completion.
