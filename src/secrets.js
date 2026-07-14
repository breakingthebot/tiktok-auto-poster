/*
 * src/secrets.js
 * Thin wrapper around Google Secret Manager. This is the ONLY module that
 * fetches secret values -- callers pass a secret ID (a name, not a value)
 * and get the current version's plaintext back. Never log the returned
 * value.
 * getCredential() reads this service's one credential out of the shared
 * app-credentials JSON blob (see GCP-Builds/06-api-keymaster), so this
 * build doesn't need its own separate Secret Manager secret.
 * Connects to: config.js, publish.js
 * Created: 2026-07-13
 */

const { SecretManagerServiceClient } = require("@google-cloud/secret-manager");
const { logInfo } = require("./logger");

/**
 * Fetches a secret's plaintext value from Secret Manager.
 *
 * @param {string} projectId - The GCP project holding the secret.
 * @param {string} secretId - The secret's resource ID (name, not value).
 * @param {string} [version] - The secret version, defaults to "latest".
 * @param {{ accessSecretVersion: Function }} [client] - Injectable for tests, defaults to a real client.
 * @returns {Promise<string>} The decoded secret value.
 */
async function getSecret(projectId, secretId, version = "latest", client) {
  const secretClient = client || new SecretManagerServiceClient();
  const name = `projects/${projectId}/secrets/${secretId}/versions/${version}`;

  logInfo("secret_fetch_started", { secretId, version });
  const [response] = await secretClient.accessSecretVersion({ name });
  logInfo("secret_fetch_succeeded", { secretId, version });

  return response.payload.data.toString("utf8");
}

/**
 * Fetches one named credential out of the shared JSON-blob secret. The
 * blob is a flat JSON object of credential name -> value, consolidated
 * across builds so Secret Manager's 6-active-version free tier isn't
 * exhausted by giving every build its own secret.
 *
 * @param {string} projectId - The GCP project holding the secret.
 * @param {string} secretId - The shared credentials secret's resource ID.
 * @param {string} credentialKey - Which key inside the blob to return.
 * @param {{ accessSecretVersion: Function }} [client] - Injectable for tests.
 * @returns {Promise<string>} The requested credential value.
 */
async function getCredential(projectId, secretId, credentialKey, client) {
  const raw = await getSecret(projectId, secretId, "latest", client);

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Credentials secret '${secretId}' is not valid JSON: ${error.message}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Credentials secret '${secretId}' must be a JSON object of key-value pairs.`);
  }
  if (!(credentialKey in parsed)) {
    throw new Error(`Credentials secret '${secretId}' has no key named '${credentialKey}'.`);
  }
  return String(parsed[credentialKey]);
}

module.exports = { getSecret, getCredential };
