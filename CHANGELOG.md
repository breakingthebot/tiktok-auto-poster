# Changelog

All notable changes to this project are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.2.0] - 2026-07-14
### Changed
- Retrofitted to read the TikTok access token from the shared `app-credentials` Secret Manager secret (see `api-keymaster`) instead of a dedicated `tiktok-access-token` secret, keeping this account under Secret Manager's 6-active-version free tier as more builds are added.
- `config.js`: `TIKTOK_ACCESS_TOKEN_SECRET_ID` replaced with `CREDENTIALS_SECRET_ID` (default `app-credentials`) and `TIKTOK_CREDENTIAL_KEY` (default `tiktok_access_token`).
- `secrets.js`: added `getCredential()`, which fetches the shared JSON blob and extracts one named key.
- `deploy/deploy.sh`: no longer creates a secret; fails fast with a clear message if `app-credentials` doesn't already exist.

## [0.1.0] - 2026-07-13
### Added
- Two Cloud Run Functions: `dispatch` (Scheduler-triggered, fans out one Cloud Task per due post) and `publish` (Cloud Tasks-triggered, calls TikTok's real Content Posting API and updates the post's status).
- `src/config.js` — environment-variable configuration with validation.
- `src/contentQueue.js` — Firestore-backed content queue (`getDuePosts`, `getPostById`, status-marking helpers), injectable client for tests.
- `src/tiktokClient.js` — real TikTok Content Posting API client (Direct Post, `PULL_FROM_URL` mode), injectable `fetch` for tests.
- `src/tasks.js` — Cloud Tasks enqueue wrapper with an OIDC token so Cloud Tasks authenticates against Publish.
- `src/secrets.js` — Secret Manager wrapper, injectable client for tests.
- `src/dispatch.js` / `src/publish.js` — each split into a fully unit-testable `run*()` function and an HTTP handler.
- `index.js` — registers both functions with `functions-framework`.
- `scripts/seed-sample-post.js` — adds one sample draft to Firestore for local/manual testing (queue population is otherwise out of scope for this build).
- `deploy/deploy.sh` — full deployment script (Firestore database, Cloud Tasks queue, TikTok secret, both functions in dependency order, shared invoker service account, Cloud Scheduler job), not yet run.
- 35 tests covering config validation, the content queue, the TikTok client's request shape, Cloud Tasks enqueueing (including the OIDC token), and both functions' orchestration/HTTP layers.
- GitHub Actions CI (`npm test` on every push/PR to `main`).
- MIT License, `.env.example`, `.gitignore`.
