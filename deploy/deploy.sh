#!/usr/bin/env bash
# deploy/deploy.sh
# One-time-per-change deployment script: creates the Cloud Tasks queue
# (if missing), deploys Publish first (so its URL is known), then
# Dispatch, sets up a shared invoker service account, and
# creates/updates the Cloud Scheduler job. Reads its TikTok access token
# from the shared app-credentials Secret Manager secret (see
# GCP-Builds/06-api-keymaster) rather than creating its own dedicated
# secret.
#
# NOT run automatically -- review the variables below, make sure billing
# is active on the target project and app-credentials already has a
# "tiktok_access_token" key set, then run this yourself:
#   bash deploy/deploy.sh
#
# Connects to: index.js, src/dispatch.js, src/publish.js
# Created: 2026-07-13

set -euo pipefail

# ---- Review/edit these before running ----
PROJECT_ID="gen-lang-client-0538539687"
REGION="us-central1"
DISPATCH_FUNCTION_NAME="tiktok-poster-dispatch"
PUBLISH_FUNCTION_NAME="tiktok-poster-publish"
SCHEDULER_JOB_NAME="tiktok-poster-schedule"
# cron: minute hour day month weekday. Comma-separated hours = multiple
# times per day in one job. Default: 9am, 1pm, 7pm daily -- edit to your
# own posting schedule, there's no "correct" answer here, it's yours to set.
SCHEDULE="0 9,13,19 * * *"
TIME_ZONE="America/New_York"
CREDENTIALS_SECRET_ID="app-credentials"
TIKTOK_CREDENTIAL_KEY="tiktok_access_token"
CLOUD_TASKS_QUEUE="publish-posts"
INVOKER_SERVICE_ACCOUNT="tiktok-poster-invoker"

# Non-secret function config -- edit to your real TikTok Developer app's client key.
TIKTOK_CLIENT_KEY="aw_your_client_key"
# ---- End of editable section ----

echo "Setting active project to ${PROJECT_ID}..."
gcloud config set project "${PROJECT_ID}"

echo "Enabling required APIs (safe to re-run)..."
gcloud services enable \
  cloudfunctions.googleapis.com \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  cloudtasks.googleapis.com \
  cloudscheduler.googleapis.com \
  secretmanager.googleapis.com \
  firestore.googleapis.com

if ! gcloud firestore databases describe --database="(default)" >/dev/null 2>&1; then
  echo "Creating the default Firestore database (Native mode)..."
  gcloud firestore databases create --location="${REGION}" --type=firestore-native
else
  echo "Firestore database already exists -- leaving it alone."
fi

if ! gcloud tasks queues describe "${CLOUD_TASKS_QUEUE}" --location="${REGION}" >/dev/null 2>&1; then
  echo "Creating the Cloud Tasks queue..."
  gcloud tasks queues create "${CLOUD_TASKS_QUEUE}" --location="${REGION}"
else
  echo "Cloud Tasks queue ${CLOUD_TASKS_QUEUE} already exists -- leaving it alone."
fi

if ! gcloud secrets describe "${CREDENTIALS_SECRET_ID}" >/dev/null 2>&1; then
  echo "ERROR: Secret ${CREDENTIALS_SECRET_ID} does not exist yet."
  echo "Create it via GCP-Builds/06-api-keymaster/deploy/deploy.sh first (or manually)"
  echo "with a JSON blob that includes at least a \"${TIKTOK_CREDENTIAL_KEY}\" key, then re-run this script."
  exit 1
else
  echo "Secret ${CREDENTIALS_SECRET_ID} already exists -- leaving its value alone."
  echo "To add/rotate this build's key: fetch the current JSON, edit it, then:"
  echo "  printf '%s' '<full-updated-json>' | gcloud secrets versions add ${CREDENTIALS_SECRET_ID} --data-file=-"
fi

echo "Ensuring the shared invoker service account exists..."
if ! gcloud iam service-accounts describe \
  "${INVOKER_SERVICE_ACCOUNT}@${PROJECT_ID}.iam.gserviceaccount.com" >/dev/null 2>&1; then
  gcloud iam service-accounts create "${INVOKER_SERVICE_ACCOUNT}" \
    --display-name="TikTok Poster Invoker (Scheduler->Dispatch, Tasks->Publish)"
fi
INVOKER_EMAIL="${INVOKER_SERVICE_ACCOUNT}@${PROJECT_ID}.iam.gserviceaccount.com"

echo "Deploying Publish first (Dispatch needs its URL)..."
gcloud functions deploy "${PUBLISH_FUNCTION_NAME}" \
  --gen2 \
  --runtime=nodejs22 \
  --region="${REGION}" \
  --source=. \
  --entry-point=publish \
  --trigger-http \
  --no-allow-unauthenticated \
  --set-env-vars="GCP_PROJECT_ID=${PROJECT_ID},TIKTOK_CLIENT_KEY=${TIKTOK_CLIENT_KEY},CREDENTIALS_SECRET_ID=${CREDENTIALS_SECRET_ID},TIKTOK_CREDENTIAL_KEY=${TIKTOK_CREDENTIAL_KEY},CLOUD_TASKS_QUEUE=${CLOUD_TASKS_QUEUE},CLOUD_TASKS_LOCATION=${REGION},PUBLISH_FUNCTION_URL=placeholder,TASKS_INVOKER_SERVICE_ACCOUNT_EMAIL=${INVOKER_EMAIL}"

PUBLISH_URL=$(gcloud functions describe "${PUBLISH_FUNCTION_NAME}" \
  --region="${REGION}" --gen2 --format="value(serviceConfig.uri)")
echo "Publish URL: ${PUBLISH_URL}"

echo "Granting Publish's runtime account read access to the shared secret and Firestore..."
PUBLISH_SERVICE_ACCOUNT=$(gcloud functions describe "${PUBLISH_FUNCTION_NAME}" \
  --region="${REGION}" --gen2 --format="value(serviceConfig.serviceAccountEmail)")
gcloud secrets add-iam-policy-binding "${CREDENTIALS_SECRET_ID}" \
  --member="serviceAccount:${PUBLISH_SERVICE_ACCOUNT}" \
  --role="roles/secretmanager.secretAccessor"
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${PUBLISH_SERVICE_ACCOUNT}" \
  --role="roles/datastore.user" \
  --condition=None

echo "Granting the invoker account permission to call Publish..."
gcloud functions add-invoker-policy-binding "${PUBLISH_FUNCTION_NAME}" \
  --region="${REGION}" --gen2 \
  --member="serviceAccount:${INVOKER_EMAIL}"

echo "Deploying Dispatch, now that Publish's URL is known..."
gcloud functions deploy "${DISPATCH_FUNCTION_NAME}" \
  --gen2 \
  --runtime=nodejs22 \
  --region="${REGION}" \
  --source=. \
  --entry-point=dispatch \
  --trigger-http \
  --no-allow-unauthenticated \
  --set-env-vars="GCP_PROJECT_ID=${PROJECT_ID},TIKTOK_CLIENT_KEY=${TIKTOK_CLIENT_KEY},CREDENTIALS_SECRET_ID=${CREDENTIALS_SECRET_ID},TIKTOK_CREDENTIAL_KEY=${TIKTOK_CREDENTIAL_KEY},CLOUD_TASKS_QUEUE=${CLOUD_TASKS_QUEUE},CLOUD_TASKS_LOCATION=${REGION},PUBLISH_FUNCTION_URL=${PUBLISH_URL},TASKS_INVOKER_SERVICE_ACCOUNT_EMAIL=${INVOKER_EMAIL}"

DISPATCH_URL=$(gcloud functions describe "${DISPATCH_FUNCTION_NAME}" \
  --region="${REGION}" --gen2 --format="value(serviceConfig.uri)")
echo "Dispatch URL: ${DISPATCH_URL}"

echo "Granting Dispatch's runtime account permission to enqueue tasks and read Firestore..."
DISPATCH_SERVICE_ACCOUNT=$(gcloud functions describe "${DISPATCH_FUNCTION_NAME}" \
  --region="${REGION}" --gen2 --format="value(serviceConfig.serviceAccountEmail)")
gcloud tasks queues add-iam-policy-binding "${CLOUD_TASKS_QUEUE}" \
  --location="${REGION}" \
  --member="serviceAccount:${DISPATCH_SERVICE_ACCOUNT}" \
  --role="roles/cloudtasks.enqueuer"
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${DISPATCH_SERVICE_ACCOUNT}" \
  --role="roles/datastore.user" \
  --condition=None

echo "Granting the invoker account permission to call Dispatch..."
gcloud functions add-invoker-policy-binding "${DISPATCH_FUNCTION_NAME}" \
  --region="${REGION}" --gen2 \
  --member="serviceAccount:${INVOKER_EMAIL}"

echo "Creating/updating the Cloud Scheduler job..."
if gcloud scheduler jobs describe "${SCHEDULER_JOB_NAME}" --location="${REGION}" >/dev/null 2>&1; then
  gcloud scheduler jobs update http "${SCHEDULER_JOB_NAME}" \
    --location="${REGION}" \
    --schedule="${SCHEDULE}" \
    --time-zone="${TIME_ZONE}" \
    --uri="${DISPATCH_URL}" \
    --http-method=POST \
    --oidc-service-account-email="${INVOKER_EMAIL}" \
    --oidc-token-audience="${DISPATCH_URL}"
else
  gcloud scheduler jobs create http "${SCHEDULER_JOB_NAME}" \
    --location="${REGION}" \
    --schedule="${SCHEDULE}" \
    --time-zone="${TIME_ZONE}" \
    --uri="${DISPATCH_URL}" \
    --http-method=POST \
    --oidc-service-account-email="${INVOKER_EMAIL}" \
    --oidc-token-audience="${DISPATCH_URL}"
fi

echo "Done. Seed a sample post with: node scripts/seed-sample-post.js"
echo "Test it manually with:"
echo "  gcloud scheduler jobs run ${SCHEDULER_JOB_NAME} --location=${REGION}"
