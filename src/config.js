/*
 * src/config.js
 * Reads non-secret runtime configuration from environment variables. The
 * one credential this app needs (the TikTok access token) is never read
 * here -- only the shared credentials secret's resource name
 * (CREDENTIALS_SECRET_ID) and which key inside it holds this build's
 * token (TIKTOK_CREDENTIAL_KEY). Set these as Cloud Run Function
 * environment variables, never in a committed .env.
 * Connects to: dispatch.js, publish.js, secrets.js
 * Created: 2026-07-13
 */

const DEFAULT_CREDENTIALS_SECRET_ID = "app-credentials";
const DEFAULT_TIKTOK_CREDENTIAL_KEY = "tiktok_access_token";

class MissingConfigError extends Error {}

/**
 * @typedef {object} AppConfig
 * @property {string} gcpProjectId
 * @property {string} tiktokClientKey
 * @property {string} credentialsSecretId
 * @property {string} tiktokCredentialKey
 * @property {string} cloudTasksQueue
 * @property {string} cloudTasksLocation
 * @property {string} publishFunctionUrl
 * @property {string} tasksInvokerServiceAccountEmail
 */

/**
 * @param {string} name - The environment variable name.
 * @returns {string} The trimmed, non-empty value.
 */
function requireEnv(name) {
  const value = (process.env[name] || "").trim();
  if (!value) {
    throw new MissingConfigError(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Reads and validates all required configuration from environment variables.
 *
 * @returns {AppConfig} The loaded configuration.
 */
function loadConfig() {
  return {
    gcpProjectId: requireEnv("GCP_PROJECT_ID"),
    tiktokClientKey: requireEnv("TIKTOK_CLIENT_KEY"),
    credentialsSecretId: (process.env.CREDENTIALS_SECRET_ID || "").trim() || DEFAULT_CREDENTIALS_SECRET_ID,
    tiktokCredentialKey: (process.env.TIKTOK_CREDENTIAL_KEY || "").trim() || DEFAULT_TIKTOK_CREDENTIAL_KEY,
    cloudTasksQueue: requireEnv("CLOUD_TASKS_QUEUE"),
    cloudTasksLocation: requireEnv("CLOUD_TASKS_LOCATION"),
    publishFunctionUrl: requireEnv("PUBLISH_FUNCTION_URL"),
    tasksInvokerServiceAccountEmail: requireEnv("TASKS_INVOKER_SERVICE_ACCOUNT_EMAIL"),
  };
}

module.exports = { MissingConfigError, loadConfig };
