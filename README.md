# TikTok Auto-Poster

[![CI](https://github.com/breakingthebot/tiktok-auto-poster/actions/workflows/ci.yml/badge.svg)](https://github.com/breakingthebot/tiktok-auto-poster/actions/workflows/ci.yml)

![Node.js](https://img.shields.io/badge/Node.js-334155?logo=node.js&logoColor=white) ![Google Cloud](https://img.shields.io/badge/Google_Cloud-4285F4?logo=googlecloud&logoColor=white) ![Cloud Run Functions](https://img.shields.io/badge/Cloud_Run_Functions-4285F4) ![Cloud Tasks](https://img.shields.io/badge/Cloud_Tasks-4285F4) ![Firestore](https://img.shields.io/badge/Firestore-4285F4) ![Secret Manager](https://img.shields.io/badge/Secret_Manager-4285F4) ![TikTok](https://img.shields.io/badge/TikTok-000000?logo=tiktok&logoColor=white) ![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

Pulls drafted video posts from a Firestore queue and publishes them to TikTok, on a schedule you configure yourself.

## Stack
- Node.js 22, `@google-cloud/functions-framework` (two Cloud Run Functions, 2nd gen, HTTP-triggered)
- `@google-cloud/firestore` — the content queue (drafted posts + their status)
- `@google-cloud/tasks` — per-post fan-out with retry, independent of other posts
- `@google-cloud/secret-manager` — credentials (no `.env` secrets)
- TikTok's real [Content Posting API](https://developers.tiktok.com/doc/content-posting-api-reference-direct-post) (Direct Post, `PULL_FROM_URL` mode)
- Cloud Scheduler (triggers Dispatch on a cron schedule you set, via OIDC auth)

## Setup
1. Install Node.js 20 or newer.
2. `npm install`
3. Copy `.env.example` to `.env` and fill in the non-secret values (see below — there's exactly one credential this app needs, and it does *not* go in `.env`).
4. You'll need a [TikTok Developer](https://developers.tiktok.com/) app with the Content Posting API scope approved, and an OAuth access token for the account you're posting to.

## Environment Variables
See `.env.example` for the full list with comments. Both functions read the same variables (even though each only uses a subset). Summary:
- `GCP_PROJECT_ID` — the project holding the Secret Manager secret, Cloud Tasks queue, and Firestore database.
- `TIKTOK_CLIENT_KEY` — your TikTok Developer app's client key (not secret, just an identifier).
- `TIKTOK_ACCESS_TOKEN_SECRET_ID` — the *name* of the Secret Manager secret holding the TikTok OAuth access token. The token itself is never an environment variable or a file on disk.
- `CLOUD_TASKS_QUEUE` / `CLOUD_TASKS_LOCATION` — the Cloud Tasks queue Dispatch enqueues into.
- `PUBLISH_FUNCTION_URL` — Publish's deployed URL, so Dispatch knows where to send tasks.
- `TASKS_INVOKER_SERVICE_ACCOUNT_EMAIL` — the service account Cloud Tasks uses to authenticate its calls to Publish (not secret, just an identifier).

## Running Locally
```bash
npm install
npm test
```

To boot either function locally (needs valid `gcloud` credentials and real GCP resources to fully succeed past the queue-read step):
```bash
npx functions-framework --target=dispatch --port=8080
# in another terminal:
curl -X POST http://localhost:8080/
```

There's no content-authoring flow in this build (see Notes) — to have something for Dispatch to find locally, seed one sample draft first:
```bash
node scripts/seed-sample-post.js
```

## Deployed
Not deployed yet. `deploy/deploy.sh` creates the Firestore database, Cloud Tasks queue, and TikTok secret (if missing), deploys Publish first (so its URL is known), then Dispatch, sets up a shared invoker service account, and creates the Cloud Scheduler job — in one script. Review the variables at the top of that file (project ID, region, posting schedule, timezone, your real TikTok client key) before running it.

## Data Handling
- The only credential this app uses is a TikTok OAuth access token, stored exclusively in Google Secret Manager — never in a file, environment variable dump, or log line.
- Publish's runtime service account is granted read-only access to that one secret (`roles/secretmanager.secretAccessor`) plus Firestore access (`roles/datastore.user`); Dispatch's runtime account is granted only `roles/cloudtasks.enqueuer` on its one queue plus the same Firestore access — nothing broader.
- Neither function is publicly invokable (`--no-allow-unauthenticated`); Cloud Scheduler and Cloud Tasks each authenticate via a dedicated OIDC-token-minting service account.
- Firestore stores only what you put in a draft: a caption, a video URL, a privacy level, and its publish status — no TikTok account credentials or personal data beyond what's in your own caption text.

## Architecture Notes
Two Cloud Run Functions, deployed from the same Node source directory via different `--entry-point` flags — the same pattern as build #3's Go Dispatch/Check split, applied here in Node:

- **Dispatch** — invoked by Cloud Scheduler at your configured posting times. Queries Firestore for every post with `status: "scheduled"` and `scheduledAt` at or before now, then enqueues one Cloud Task per due post targeting Publish. Doesn't publish anything itself.
- **Publish** — invoked by Cloud Tasks, once per due post. Re-reads the post from Firestore *by id* (never trusts the task payload's data directly, so it always acts on current state), fetches the TikTok access token from Secret Manager, and calls TikTok's real `init` endpoint in `PULL_FROM_URL` mode — TikTok fetches the video itself from the URL you provide, so this app never handles raw video bytes.

**The TikTok integration is real, not mocked.** `src/tiktokClient.js` builds the exact request TikTok's documented Content Posting API expects (`post_info` with `title`/`privacy_level`/`disable_duet`/`disable_comment`/`disable_stitch`, `source_info` with `PULL_FROM_URL` + `video_url`) and calls the real endpoint. It's not exercised end-to-end without a real TikTok Developer app and a verified access token, but the code itself isn't a stand-in — unlike some earlier builds where the core capability had no real target to call, TikTok's API is real and this calls it for real.

- `src/config.js` reads and validates all non-secret configuration. Fails fast with a clear error if anything required is missing.
- `src/contentQueue.js` is the only module that talks to Firestore for the queue: `getDuePosts()`, `getPostById()`, and status-marking helpers. Populating the queue (adding drafts) is intentionally out of scope — see Notes.
- `src/secrets.js` is the only module that talks to Secret Manager, injectable client for tests.
- `src/tasks.js` is the only module that talks to Cloud Tasks. Each enqueued task carries an OIDC token (`TASKS_INVOKER_SERVICE_ACCOUNT_EMAIL`) so Cloud Tasks' call to Publish actually authenticates.
- `src/dispatch.js`/`src/publish.js` each split into a `run*()` function (fully unit-testable with injected dependencies) and an exported HTTP handler (constructs the real GCP clients, wired to `functions-framework`).
- `index.js` (repo root) requires both, registering `dispatch` and `publish` — Cloud Functions' Node buildpack finds either by name via `--entry-point` at deploy time.

## Notes
- **No content-authoring flow.** This build is the poster, not the drafting tool — the queue is assumed to already have drafts in it. `scripts/seed-sample-post.js` adds one sample draft for local/manual testing; a real drafting UI (or just adding documents via the Firestore console) is how you'd populate it for real. Worth a future iteration if useful.
- **Peak posting times are yours to set, not a claimed "optimal" default.** `deploy/deploy.sh`'s `SCHEDULE` defaults to a plain 9am/1pm/7pm example — actual best posting times vary by audience/niche and would be a fake-authority claim to bake in as a default.
- **Not deployed yet.** Run `deploy/deploy.sh` once the target project is ready.
- **Verified with a real local boot, not just unit tests.** Ran `dispatch` via `functions-framework` locally and hit it with a real request. It correctly attempted the real Firestore query and hit the same stale-ADC-token error seen in builds #1-4 (expected, same root cause), logged it, and returned a clean `500`.
- A moderate `npm audit` finding (`uuid`, via `cloudevents` → `functions-framework`) was reviewed and left as-is: the vulnerable code path requires a caller-supplied buffer we never provide, and the suggested fix would downgrade `functions-framework` to an old major version — a real regression, not a fix.
- `AGENTS.md`, `BUILD_NOTES.md`, and `.claude/` are intentionally excluded from this repo (see `.gitignore`) — local build-process files, not part of the shipped functions.
